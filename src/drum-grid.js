import { DRUMS } from './transcription.js';

// Standard GM drums share a lane by instrument family. Optional percussion
// gets its own lane so supported MIDI notes are never silently omitted.
const LANES = [
  { label: 'Cr', name: 'Crash / pratos', pitches: [49, 52, 55, 57], symbol: 'x' },
  { label: 'Rd', name: 'Ride', pitches: [51, 53, 59], symbol: 'x' },
  { label: 'Ch', name: 'Chimbal', pitches: [42, 44, 46], symbol: 'x' },
  { label: 'Cx', name: 'Caixa / aro', pitches: [37, 38, 39, 40], symbol: 'o' },
  { label: 'Ta', name: 'Tom agudo', pitches: [48, 50], symbol: 'o' },
  { label: 'Tm', name: 'Tom médio / grave', pitches: [45, 47], symbol: 'o' },
  { label: 'Su', name: 'Surdo', pitches: [41, 43], symbol: 'o' },
  { label: 'Bu', name: 'Bumbo', pitches: [35, 36], symbol: 'o' },
  { label: 'Pd', name: 'Pandeiro', pitches: [54], symbol: 'x', optional: true },
  { label: 'Cb', name: 'Cowbell', pitches: [56], symbol: 'x', optional: true },
];

export const gridLanes = pieces => LANES.filter(lane => !lane.optional || lane.pitches.some(p => pieces.includes(p)));
const WIDTH = 540, START = 68, STEP = 28;
export const gridPoints = () => Array.from({ length: 17 }, (_, i) => ({ fraction: i / 16, x: (START + i * STEP) / WIDTH }));

export function drawDrumGrid(element, bar, pieces) {
  const lanes = gridLanes(pieces), height = 36 + lanes.length * 27;
  const ns = 'http://www.w3.org/2000/svg';
  function node(tag, attributes = {}, text) {
    const el = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
    if (text !== undefined) el.textContent = text;
    return el;
  }
  const svg = node('svg', { viewBox: `0 0 ${WIDTH} ${height}`, class: 'drum-grid', role: 'img', 'aria-label': `Grade de bateria, compasso ${bar.index + 1}` });
  // Include instrument names and subdivisions in the accessible description.
  const description = [];
  const count = i => i % 4 === 0 ? String(i / 4 + 1) : ['','e','+','a'][i % 4];
  for (let beat = 0; beat < 4; beat++) {
    svg.append(node('rect', { x: START - STEP / 2 + beat * STEP * 4, y: 28, width: STEP * 4, height: height - 28, fill: beat % 2 ? '#292d29' : '#242824' }));
    svg.append(node('line', { x1: START - STEP / 2 + beat * STEP * 4, x2: START - STEP / 2 + beat * STEP * 4, y1: 28, y2: height, class: 'grid-beat-line' }));
  }
  for (let slot = 0; slot < 16; slot++) {
    svg.append(node('text', { x: START + slot * STEP, y: 19, class: slot % 4 === 0 ? 'grid-count beat-count' : 'grid-count' }, count(slot)));
  }
  lanes.forEach((lane, row) => {
    const y = 45 + row * 27;
    const present = bar.slots.some(pitches => pitches.some(p => lane.pitches.includes(p)));
    svg.append(node('line', { x1: 53, x2: 527, y1: y, y2: y, class: 'grid-lane-line' }));
    const label = node('g', { class: present ? 'grid-label has-hits' : 'grid-label' });
    label.append(node('title', {}, lane.name));
    label.append(node('rect', { x: 3, y: y - 11, width: 42, height: 21, rx: 5 }));
    label.append(node('text', { x: 24, y: y + 1 }, lane.label));
    svg.append(label);
    bar.slots.forEach((pitches, slot) => {
      const hits = pitches.filter(p => lane.pitches.includes(p));
      if (!hits.length) return;
      const mark = node('text', { x: START + slot * STEP, y: y + 1, class: 'grid-hit', 'data-slot': slot, 'data-pitches': hits.join(',') }, lane.symbol);
      const names = hits.map(p => DRUMS[p][0]).join(' + ');
      mark.append(node('title', {}, names));
      description.push(`${names}: tempo ${Math.floor(slot / 4) + 1}, subdivisão ${slot % 4 + 1}`);
      svg.append(mark);
    });
  });
  svg.prepend(node('desc', {}, description.join('; ') || 'Compasso sem golpes de bateria.'));
  element.style.aspectRatio = `${WIDTH} / ${height}`;
  element.append(svg);
  return gridPoints();
}
