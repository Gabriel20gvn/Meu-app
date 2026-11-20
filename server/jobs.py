"""Single-worker, persistent personal-use queue. Never runs inference in HTTP requests."""
import json
import os
from pathlib import Path
import shutil
import signal
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
from contextlib import contextmanager

ACTIVE = ('queued', 'preparing', 'transcribing', 'aligning')
STAGES = ('preparing', 'transcribing', 'aligning')


class BusyError(Exception):
    pass


class Jobs:
    def __init__(self, root, *, start=True, command=None, timeout=1800):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.db = self.root / 'jobs.sqlite3'
        self.lock = threading.RLock()
        self.stop = threading.Event()
        self.wake = threading.Event()
        self.timeout = timeout
        self.command = command or (lambda job, folder: [sys.executable, '-m', 'server.worker', str(folder)])
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, state TEXT, created REAL, updated REAL, payload TEXT, error TEXT, code TEXT)')
            db.execute("UPDATE jobs SET state='failed', error='O servidor reiniciou. Tente gerar novamente.', code='interrupted', updated=? WHERE state IN (?,?,?,?)", (time.time(), *ACTIVE))
        self.thread = None
        for orphan in self.root.glob('upload-*'):
            if orphan.is_file(): orphan.unlink(missing_ok=True)
        self.cleanup()
        if start:
            self.thread = threading.Thread(target=self.loop, daemon=True)
            self.thread.start()

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def folder(self, id):
        if not isinstance(id, str) or len(id) != 32 or any(c not in '0123456789abcdef' for c in id):
            raise KeyError(id)
        return self.root / id

    def get(self, id):
        self.folder(id)
        with self.connect() as db:
            row = db.execute('SELECT * FROM jobs WHERE id=?', (id,)).fetchone()
        if not row:
            raise KeyError(id)
        return dict(row)

    def public(self, id):
        job = self.get(id)
        return {key: job[key] for key in ('id', 'state', 'error', 'code')}

    def create(self, payload, source=None):
        with self.lock:
            self.cleanup()
            with self.connect() as db:
                count = db.execute('SELECT COUNT(*) FROM jobs WHERE state IN (?,?,?,?)', ACTIVE).fetchone()[0]
                if count >= 3:
                    raise BusyError('A fila está cheia. Aguarde uma análise terminar.')
                id = uuid.uuid4().hex
                folder = self.folder(id)
                folder.mkdir()
                try:
                    if source:
                        shutil.move(str(source), folder / 'input.audio')
                    (folder / 'request.json').write_text(json.dumps(payload))
                    now = time.time()
                    db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?)', (id, 'queued', now, now, json.dumps(payload), None, None))
                except Exception:
                    shutil.rmtree(folder, ignore_errors=True)
                    raise
            self.wake.set()
            return self.public(id)

    def update(self, id, state, error=None, code=None):
        with self.lock, self.connect() as db:
            db.execute("UPDATE jobs SET state=?,updated=?,error=?,code=? WHERE id=? AND state NOT IN ('cancelled','completed','failed')", (state, time.time(), error, code, id))

    def cancel(self, id):
        with self.lock:
            job = self.get(id)
            if job['state'] in ACTIVE:
                self.update(id, 'cancelled')
                if job['state'] == 'queued':
                    self.remove_inputs(id)
            return self.public(id)

    def remove_inputs(self, id):
        folder = self.folder(id)
        for path in folder.iterdir() if folder.exists() else []:
            # Keep only the result/summary; do not retain recordings or raw logs.
            if path.name in ('result.mid', 'summary.json'):
                continue
            if path.is_dir(): shutil.rmtree(path, ignore_errors=True)
            else: path.unlink(missing_ok=True)

    def cleanup(self):
        with self.lock, self.connect() as db:
            rows = db.execute('SELECT id,state,updated FROM jobs').fetchall()
            for row in rows:
                if row['state'] not in ACTIVE:
                    self.remove_inputs(row['id'])
                    if row['updated'] < time.time()-86400:
                        shutil.rmtree(self.folder(row['id']), ignore_errors=True)
                        db.execute('DELETE FROM jobs WHERE id=?', (row['id'],))

    @staticmethod
    def terminate(process):
        if process.poll() is None:
            try: os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError: return
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try: os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError: pass
                process.wait()

    def run(self, job):
        id, folder = job['id'], self.folder(job['id'])
        process = None
        try:
            with self.lock:
                if self.get(id)['state'] != 'queued': return
                self.update(id, 'preparing')
                process = subprocess.Popen(self.command(job, folder), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            deadline = time.monotonic()+self.timeout
            while process.poll() is None:
                if self.get(id)['state'] == 'cancelled' or self.stop.is_set():
                    self.terminate(process)
                    self.cancel(id)
                    return
                if time.monotonic() > deadline:
                    self.terminate(process)
                    self.update(id, 'failed', 'A análise excedeu o tempo limite. Tente um trecho menor.', 'timeout')
                    return
                try:
                    stage = json.loads((folder / 'progress.json').read_text()).get('stage')
                    if stage in STAGES and stage != self.get(id)['state']: self.update(id, stage)
                except (OSError, ValueError): pass
                self.stop.wait(.2)
            if self.get(id)['state'] == 'cancelled': return
            if process.returncode == 0 and (folder / 'result.mid').is_file():
                self.update(id, 'completed')
            else:
                try: detail = json.loads((folder / 'error.json').read_text())
                except (OSError, ValueError): detail = {}
                self.update(id, 'failed', detail.get('message', 'Não foi possível analisar esta música. Tente novamente.'), detail.get('code', 'processing_failed'))
        except Exception:
            if process: self.terminate(process)
            self.update(id, 'failed', 'O processamento foi interrompido. Tente novamente.', 'processing_failed')
        finally:
            self.remove_inputs(id)

    def loop(self):
        next_cleanup = time.monotonic()+60
        while not self.stop.is_set():
            if time.monotonic() >= next_cleanup:
                self.cleanup()
                next_cleanup = time.monotonic()+60
            with self.connect() as db:
                row = db.execute("SELECT * FROM jobs WHERE state='queued' ORDER BY created LIMIT 1").fetchone()
            if row:
                self.run(dict(row))
            else:
                self.wake.wait(1)
                self.wake.clear()

    def summary(self, id):
        try:
            return json.loads((self.folder(id)/'summary.json').read_text())
        except (OSError, ValueError):
            return None

    def result(self, id):
        path = self.folder(id)/'result.mid'
        if self.get(id)['state'] != 'completed' or not path.is_file():
            return None
        return path.read_bytes()

    def close(self):
        self.stop.set()
        self.wake.set()
        if self.thread: self.thread.join(timeout=8)
