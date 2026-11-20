import tempfile
import unittest
from pathlib import Path
import numpy as np
import mido
from auto_rhythm import export_aligned


class RhythmExportTests(unittest.TestCase):
    def test_preserves_attacks_with_tempo_changes_and_early_notes(self):
        times = np.r_[.149, .149 + np.cumsum([.5]*7 + [60/101]*8)]
        beats = np.column_stack([times, np.arange(16) % 4 + 1])
        notes = np.array([[.01, 35], [.149, 38], [times[4], 42], [times[9]+.1, 47], [times[-1]+.9, 49]])
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'bateria.mid'
            info = export_aligned(notes, beats, path)
            self.assertLess(info['offset'], 0)  # pickup notes are kept
            midi = mido.MidiFile(path)
            self.assertTrue(any(m.type=='marker' and m.text.startswith('COMPASSO_SYNC_V1:') for m in midi.tracks[0]))
            self.assertGreater(sum(m.type=='set_tempo' for m in midi.tracks[0]), 1)
            tempo, seconds, attacks = 500000, 0, []
            for message in mido.merge_tracks(midi.tracks):
                seconds += mido.tick2second(message.time, midi.ticks_per_beat, tempo)
                if message.type == 'set_tempo': tempo = message.tempo
                if message.type == 'note_on' and message.velocity:
                    self.assertEqual(message.channel, 9)
                    attacks.append((seconds+info['offset'], message.note))
            np.testing.assert_allclose(attacks, notes, atol=.001)

    def test_positive_offset_and_downbeat_ticks(self):
        beats = np.column_stack([.149+np.arange(12)*60/101, np.arange(12)%4+1])
        notes = np.array([[beats[0,0],35],[beats[4,0],38],[beats[8,0],49]])
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'bateria.mid'
            info=export_aligned(notes,beats,path)
            self.assertAlmostEqual(info['offset'],.149)
            ticks, attacks=0,[]
            for msg in mido.MidiFile(path).tracks[1]:
                ticks+=msg.time
                if msg.type=='note_on' and msg.velocity: attacks.append(ticks)
            self.assertEqual(attacks,[0,3840,7680])

    def test_rejects_incomplete_or_inconsistent_beat_maps(self):
        notes=[[0,35]]
        with tempfile.TemporaryDirectory() as folder:
            for beats in [[],[[0,1],[.5,2]],[[i*.5,1] for i in range(8)]]:
                with self.assertRaises(ValueError):export_aligned(notes,beats,Path(folder)/'bad.mid')


if __name__=='__main__':unittest.main()
