import { Renderer, Stave, StaveNote, Voice, Formatter, Beam } from 'vexflow';
import { DRUMS } from './transcription.js';
// Durations fill each beat; identical attacks share a chord. Original audio timing
// remains untouched. Display uses a sixteenth-note grid, explicitly labeled in UI.
export function drawBar(element,bar){
  const renderer=new Renderer(element,Renderer.Backends.SVG);
  renderer.resize(540,155);
  const context=renderer.getContext();
  const stave=new Stave(5,20,525).addClef('percussion');
  if(bar.index===0)stave.addTimeSignature('4/4');
  stave.setContext(context).draw();
  const notes=[];const positions=[];
  for(let slot=0;slot<16;){
    const pitches=bar.slots[slot];let gap=1;
    while(slot+gap<16 && (slot+gap)%4!==0 && !bar.slots[slot+gap].length)gap++;
    const units=gap>=4?4:gap>=2?2:1;
    const duration=String(16/units)+(pitches.length?'':'r');
    const keys=pitches.length?[...new Set(pitches.map(p=>DRUMS[p][1]))]:['b/4'];
    const note=new StaveNote({clef:'percussion',keys,duration,stem_direction:1});
    notes.push(note);positions.push(slot);slot+=units;
  }
  const voice=new Voice({num_beats:4,beat_value:4}).addTickables(notes);
  new Formatter().joinVoices([voice]).format([voice],stave.getNoteEndX()-stave.getNoteStartX()-22);
  const beams=Beam.generateBeams(notes);
  voice.draw(context,stave);beams.forEach(b=>b.setContext(context).draw());
  element.style.width='100%';
  const svg=element.querySelector('svg');svg.style.width='100%';svg.style.height='auto';svg.setAttribute('viewBox','0 0 540 155');svg.removeAttribute('width');svg.removeAttribute('height');svg.setAttribute('aria-hidden','true');
  return positions.map((slot,i)=>({fraction:slot/16,x:notes[i].getAbsoluteX()/540})).concat([{fraction:1,x:stave.getNoteEndX()/540}]);
}
export function cursorX(points,progress){
  const left=points.findLast(p=>p.fraction<=progress)??points[0];
  const right=points.find(p=>p.fraction>progress)??points.at(-1);
  if(right.fraction===left.fraction)return left.x;
  return left.x+(right.x-left.x)*(progress-left.fraction)/(right.fraction-left.fraction);
}
