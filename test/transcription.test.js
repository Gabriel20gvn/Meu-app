import {test} from 'node:test';
import assert from 'node:assert/strict';
import MidiPackage from '@tonejs/midi';
import {parseDrumMidi,positionAt,validateCues,offsetForImport} from '../src/transcription.js';
const {Midi}=MidiPackage;
function fixture({channel=9,meter=[4,4],pitches=[36,38,42],tempos=[{ticks:0,bpm:120}],last=3}={}){
 const midi=new Midi();midi.header.tempos=tempos;midi.header.timeSignatures=[{ticks:0,timeSignature:meter}];midi.header.update();const t=midi.addTrack();t.channel=channel;
 for(let i=0;i<=last;i++)for(const pitch of pitches)t.addNote({midi:pitch,ticks:i*midi.header.ppq,durationTicks:midi.header.ppq/4,velocity:.8});return midi.toArray();
}
test('imports original drum events, not demo events, and respects simultaneous hits',()=>{
 const s=parseDrumMidi(fixture({pitches:[36,38,49]}));assert.equal(s.noteCount,12);assert.equal(s.bars.length,1);assert.deepEqual(s.bars[0].slots[0],[36,38,49]);assert.equal(s.bars[0].end,2);assert.equal(s.rounded,0);
});
test('keeps tempo changes and aligns the score to original audio with signed offset',()=>{
 const s=parseDrumMidi(fixture({tempos:[{ticks:0,bpm:120},{ticks:960,bpm:60}],last:7}));
 assert.equal(s.bars[0].end,3);assert.equal(s.bars[1].end,7);
 assert.equal(positionAt(s,0,1),null);assert.equal(positionAt(s,4,1).bar,1);
 assert.ok(Math.abs(positionAt(s,2,1).progress-.5)<1e-9);
 assert.equal(positionAt(s,8,1),null);assert.equal(positionAt(s,2,-1).bar,1);
});
test('does not treat melodic MIDI or unsupported meter as drum transcription',()=>{
 assert.throws(()=>parseDrumMidi(fixture({channel:0})),/canal MIDI 10/);
 assert.throws(()=>parseDrumMidi(fixture({meter:[3,4]})),/4\/4/);
 assert.throws(()=>parseDrumMidi(fixture({pitches:[80]})),/não suportadas/);
 assert.throws(()=>parseDrumMidi(new Uint8Array([1,2,3])),/inválido/);
});
test('validates and sorts real cue timestamps without generating lyrics',()=>{
 assert.deepEqual(validateCues([{time:5,name:'Refrão',lyric:'Minha letra'},{time:0,name:'Introdução'}],10).map(c=>c.time),[0,5]);
 for(const time of [-1,10,NaN,Infinity])assert.throws(()=>validateCues([{time,name:'Refrão'}],10));
 assert.throws(()=>validateCues([{time:0,name:''}],10));
});

test('imports the automatic offset while ordinary MIDI preserves the manual adjustment',()=>{
 const plain=parseDrumMidi(fixture());
 assert.equal(offsetForImport(plain,.7),.7);
 assert.equal(offsetForImport(null),0);
 for(const offset of [.149,-.123456,0]){
  const midi=new Midi(fixture());
  midi.header.meta=[{type:'marker',ticks:0,text:`COMPASSO_SYNC_V1:${offset}`}];
  const score=parseDrumMidi(midi.toArray());
  assert.equal(offsetForImport(score,4),offset);
  assert.equal(positionAt(score,score.bars[0].start+offset,offset).bar,0);
 }
});
test('rejects malformed or conflicting automatic alignment metadata',()=>{
 for(const values of [['NaN'],[''],['1801'],['0','1']]){
  const midi=new Midi(fixture());
  midi.header.meta=values.map(value=>({type:'marker',ticks:0,text:`COMPASSO_SYNC_V1:${value}`}));
  assert.throws(()=>parseDrumMidi(midi.toArray()),/alinhamento automático/);
 }
});
