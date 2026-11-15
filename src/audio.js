import { BAR, BEAT, DURATION, eventsForBar } from './music.js';
export class DemoPlayer {
  context = null;
  buffer = null;
  source = null;
  offset = 0;
  started = 0;
  playing = false;
  async prepare() {
    this.context ??= new AudioContext();
    await this.context.resume();
    if (this.buffer) return;
    const rate = this.context.sampleRate;
    this.buffer = this.context.createBuffer(1, Math.ceil(DURATION * rate), rate);
    const data = this.buffer.getChannelData(0);
    for (let bar = 0; bar < 8; bar++) for (const e of eventsForBar(bar)) {
      const start = Math.round((bar * BAR + e.beat * BEAT) * rate);
      const length = e.voice === 'kick' ? .25 : e.voice === 'snare' ? .16 : .045;
      for (let i = 0; i < length * rate && start + i < data.length; i++) {
        const t = i / rate;
        const noise = Math.random() * 2 - 1;
        const sample = e.voice === 'kick' ? Math.sin(2 * Math.PI * (45 * t + 65 * .025 * (1 - Math.exp(-t / .025)))) * Math.exp(-t * 20) * .65
          : e.voice === 'snare' ? (noise * .6 + Math.sin(2 * Math.PI * 180 * t) * .3) * Math.exp(-t * 30) * .55
          : noise * Math.exp(-t * 90) * .15;
        data[start + i] += sample;
      }
    }
  }
  get time() { return Math.min(DURATION, this.playing ? this.offset + this.context.currentTime - this.started : this.offset); }
  async play() {
    await this.prepare();
    if (this.playing) return;
    if (this.offset >= DURATION) this.offset = 0;
    this.source = this.context.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.context.destination);
    this.started = this.context.currentTime;
    this.playing = true;
    this.source.start(0, this.offset);
  }
  pause() {
    this.offset = this.time;
    this.playing = false;
    this.source?.stop();
    this.source = null;
  }
  seek(time) { this.pause(); this.offset = Math.max(0, Math.min(DURATION, time)); }
}
