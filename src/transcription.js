import { Midi } from '@tonejs/midi/dist/Midi.js';
export const DRUMS = {
  35: ['Bumbo', 'f/4'], 36: ['Bumbo', 'f/4'], 37: ['Aro', 'c/5/x2'],
  38: ['Caixa', 'c/5'], 39: ['Palmas', 'c/5/x2'], 40: ['Caixa elétrica', 'c/5'],
  41: ['Surdo grave', 'g/4'], 42: ['Chimbal fechado', 'g/5/x2'],
  43: ['Surdo', 'a/4'], 44: ['Pedal do chimbal', 'd/4/x2'],
  45: ['Tom grave', 'b/4'], 46: ['Chimbal aberto', 'a/5/x2'],
  47: ['Tom médio', 'd/5'], 48: ['Tom agudo', 'e/5'], 49: ['Crash', 'a/5/x2'],
  50: ['Tom alto', 'f/5'], 51: ['Ride', 'f/5/x2'], 52: ['China', 'a/5/x2'],
  53: ['Cúpula do ride', 'f/5/x2'], 54: ['Pandeiro', 'e/5/x2'],
  55: ['Splash', 'a/5/x2'], 56: ['Cowbell', 'e/5/x2'],
  57: ['Crash 2', 'a/5/x2'], 59: ['Ride 2', 'f/5/x2'],
};
export function parseDrumMidi(bytes) {
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('O MIDI deve ter até 5 MB.');
  if (new TextDecoder().decode(new Uint8Array(bytes).slice(0,4)) !== 'MThd') throw new Error('Arquivo MIDI inválido. Use um arquivo .mid ou .midi.');
  let midi;
  try { midi = new Midi(bytes); } catch { throw new Error('Não foi possível ler este MIDI. Exporte novamente como MIDI padrão.'); }
  if (!(midi.header.ppq > 0 && midi.header.ppq <= 32767)) throw new Error('MIDI com divisão SMPTE não é suportado nesta versão.');
  if (midi.header.timeSignatures.some(s=>s.timeSignature[0]!==4 || s.timeSignature[1]!==4)) throw new Error('Esta versão aceita MIDI em 4/4. Outros compassos serão adicionados depois.');
  if (midi.header.tempos.some(t=>!Number.isFinite(t.bpm) || t.bpm<=0)) throw new Error('O mapa de andamento do MIDI é inválido.');
  const tracks = midi.tracks.filter(t=>t.channel===9);
  const notes = tracks.flatMap(t=>t.notes).sort((a,b)=>a.ticks-b.ticks);
  if (!notes.length) throw new Error('Nenhuma bateria encontrada no canal MIDI 10 (General MIDI). Exporte a faixa de bateria nesse canal.');
  if (notes.length > 20000) throw new Error('O MIDI excede o limite de 20 mil notas nesta versão.');
  const unsupported = [...new Set(notes.filter(n=>!DRUMS[n.midi]).map(n=>n.midi))];
  if (unsupported.length) throw new Error(`Peças MIDI ainda não suportadas: ${unsupported.join(', ')}. Ajuste o mapeamento da faixa de bateria para General MIDI.`);
  const ppq=midi.header.ppq, barTicks=ppq*4;
  const count=Math.ceil((Math.max(...notes.map(n=>n.ticks))+ppq/4)/barTicks);
  if(count>500)throw new Error('Limite de 500 compassos por música nesta versão.');
  const beats=Array.from({length:count*4+1},(_,i)=>midi.header.ticksToSeconds(i*ppq));
  const bars=Array.from({length:count},(_,i)=>({index:i,start:beats[i*4],end:beats[i*4+4],slots:Array.from({length:16},()=>[])}));
  let rounded=0;
  for(const n of notes){
    const quantized=Math.round(n.ticks/(ppq/4));
    if(Math.abs(n.ticks-quantized*ppq/4)>.01)rounded++;
    const bar=Math.floor(quantized/16), slot=quantized%16;
    // Rounding a last attack over a bar line requires a real extra bar.
    if(!bars[bar]){
      const index=bars.length;
      bars.push({index,start:midi.header.ticksToSeconds(index*barTicks),end:midi.header.ticksToSeconds((index+1)*barTicks),slots:Array.from({length:16},()=>[])});
      for(let j=1;j<=4;j++)beats.push(midi.header.ticksToSeconds(index*barTicks+j*ppq));
    }
    if(!bars[bar].slots[slot].includes(n.midi))bars[bar].slots[slot].push(n.midi);
  }
  for(const bar of bars) bar.times=Array.from({length:17},(_,i)=>midi.header.ticksToSeconds(bar.index*barTicks+i*ppq/4));
  return {bars, beats, rounded, noteCount:notes.length, pieces:[...new Set(notes.map(n=>n.midi))], tempo:midi.header.tempos[0]?.bpm??120, hasTempoChanges:midi.header.tempos.length>1, assumedMeter:!midi.header.timeSignatures.length};
}
export function positionAt(score, audioTime, offset=0){
  const time=audioTime-offset;
  if(time<0)return null;
  const bar=score.bars.find(b=>time>=b.start && time<b.end);
  if(!bar)return null;
  const slot=Math.max(0,bar.times.findIndex((t,i)=>i<16 && time>=t && time<bar.times[i+1]));
  return {bar:bar.index,progress:(slot+(time-bar.times[slot])/(bar.times[slot+1]-bar.times[slot]))/16};
}
export function validateCues(cues, duration){
  if(!Array.isArray(cues) || cues.length>200)throw new Error('Limite de 200 marcações.');
  return cues.map(c=>{
    const time=Number(c.time),name=String(c.name??'').trim(),lyric=String(c.lyric??'').trim();
    if(!Number.isFinite(time)||time<0||time>=duration||!name||name.length>60||lyric.length>200)throw new Error('Informe um tempo dentro da música, um nome de até 60 caracteres e um trecho de até 200 caracteres.');
    return {time,name,lyric};
  }).sort((a,b)=>a.time-b.time);
}
