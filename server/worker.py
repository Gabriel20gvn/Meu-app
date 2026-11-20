"""Real ADTOF + madmom pipeline, isolated per job so cancellation frees memory."""
import collections
import collections.abc
import json
import os
from pathlib import Path
import subprocess
import sys

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '-1')
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '3')
os.environ.setdefault('TF_NUM_INTRAOP_THREADS', '2')
os.environ.setdefault('TF_NUM_INTEROP_THREADS', '2')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')
os.environ.setdefault('OMP_NUM_THREADS', '2')
collections.MutableSequence = collections.abc.MutableSequence
MAX_BYTES = 80 * 1024 * 1024
MAX_SECONDS = 900


class ProcessingError(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message
        super().__init__(message)


def write_json(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value))
    tmp.replace(path)


def prepare(folder, request):
    source = folder / 'input.audio'
    title = 'Música analisada'
    if request['source'] == 'youtube':
        import yt_dlp
        def check(info, *, incomplete=False):
            if info.get('is_live'):
                raise ProcessingError('live_video', 'Use uma gravação finalizada; transmissões ao vivo não são suportadas.')
            duration = info.get('duration')
            if duration is not None and duration > MAX_SECONDS:
                raise ProcessingError('duration_limit', 'Use uma gravação de até 15 minutos.')
            return None
        def size_guard(info):
            if info.get('downloaded_bytes', 0) > MAX_BYTES:
                raise ProcessingError('audio_too_large', 'O áudio excede 80 MB. Envie um trecho menor.')
        options = {
            'format': 'bestaudio/best', 'noplaylist': True,
            'outtmpl': str(folder / 'download.%(ext)s'),
            'max_filesize': MAX_BYTES, 'match_filter': check,
            'progress_hooks': [size_guard], 'socket_timeout': 20, 'retries': 2,
            'quiet': True, 'no_warnings': True,
            'js_runtimes': {'deno': {}},
        }
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info('https://www.youtube.com/watch?v='+request['video_id'], download=True)
                if not info: raise ValueError('No video')
                source = Path(ydl.prepare_filename(info))
                title = str(info.get('title') or title)[:200]
        except ProcessingError: raise
        except Exception as e:
            raise ProcessingError('youtube_unavailable', 'O YouTube não liberou o áudio. Envie um MP3 ou WAV da mesma gravação para continuar.') from e
    if not source.is_file() or source.stat().st_size > MAX_BYTES:
        raise ProcessingError('invalid_audio', 'Selecione um áudio de até 80 MB.')
    try:
        probe = subprocess.run(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration', '-of', 'json', str(source)], capture_output=True, text=True, check=True, timeout=30)
        duration = float(json.loads(probe.stdout)['format']['duration'])
        if not 5 <= duration <= MAX_SECONDS:
            raise ProcessingError('duration_limit', 'Use um áudio entre 5 segundos e 15 minutos.')
        audio = folder / 'audio.wav'
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', str(source), '-vn', '-ac', '1', '-ar', '44100', '-t', str(MAX_SECONDS), str(audio)], capture_output=True, check=True, timeout=120)
        return audio, title
    except ProcessingError: raise
    except Exception as e:
        raise ProcessingError('invalid_audio', 'Não foi possível ler o áudio. Use um MP3 ou WAV válido.') from e


def process(folder):
    request = json.loads((folder / 'request.json').read_text())
    progress = lambda stage: write_json(folder / 'progress.json', {'stage': stage})
    progress('preparing')
    audio, title = prepare(folder, request)
    progress('transcribing')
    from adtof.model.model import Model
    model, hparams = Model.modelFactory(modelName='Frame_RNN', scenario='adtofAll', fold=0)
    if not model.weightLoadedFlag:
        raise ProcessingError('model_unavailable', 'Os pesos da IA não estão instalados no servidor.')
    output = folder / 'notes'
    model.predictFolder(str(audio), str(output), writeMidi=False, **hparams)
    texts = list(output.glob('*.txt'))
    if len(texts) != 1 or not texts[0].read_text().strip():
        raise ProcessingError('no_drums', 'A IA não encontrou uma transcrição de bateria utilizável neste áudio.')
    # Release TensorFlow allocations before the second model where possible.
    del model
    import tensorflow as tf
    tf.keras.backend.clear_session()
    import gc
    gc.collect()
    progress('aligning')
    from colab.auto_rhythm import detect_and_export
    try:
        result = detect_and_export(audio, texts[0], folder / 'result.mid', bpm_hint=request.get('bpm'))
    except ValueError as e:
        raise ProcessingError('rhythm_failed', str(e)) from e
    if result['bars'] > 500 or result['notes'] > 20000:
        raise ProcessingError('score_too_large', 'A partitura excede 500 compassos ou 20 mil notas. Envie um trecho menor.')
    write_json(folder / 'summary.json', {'title': title, 'bpm': result['median_bpm'], 'bars': result['bars'], 'notes': result['notes']})


if __name__ == '__main__':
    directory = Path(sys.argv[1])
    try: process(directory)
    except ProcessingError as e:
        write_json(directory / 'error.json', {'code': e.code, 'message': e.message})
        sys.exit(1)
    except Exception:
        write_json(directory / 'error.json', {'code': 'processing_failed', 'message': 'O servidor não conseguiu concluir a análise. Tente novamente ou envie outro áudio.'})
        sys.exit(1)
