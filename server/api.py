import hmac
import os
from pathlib import Path
import tempfile
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ConfigDict
from starlette.exceptions import HTTPException as StarletteHTTPException

from server.jobs import Jobs, BusyError

MAX_MB = int(os.environ.get('COMPASSO_MAX_AUDIO_MB', '80'))
MAX_BYTES = MAX_MB*1024*1024
MAX_MINUTES = int(os.environ.get('COMPASSO_MAX_AUDIO_SECONDS', '900'))//60


class AccessAndSize:
    def __init__(self, app, token):
        self.app, self.token = app, token

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http': return await self.app(scope, receive, send)
        headers = dict(scope['headers'])
        protected = scope['path'].startswith('/api/') and scope['path'] != '/api/health'
        if protected and scope['method'] != 'OPTIONS':
            if not hmac.compare_digest(headers.get(b'authorization', b''), ('Bearer '+self.token).encode()):
                return await JSONResponse({'detail': 'A chave de acesso ao processador é inválida.'}, status_code=401)(scope, receive, send)
        try: length = int(headers.get(b'content-length', b'0'))
        except ValueError: length = MAX_BYTES+2*1024*1024
        if length > MAX_BYTES+1024*1024:
            return await JSONResponse({'detail': f'O áudio deve ter até {MAX_MB} MB.'}, status_code=413)(scope, receive, send)
        total = 0
        async def limited_receive():
            nonlocal total
            message = await receive()
            total += len(message.get('body', b''))
            if total > MAX_BYTES+1024*1024:
                raise StarletteHTTPException(413, f'O áudio deve ter até {MAX_MB} MB.')
            return message
        await self.app(scope, limited_receive, send)


class JobRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    video_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{11}$')
    bpm: float | None = Field(default=None, ge=40, le=240, allow_inf_nan=False)


def create_app(root=None, token=None, *, manager=None):
    token = token or os.environ.get('COMPASSO_API_TOKEN', '')
    if len(token) < 24:
        raise RuntimeError('Configure COMPASSO_API_TOKEN com pelo menos 24 caracteres.')
    root = Path(root or os.environ.get('COMPASSO_DATA_DIR', '/tmp/compasso-jobs'))
    root.mkdir(parents=True, exist_ok=True)

    @asynccontextmanager
    async def lifespan(app):
        if manager:
            app.state.jobs = manager
        elif os.environ.get('COMPASSO_BACKEND') == 'cloud-run':
            from server.cloud_jobs import CloudJobs
            app.state.jobs = CloudJobs()
        else:
            app.state.jobs = Jobs(root)
        yield
        app.state.jobs.close()

    app = FastAPI(title='Compasso · processador pessoal', lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(AccessAndSize, token=token)
    origins = os.environ.get('COMPASSO_ALLOWED_ORIGINS', 'https://gabriel20gvn.github.io,http://localhost:5173,http://127.0.0.1:5173').split(',')
    app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in origins if o.strip()], allow_methods=['GET','POST','DELETE','OPTIONS'], allow_headers=['Authorization','Content-Type'], max_age=600)

    @app.get('/api/health')
    def health(): return {'status': 'ok'}

    @app.get('/api/connection')
    def connection(): return {'status': 'ok', 'meter': '4/4', 'max_audio_mb': MAX_MB, 'max_minutes': MAX_MINUTES}

    def create(payload, source=None):
        try: return app.state.jobs.create(payload, source)
        except BusyError as e: raise HTTPException(429, str(e)) from e
        except RuntimeError as e: raise HTTPException(503, str(e)) from e

    @app.post('/api/jobs', status_code=202)
    def generate(body: JobRequest):
        return create({'source': 'youtube', 'video_id': body.video_id, 'bpm': body.bpm})

    @app.post('/api/jobs/upload', status_code=202)
    async def upload(video_id: str = Form(...), bpm: str = Form(''), audio: UploadFile = File(...)):
        try: validated = JobRequest(video_id=video_id, bpm=float(bpm) if bpm.strip() else None)
        except (ValueError, TypeError): raise HTTPException(422, 'Confira o link e o BPM (40 a 240).')
        if Path(audio.filename or '').suffix.lower() not in ('.mp3', '.wav'):
            raise HTTPException(422, 'Use um arquivo MP3 ou WAV da mesma gravação.')
        path = None
        try:
            with tempfile.NamedTemporaryFile(dir=root, prefix='upload-', delete=False) as stream:
                path = Path(stream.name)
                size = 0
                while chunk := await audio.read(1024*1024):
                    size += len(chunk)
                    if size > MAX_BYTES: raise HTTPException(413, f'O áudio deve ter até {MAX_MB} MB.')
                    stream.write(chunk)
            if not size: raise HTTPException(422, 'O arquivo está vazio.')
            return create({'source': 'upload', 'video_id': validated.video_id, 'bpm': validated.bpm}, path)
        finally:
            await audio.close()
            if path: path.unlink(missing_ok=True)

    def get(id):
        try: return app.state.jobs.get(id)
        except KeyError: raise HTTPException(404, 'Esta análise não está mais disponível. Gere novamente.')

    @app.get('/api/jobs/{id}')
    def status(id: str):
        job = get(id)
        value = {key: job[key] for key in ('id','state','error','code')}
        if job['state'] == 'completed':
            value['summary'] = app.state.jobs.summary(id)
        return value

    @app.delete('/api/jobs/{id}')
    def cancel(id: str):
        get(id)
        return app.state.jobs.cancel(id)

    @app.get('/api/jobs/{id}/result')
    def result(id: str):
        job = get(id)
        if job['state'] != 'completed':
            raise HTTPException(409, 'A partitura ainda não está pronta.')
        try:
            data = app.state.jobs.result(id)
        except Exception:
            raise HTTPException(503, 'Não foi possível recuperar o MIDI. Tente novamente.')
        if data is None:
            raise HTTPException(409, 'A partitura ainda não está pronta.')
        return Response(data, media_type='audio/midi', headers={'Content-Disposition': 'attachment; filename=bateria-automatica.mid'})

    static = Path(os.environ.get('COMPASSO_STATIC_DIR', 'dist-single'))
    if static.is_dir(): app.mount('/', StaticFiles(directory=static, html=True), name='app')
    return app
