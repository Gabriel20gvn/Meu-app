"""HTTP-side adapter. It dispatches a Cloud Run Job and never runs a background thread."""
import os

from google.cloud import firestore, storage, run_v2
from server.cloud_store import CloudStore, valid_id


class CloudJobs:
    def __init__(self, *, store=None, bucket=None, runner=None, job_name=None):
        project = os.environ.get('GOOGLE_CLOUD_PROJECT')
        self.store = store or CloudStore(firestore.Client(project=project), int(os.environ.get('COMPASSO_DAILY_LIMIT', '3')))
        self.bucket = bucket or storage.Client(project=project).bucket(os.environ['COMPASSO_BUCKET'])
        self.runner = runner or run_v2.JobsClient()
        self.job_name = job_name or os.environ['COMPASSO_RUN_JOB']

    def get(self, id):
        return self.store.get(id)

    def public(self, id):
        job = self.get(id)
        return {k: job.get(k) for k in ('id', 'state', 'error', 'code')}

    def create(self, payload, source=None):
        job, created = self.store.reserve(payload)
        id = job['id']
        if not created:
            return self.public(id)
        try:
            if source:
                self.bucket.blob(f'jobs/{id}/input.audio').upload_from_filename(str(source), timeout=120)
        except Exception:
            self.store.dispatch_failed(id)
            self._delete_input(id)
            raise RuntimeError('Não foi possível enviar o áudio ao armazenamento. Tente novamente.') from None
        try:
            # No overrides or service-account keys. A single pending job is claimed transactionally.
            # Disable automatic Run API retries: an ambiguous response must not fan out executions.
            self.runner.run_job(request={'name': self.job_name}, retry=None, timeout=30)
            self.store.mark_dispatched(id)
        except Exception:
            self.store.dispatch_failed(id, uncertain=True)
            self._delete_input(id)
            raise RuntimeError('Não foi possível confirmar o início da análise. Confira a configuração; uma tentativa pendente pode levar até 20 minutos para liberar a vaga.') from None
        return self.public(id)

    def _delete_input(self, id):
        try:
            self.bucket.blob(f'jobs/{valid_id(id)}/input.audio').delete(timeout=15)
        except Exception:
            pass  # Bucket lifecycle also removes abandoned objects.

    def cancel(self, id):
        self.store.cancel(id)
        self._delete_input(id)
        return self.public(id)

    def summary(self, id):
        return self.get(id).get('summary')

    def result(self, id):
        job = self.get(id)
        if job['state'] != 'completed':
            return None
        blob = self.bucket.blob(f'jobs/{valid_id(id)}/result.mid')
        blob.reload(timeout=15)
        if not blob.size or blob.size > 5*1024*1024:
            raise RuntimeError('O resultado não está disponível. Gere novamente.')
        return blob.download_as_bytes(timeout=30, if_generation_match=blob.generation)

    def close(self):
        pass  # Jobs survive API instance shutdowns and scale-to-zero.
