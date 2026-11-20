"""Durable personal-use quota and job ownership, shared by API and Cloud Run Jobs."""
from datetime import datetime, timedelta, timezone
import uuid

from google.cloud import firestore
from server.jobs import ACTIVE, BusyError

LEASE_SECONDS = 1200


def valid_id(id):
    if not isinstance(id, str) or len(id) != 32 or any(c not in '0123456789abcdef' for c in id):
        raise KeyError(id)
    return id


class CloudStore:
    def __init__(self, db, daily_limit=3, clock=None):
        self.db = db
        self.daily_limit = daily_limit
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.control = db.collection('compasso_limits').document('personal')

    def ref(self, id):
        return self.db.collection('compasso_jobs').document(valid_id(id))

    def get(self, id):
        snapshot = self.ref(id).get()
        if not snapshot.exists:
            raise KeyError(id)
        job = snapshot.to_dict()
        if job['expires_at'] <= self.clock():
            raise KeyError(id)
        if job['state'] in ACTIVE and job['lease_until'] <= self.clock():
            self.expire(id)
            job = self.ref(id).get().to_dict()
        return job

    def reserve(self, payload):
        now = self.clock()
        day = now.date().isoformat()  # quota resets at 00:00 UTC (21:00 Brasília)
        id = uuid.uuid4().hex
        job = dict(id=id, state='queued', payload=payload, owner=None, dispatched=False,
                   created_at=now, lease_until=now+timedelta(seconds=LEASE_SECONDS),
                   expires_at=now+timedelta(days=1), error=None, code=None)

        @firestore.transactional
        def reserve(tx):
            control = self.control.get(transaction=tx).to_dict() or {}
            if control.get('active_id') and control['lease_until'] > now:
                active = self.ref(control['active_id']).get(transaction=tx).to_dict()
                # A retried YouTube submission reuses its job, never launches a second model.
                if active and active['state'] in ACTIVE and payload['source'] == 'youtube' and active['payload'] == payload:
                    return active, False
                raise BusyError('Já existe uma análise em andamento. Aguarde a conclusão ou o encerramento do cancelamento.')
            count = control.get('count', 0) if control.get('day') == day else 0
            if count >= self.daily_limit:
                raise BusyError(f'Limite de {self.daily_limit} tentativas por dia atingido. O limite renova às 21h de Brasília (00h UTC).')
            tx.set(self.control, dict(day=day, count=count+1, active_id=id, lease_until=job['lease_until']))
            tx.set(self.ref(id), job)
            return job, True
        return reserve(self.db.transaction())

    def mark_dispatched(self, id):
        self.ref(id).update({'dispatched': True})

    def pending_id(self):
        control = self.control.get().to_dict() or {}
        return control.get('active_id')

    def claim(self, id, owner):
        now = self.clock()
        @firestore.transactional
        def claim(tx):
            control = self.control.get(transaction=tx).to_dict() or {}
            job = self.ref(id).get(transaction=tx).to_dict()
            if not job or control.get('active_id') != id:
                return None
            if job['state'] not in ACTIVE and not job.get('owner'):
                tx.update(self.control, {'active_id': None})
                return None
            if job['state'] != 'queued' or job['lease_until'] <= now:
                return None
            tx.update(self.ref(id), {'state': 'preparing', 'owner': owner})
            return {**job, 'state': 'preparing', 'owner': owner}
        return claim(self.db.transaction())

    def stage(self, id, owner, state):
        @firestore.transactional
        def stage(tx):
            job = self.ref(id).get(transaction=tx).to_dict()
            if job and job['state'] in ACTIVE and job.get('owner') == owner:
                tx.update(self.ref(id), {'state': state})
        stage(self.db.transaction())

    def cancel(self, id):
        @firestore.transactional
        def cancel(tx):
            snapshot = self.ref(id).get(transaction=tx)
            if not snapshot.exists:
                raise KeyError(id)
            job = snapshot.to_dict()
            if job['state'] in ACTIVE:
                tx.update(self.ref(id), {'state': 'cancelled', 'error': 'Análise cancelada.', 'code': 'cancelled'})
            # The running worker releases this slot only after its subprocess stops.
        cancel(self.db.transaction())
        return self.get(id)

    def finish(self, id, owner, state, *, summary=None, error=None, code=None):
        @firestore.transactional
        def finish(tx):
            job = self.ref(id).get(transaction=tx).to_dict()
            control = self.control.get(transaction=tx).to_dict() or {}
            if not job or job.get('owner') != owner:
                return False
            accepted = job['state'] in ACTIVE
            if accepted:
                fields = dict(state=state, error=error, code=code)
                if summary is not None:
                    fields['summary'] = summary
                tx.update(self.ref(id), fields)
            if control.get('active_id') == id:
                tx.update(self.control, {'active_id': None})
            return accepted
        return finish(self.db.transaction())

    def dispatch_failed(self, id, *, uncertain=False):
        @firestore.transactional
        def fail(tx):
            job = self.ref(id).get(transaction=tx).to_dict()
            control = self.control.get(transaction=tx).to_dict() or {}
            if not job:
                return
            if job['state'] in ACTIVE:
                tx.update(self.ref(id), dict(state='failed', code='dispatch_failed',
                          error='Não foi possível iniciar a análise. Confira a configuração do servidor.'))
            # An ambiguous Run API response may have started an execution; keep its lease.
            if not uncertain and control.get('active_id') == id and not job.get('owner'):
                tx.update(self.control, {'active_id': None})
        fail(self.db.transaction())

    def expire(self, id):
        @firestore.transactional
        def expire(tx):
            job = self.ref(id).get(transaction=tx).to_dict()
            control = self.control.get(transaction=tx).to_dict() or {}
            if job and job['state'] in ACTIVE and job['lease_until'] <= self.clock():
                tx.update(self.ref(id), dict(state='failed', code='interrupted',
                          error='O processamento não concluiu no prazo. Tente um áudio menor.'))
                if control.get('active_id') == id:
                    tx.update(self.control, {'active_id': None})
        expire(self.db.transaction())
