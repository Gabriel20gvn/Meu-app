"""Align ADTOF attacks to detected 4/4 beats without moving audio timestamps.

The MIDI marker carries the time of tick zero in the source recording. Compasso
applies it on import. Tempo events preserve detected beat times, including tempo
changes; attacks are not quantized here. Compasso's display uses sixteenths.
"""
import json
import math
from pathlib import Path

import numpy as np
from mido import MidiFile, MidiTrack, Message, MetaMessage

PPQ = 960
MARKER = 'COMPASSO_SYNC_V1:'


def extrapolate(values, xp, fp):
    values = np.asarray(values, dtype=float)
    out = np.interp(values, xp, fp)
    before, after = values < xp[0], values > xp[-1]
    out[before] = fp[0] + (values[before]-xp[0]) * (fp[1]-fp[0])/(xp[1]-xp[0])
    out[after] = fp[-1] + (values[after]-xp[-1]) * (fp[-1]-fp[-2])/(xp[-1]-xp[-2])
    return out


def export_aligned(notes, beats, output):
    notes, beats = np.asarray(notes, dtype=float), np.asarray(beats, dtype=float)
    if notes.ndim != 2 or notes.shape[1] != 2 or not 1 <= len(notes) <= 20000:
        raise ValueError('A transcrição deve conter de 1 a 20 mil golpes.')
    if not np.isfinite(notes).all() or np.any(notes[:, 0] < 0):
        raise ValueError('Transcrição com tempos inválidos.')
    if not np.isin(notes[:, 1], [35, 38, 42, 47, 49]).all():
        raise ValueError('Este exportador espera as cinco classes do ADTOF.')
    if beats.ndim != 2 or beats.shape[1] != 2 or len(beats) < 8 or not np.isfinite(beats).all():
        raise ValueError('Não foi possível identificar pelo menos dois compassos.')
    if np.any(np.diff(beats[:, 0]) <= 0) or not np.isin(beats[:, 1], [1, 2, 3, 4]).all():
        raise ValueError('O mapa de compassos detectado é inválido.')
    if not np.all((np.diff(beats[:, 1]) % 4) == 1):
        raise ValueError('A detecção deixou lacunas nos tempos. O alinhamento não é confiável.')

    # Coordinates are quarter notes, anchored to the tracker's downbeats.
    coordinates = np.arange(len(beats)) + beats[0, 1] - 1
    notes = notes[np.argsort(notes[:, 0], kind='stable')]
    musical_positions = extrapolate(notes[:, 0], beats[:, 0], coordinates)
    # Number bars from the recording's beginning, not from the first drum hit.
    # Otherwise a 12-bar intro disappears and becomes a large playback offset.
    # Retain pickup notes too, even if that requires a bar starting before zero.
    epsilon = 1e-9
    position_at_zero = float(extrapolate([0], beats[:, 0], coordinates)[0])
    first_at_audio = math.ceil((position_at_zero-epsilon)/4) * 4
    first_at_notes = math.floor((float(np.min(musical_positions))+epsilon)/4) * 4
    first = min(first_at_audio, first_at_notes)
    last = math.floor((float(np.max(musical_positions))+epsilon)/4) * 4 + 4
    if (last-first)//4 > 500:
        raise ValueError('A música excede o limite atual de 500 compassos do app.')
    boundaries = extrapolate(np.arange(first, last+1), coordinates, beats[:, 0])
    offset = float(boundaries[0])
    if abs(offset) > 1800:
        raise ValueError('Alinhamento fora do limite de 30 minutos do app.')

    midi = MidiFile(ticks_per_beat=PPQ)
    metadata, drums = MidiTrack(), MidiTrack()
    midi.tracks.extend([metadata, drums])
    metadata.append(MetaMessage('track_name', name='Compasso · alinhamento automático', time=0))
    metadata.append(MetaMessage('marker', text=MARKER + f'{offset:.6f}', time=0))
    metadata.append(MetaMessage('time_signature', numerator=4, denominator=4, time=0))
    previous_tick, previous_tempo = 0, None
    for i, seconds in enumerate(np.diff(boundaries)):
        tempo = round(float(seconds)*1_000_000)
        if not 1 <= tempo <= 16777215:
            raise ValueError('Andamento detectado fora do intervalo MIDI.')
        if tempo != previous_tempo:
            metadata.append(MetaMessage('set_tempo', tempo=tempo, time=i*PPQ-previous_tick))
            previous_tick, previous_tempo = i*PPQ, tempo
    metadata.append(MetaMessage('end_of_track', time=0))

    events = []
    durations = np.full(len(notes), 0.03)
    next_by_pitch = {}
    for i in range(len(notes)-1, -1, -1):
        seconds, pitch = notes[i]
        if pitch in next_by_pitch:
            durations[i] = min(0.03, max(0.001, (next_by_pitch[pitch]-seconds)/2))
        next_by_pitch[pitch] = seconds
    for i, ((seconds, pitch), position) in enumerate(zip(notes, musical_positions)):
        start = round((position-first)*PPQ)
        duration = durations[i]
        end_position = extrapolate([seconds+max(duration, 0.001)], beats[:, 0], coordinates)[0]
        end = max(start+1, round((end_position-first)*PPQ))
        events.extend([(start, 1, int(pitch)), (end, 0, int(pitch))])
    previous_tick = 0
    for tick, on, pitch in sorted(events):
        drums.append(Message('note_on' if on else 'note_off', channel=9, note=pitch,
                             velocity=90 if on else 0, time=tick-previous_tick))
        previous_tick = tick
    drums.append(MetaMessage('end_of_track', time=0))
    midi.save(output)
    return {'offset': offset, 'median_bpm': float(60/np.median(np.diff(beats[:, 0]))),
            'notes': len(notes), 'bars': (last-first)//4,
            'leading_bars': (first_at_notes-first)//4,
            'extrapolated_notes': int(np.sum((notes[:, 0] < beats[0, 0]) | (notes[:, 0] > beats[-1, 0])))}


def detect_and_export(audio, transcription, output):
    import collections
    import collections.abc
    collections.MutableSequence = collections.abc.MutableSequence
    from madmom.features.downbeats import RNNDownBeatProcessor, DBNDownBeatTrackingProcessor
    # RNNDownBeatProcessor reads MP3/WAV via madmom/FFmpeg, not soundfile.
    print('Identificando a pulsação e o início dos compassos em 4/4…', flush=True)
    activations = RNNDownBeatProcessor(num_threads=1)(str(audio))
    if len(activations) < 500 or not np.isfinite(activations).all():
        raise ValueError('Áudio insuficiente para identificar os compassos.')
    beats = DBNDownBeatTrackingProcessor(beats_per_bar=[4], fps=100,
                                        min_bpm=40, max_bpm=240, num_threads=1)(activations)
    if len(beats) < 8:
        raise ValueError('A análise não encontrou pulsação suficiente. Nenhum alinhamento foi aplicado.')
    notes = np.loadtxt(transcription, ndmin=2)
    result = export_aligned(notes, beats, output)
    Path(output).with_suffix('.ritmo.json').write_text(json.dumps(
        {'source_audio': Path(audio).name, 'beats': beats.tolist(), **result}, indent=2))
    print(f"Andamento mediano estimado: {result['median_bpm']:.2f} BPM")
    print(f"MIDI pronto: {result['notes']} golpes · {result['bars']} compassos.")
    if result['leading_bars']:
        print(f"Introdução preservada: {result['leading_bars']} compassos antes do primeiro golpe.")
    print('Alinhamento incluído no MIDI. Importe-o no Compasso atualizado.')
    if result['extrapolated_notes']:
        print('Há golpes fora do trecho com pulsação detectada; a grade foi extrapolada nesses pontos.')
    print('Resultado automático estimado em 4/4; ritmos ambíguos ainda podem ser interpretados incorretamente.')
    return result


if __name__ == '__main__':
    import sys
    detect_and_export(*sys.argv[1:4])
