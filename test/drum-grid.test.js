import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DRUMS} from '../src/transcription.js';
import {gridLanes,gridPoints} from '../src/drum-grid.js';

test('the drum grid covers every supported MIDI piece exactly once, including optional percussion',()=>{
 const pitches=Object.keys(DRUMS).map(Number);
 const represented=gridLanes(pitches).flatMap(lane=>lane.pitches);
 assert.equal(new Set(represented).size,represented.length);
 assert.deepEqual(represented.sort((a,b)=>a-b),pitches);
 assert.equal(gridLanes([35,38,42,47,49]).length,8);
});
test('the drum grid uses uniform sixteenth positions including silent slots for the cursor',()=>{
 const points=gridPoints();assert.equal(points.length,17);
 const step=points[1].x-points[0].x;
 for(let i=0;i<17;i++){
  assert.equal(points[i].fraction,i/16);
  assert.ok(Math.abs(points[i].x-(points[0].x+i*step))<1e-10);
  assert.ok(points[i].x>0&&points[i].x<1);
 }
});
