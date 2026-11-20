"""Cloud contract without a paid project or real Google credentials."""
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from server.api import create_app
from server.cloud_jobs import CloudJobs
from server.cloud_store import CloudStore
from server.cloud_worker import run

TOKEN = 'test-only-cloud-token-32-characters'
VIDEO = 'dQw4w9WgXcQ'
MIDI = bytes.fromhex('4d546864000000060000000101e04d54726b0000000c00903c4010783c0000ff2f00')


class Snapshot:
    def __init__(self, value):
        self.value = deepcopy(value)
        self.exists = value is not None
    def to_dict(self):
        return deepcopy(self.value)


class Ref:
    def __init__(self, db, key):
        self.db, self.key = db, key
    def get(self, transaction=None):
        return Snapshot(self.db.rows.get(self.key))
    def update(self, fields):
        self.db.rows[self.key].update(deepcopy(fields))


class Collection:
    def __init__(self, db, name):
        self.db, self.name = db, name
    def document(self, id):
        return Ref(self.db, (self.name, id))


class Transaction:
    def __init__(self, db):
        self.db = db
    def set(self, ref, value):
        self.db.rows[ref.key] = deepcopy(value)
    def update(self, ref, value):
        ref.update(value)


class Database:
    def __init__(self):
        self.rows, self.lock = {}, threading.RLock()
    def collection(self, name):
        return Collection(self, name)
    def transaction(self):
        return Transaction(self)


def transactional(function):
    def call(tx):
        with tx.db.lock:
            return function(tx)
    return call


class Blob:
    def __init__(self, bucket, name):
        self.bucket, self.name, self.generation = bucket, name, 1
    def upload_from_filename(self, path, **kwargs):
        self.bucket.objects[self.name] = Path(path).read_bytes()
    def reload(self, **kwargs):
        self.size = len(self.bucket.objects[self.name])
    def download_to_filename(self, path, **kwargs):
        Path(path).write_bytes(self.bucket.objects[self.name])
    def download_as_bytes(self, **kwargs):
        return self.bucket.objects[self.name]
    def delete(self, **kwargs):
        self.bucket.objects.pop(self.name, None)


class Bucket:
    def __init__(self):
        self.objects = {}
    def blob(self, name):
        return Blob(self, name)


class Runner:
    def __init__(self, fail=False):
        self.calls, self.fail = [], fail
    def run_job(self, **kwargs):
        self.calls.append(kwargs)
        if self.fail:
            raise RuntimeError('ambiguous dispatch')


def score_command(folder):
    script = "from pathlib import Path; import sys; p=Path(sys.argv[1]); (p/'result.mid').write_bytes(bytes.fromhex(sys.argv[2])); (p/'summary.json').write_text('{\"title\":\"Teste\",\"notes\":1,\"bars\":1,\"bpm\":120}')"
    return [sys.executable, '-c', script, str(folder), MIDI.hex()]


class CloudTests(unittest.TestCase):
    def setUp(self):
        self.patch = patch('server.cloud_store.firestore.transactional', transactional)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.db = Database()
        now = datetime(2026, 11, 20, 12, tzinfo=timezone.utc)
        self.store = CloudStore(self.db, clock=lambda: now)
        self.bucket, self.runner = Bucket(), Runner()
        self.jobs = CloudJobs(store=self.store, bucket=self.bucket, runner=self.runner, job_name='projects/demo-compasso/locations/us-central1/jobs/test')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.client = TestClient(create_app(self.tmp.name, TOKEN, manager=self.jobs))
        self.client.__enter__()
        self.addCleanup(lambda: self.client.__exit__(None, None, None))
        self.auth = {'Authorization': 'Bearer '+TOKEN}

    def post(self, bpm=100):
        return self.client.post('/api/jobs', json={'video_id': VIDEO, 'bpm': bpm}, headers=self.auth)

    def test_api_to_worker_result_is_durable_and_private(self):
        first = self.post()
        self.assertEqual(first.status_code, 202)
        id = first.json()['id']
        self.assertEqual(self.post().json()['id'], id)
        self.assertEqual(len(self.runner.calls), 1)
        self.assertEqual(self.post(101).status_code, 429)
        self.assertEqual(self.client.get('/api/jobs/'+id+'/result', headers=self.auth).status_code, 409)
        run(self.store, self.bucket, owner='first-execution', command=score_command, interval=.01)
        self.assertEqual(self.client.get('/api/jobs/'+id, headers=self.auth).json()['state'], 'completed')
        self.assertEqual(self.client.get('/api/jobs/'+id+'/result').status_code, 401)
        self.assertEqual(self.client.get('/api/jobs/'+id+'/result', headers=self.auth).content, MIDI)
        self.assertEqual(self.client.get('/api/jobs/'+id, headers=self.auth).json()['summary']['notes'], 1)
        self.assertFalse(any(key.endswith('input.audio') for key in self.bucket.objects))
        self.assertEqual(self.bucket.objects[f'jobs/{id}/result.mid'], MIDI)
        self.assertEqual(self.store.pending_id(), None)

    def test_upload_cancel_and_daily_limit(self):
        with patch('server.api.MAX_BYTES', 25*1024*1024):
            response = self.client.post('/api/jobs/upload', headers=self.auth, data={'video_id':VIDEO}, files={'audio':('same.wav', b'fake test recording')})
        self.assertEqual(response.status_code, 202)
        id = response.json()['id']
        self.assertIn(f'jobs/{id}/input.audio', self.bucket.objects)
        self.assertEqual(self.client.delete('/api/jobs/'+id, headers=self.auth).json()['state'], 'cancelled')
        self.assertNotIn(f'jobs/{id}/input.audio', self.bucket.objects)
        self.assertEqual(self.post(101).status_code, 429)  # slot held until worker acknowledges
        run(self.store, self.bucket, owner='cancelled-execution', command=score_command)
        self.assertEqual(self.store.pending_id(), None)
        for bpm in (101,102):
            self.assertEqual(self.post(bpm).status_code, 202)
            run(self.store, self.bucket, owner=str(bpm), command=score_command, interval=.01)
        fourth = self.post(103)
        self.assertEqual(fourth.status_code, 429)
        self.assertIn('3 tentativas', fourth.json()['detail'])

    def test_ambiguous_dispatch_does_not_create_an_untracked_execution(self):
        self.runner.fail = True
        response = self.post()
        self.assertEqual(response.status_code, 503)
        id = self.store.pending_id()
        self.assertEqual(self.store.get(id)['state'], 'failed')
        self.assertEqual(self.post(101).status_code, 429)
        run(self.store, self.bucket, owner='late-execution', command=score_command)
        self.assertIsNone(self.store.pending_id())
        self.runner.fail = False
        self.assertEqual(self.post(101).status_code, 202)

    def test_expired_worker_reservation_releases_slot(self):
        id = self.post().json()['id']
        now = self.store.clock()
        self.store.clock = lambda: now+timedelta(minutes=21)
        self.assertEqual(self.store.get(id)['code'], 'interrupted')
        self.assertEqual(self.post(101).status_code, 202)
        self.assertIsNone(self.store.claim(id, 'late-execution'))


if __name__ == '__main__':
    unittest.main()
