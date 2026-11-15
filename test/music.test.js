import { test } from 'node:test';
import assert from 'node:assert/strict';
import { youtubeId, sectionAt, BAR, DURATION, eventsForBar } from '../src/music.js';
test('accepts supported YouTube links and rejects lookalike hosts', () => {
  for (const url of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5','https://youtu.be/dQw4w9WgXcQ','https://youtube.com/shorts/dQw4w9WgXcQ']) assert.equal(youtubeId(url),'dQw4w9WgXcQ');
  for (const url of ['https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ','javascript:alert(1)','https://youtu.be/abc','https://example.com','bad']) assert.equal(youtubeId(url),null);
});
test('section boundaries match the playback timeline', () => {
 assert.equal(sectionAt(0).name,'Introdução');assert.equal(sectionAt(BAR*2-.001).name,'Introdução');assert.equal(sectionAt(BAR*2).name,'Verso');assert.equal(sectionAt(DURATION).name,'Final');
});
test('score events occupy eight valid bars and preserve backbeat', () => {
 for(let bar=0;bar<8;bar++) {
  const events=eventsForBar(bar);assert.equal(events.filter(e=>e.voice==='hat').length,8);
  assert.deepEqual(events.filter(e=>e.voice==='kick').map(e=>e.beat),[0,2]);
  assert.ok(events.every(e=>e.beat>=0 && e.beat<4));
 }
 assert.deepEqual(eventsForBar(7).filter(e=>e.voice==='snare').map(e=>e.beat),[1,2.5,3,3.5]);
});
