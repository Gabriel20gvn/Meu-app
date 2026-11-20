import { drawBar } from './score-renderer.js';
import { drawDrumGrid } from './drum-grid.js';
import './score-view.css';

export const scoreView = value => value === 'grid' ? 'grid' : 'notation';
export const viewOptions = value => `<option value="notation" ${scoreView(value) === 'notation' ? 'selected' : ''}>Partitura</option><option value="grid" ${value === 'grid' ? 'selected' : ''}>Grade de bateria</option>`;
export function drawScoreBar(element, bar, view, pieces) {
  return scoreView(view) === 'grid' ? drawDrumGrid(element, bar, pieces) : drawBar(element, bar);
}
