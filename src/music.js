export const BPM = 96;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const DURATION = BAR * 8;
export const sections = [
  { name: 'Introdução', bar: 0, cue: 'Instrumental · prepare a entrada' },
  { name: 'Verso', bar: 2, cue: '“Deixa o dia começar…”' },
  { name: 'Refrão', bar: 4, cue: '“Vou seguir o meu compasso…”' },
  { name: 'Final', bar: 6, cue: '“Até o som se encontrar…”' },
];
export function youtubeId(value) {
  try {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol)) return null;
    const host = u.hostname.toLowerCase();
    let id;
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
      id = u.pathname === '/watch' ? u.searchParams.get('v') : /^\/(shorts|embed)\/([^/]+)$/.exec(u.pathname)?.[2];
    }
    return /^[\w-]{11}$/.test(id ?? '') ? id : null;
  } catch { return null; }
}
export function sectionAt(time) {
  return sections.filter(s => s.bar * BAR <= time).at(-1) ?? sections[0];
}
export function timeLabel(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
export function eventsForBar(bar) {
  const events = [];
  for (let i = 0; i < 8; i++) {
    events.push({ beat: i / 2, voice: 'hat' });
    if (i === 0 || i === 4) events.push({ beat: i / 2, voice: 'kick' });
    if (i === 2 || i === 6) events.push({ beat: i / 2, voice: 'snare' });
    if (bar === 7 && (i === 5 || i === 7)) events.push({ beat: i / 2, voice: 'snare' });
  }
  return events;
}
