"""One durable job per Cloud Run execution; exit when finished, failed or cancelled."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time
import uuid

from google.cloud import firestore, storage
from server.cloud_store import CloudStore
from server.jobs import ACTIVE, STAGES, Jobs


def run(store, bucket, *, owner=None, timeout=570, interval=2, command=None, stop=None):
    owner = owner or os.environ.get('CLOUD_RUN_EXECUTION') or uuid.uuid4().hex
    stop = stop or threading.Event()
    id = store.pending_id()
    if not id:
        return
    job = store.claim(id, owner)
    if not job:
        return
    process = None
    input_blob = bucket.blob(f'jobs/{id}/input.audio')
    result_blob = bucket.blob(f'jobs/{id}/result.mid')
    result_uploaded = False
    completed = False
    deadline = min(time.monotonic()+timeout, time.monotonic()+(job['lease_until']-store.clock()).total_seconds()-5)
    try:
        with tempfile.TemporaryDirectory(prefix='compasso-') as path:
            folder = Path(path)
            (folder/'request.json').write_text(json.dumps(job['payload']))
            if job['payload']['source'] == 'upload':
                input_blob.reload(timeout=15)
                if not input_blob.size or input_blob.size > int(os.environ.get('COMPASSO_MAX_AUDIO_MB', '25'))*1024*1024:
                    raise ValueError('invalid input size')
                input_blob.download_to_filename(str(folder/'input.audio'), timeout=120, if_generation_match=input_blob.generation)
            if stop.is_set() or store.get(id)['state'] not in ACTIVE:
                store.finish(id, owner, 'cancelled', error='Análise cancelada.', code='cancelled')
                return
            args = command(folder) if command else [sys.executable, '-m', 'server.worker', str(folder)]
            process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            last_stage = 'preparing'
            while process.poll() is None:
                if stop.is_set() or store.get(id)['state'] not in ACTIVE:
                    Jobs.terminate(process)
                    store.finish(id, owner, 'cancelled', error='Análise cancelada.', code='cancelled')
                    return
                if time.monotonic() > deadline:
                    Jobs.terminate(process)
                    store.finish(id, owner, 'failed', error='A análise excedeu o limite do teste. Envie um trecho menor.', code='timeout')
                    return
                try:
                    stage = json.loads((folder/'progress.json').read_text()).get('stage')
                    if stage in STAGES and stage != last_stage:
                        store.stage(id, owner, stage)
                        last_stage = stage
                except (OSError, ValueError):
                    pass
                stop.wait(interval)
            if process.returncode or not (folder/'result.mid').is_file():
                try:
                    error = json.loads((folder/'error.json').read_text())
                except (OSError, ValueError):
                    error = {'message': 'O processamento foi interrompido. Tente um áudio menor.', 'code': 'processing_failed'}
                store.finish(id, owner, 'failed', error=error['message'], code=error['code'])
                return
            if store.get(id)['state'] not in ACTIVE or stop.is_set():
                store.finish(id, owner, 'cancelled', error='Análise cancelada.', code='cancelled')
                return
            summary = json.loads((folder/'summary.json').read_text())
            if (folder/'result.mid').stat().st_size > 5*1024*1024:
                raise ValueError('MIDI too large')
            result_blob.upload_from_filename(str(folder/'result.mid'), content_type='audio/midi', timeout=30)
            result_uploaded = True
            completed = store.finish(id, owner, 'completed', summary=summary)
    except Exception:
        if process:
            Jobs.terminate(process)
        store.finish(id, owner, 'failed', error='O servidor não conseguiu concluir a análise. Tente novamente ou envie outro áudio.', code='processing_failed')
    finally:
        if process:
            Jobs.terminate(process)
        for blob in [input_blob] + ([result_blob] if result_uploaded and not completed else []):
            try:
                blob.delete(timeout=15)
            except Exception:
                pass


def main():
    project = os.environ['GOOGLE_CLOUD_PROJECT']
    store = CloudStore(firestore.Client(project=project))
    bucket = storage.Client(project=project).bucket(os.environ['COMPASSO_BUCKET'])
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    run(store, bucket, stop=stop)


if __name__ == '__main__':
    main()
