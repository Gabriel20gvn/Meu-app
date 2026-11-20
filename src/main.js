import './style.css';
import { BAR, BEAT, DURATION, sections, youtubeId, sectionAt, timeLabel, eventsForBar } from './music.js';
import { DemoPlayer } from './audio.js';
import { createYoutubePlayer } from './youtube.js';
const icons = {
 restart: '<path d="M6 5v14m12-14L8 12l10 7Z"/>', plus: '<path d="M12 5v14M5 12h14"/>', play: '<path d="m8 5 11 7-11 7Z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
 arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', back: '<path d="m14 6-6 6 6 6"/>', link: '<path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 2 2-2a4 4 0 0 0-6-6L6 5" transform="translate(3 3) scale(.9)"/>',
 music: '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
 headphones: '<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 13h3v8H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm16 0h-3v8h3a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z"/>',
 repeat: '<path d="M4 8h14l-3-3m5 11H6l3 3M20 8v3M4 16v-3"/>', check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = name => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.music}</svg>`;
const app = document.querySelector('#app');
const player = new DemoPlayer();
let realDispose = null;
async function enterReal(id) {
  player.pause(); realDispose?.(); realDispose=null; view='real';
  shell('<div id="real-root"><p class="loading">Abrindo música…</p></div>');
  const root=document.querySelector('#real-root');
  try { const {openRealSession}=await import('./real-session.js'); if(root.isConnected)realDispose=await openRealSession(id,root,library); }
  catch(e){if(root.isConnected){root.textContent=e.message;}}
}
async function importReal() { const {importSession}=await import('./real-session.js'); importSession(enterReal); }
let view = 'library', loop = false, autoScroll = true, lastBar = -1, pendingPlay = false;
let saved = [];
try { saved = JSON.parse(localStorage.getItem('compasso-links') || '[]').filter(x => youtubeId(x.url)).slice(0, 30); } catch { /* local storage can be unavailable */ }
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const logo = `<a class="brand" href="#" aria-label="Compasso, início"><span class="brand-mark">${icon('music')}</span>compasso<span class="brand-dot">.</span></a>`;
function header() { return `<header>${logo}<span class="prototype">PRIMEIRO COMPASSO <span>·</span> PROTÓTIPO</span><span class="avatar" aria-label="Perfil local">EU</span></header>`; }
function shell(content) { app.innerHTML = header() + content; document.querySelector('.brand').onclick = e => { e.preventDefault(); library(); }; }
function library() {
  player.pause(); realDispose?.(); realDispose=null; view = 'library';
  shell(`<main class="library"><div class="eyebrow">SEU ESPAÇO DE PRÁTICA</div><div class="page-title"><div><h1>Cada música,<br>um novo <span>compasso.</span></h1><p>Da primeira batida à última virada. Toque junto.</p></div><button class="primary add">${icon('plus')} Nova música</button></div>
  <section class="hero"><div class="hero-copy"><span class="pill">${icon('headphones')} VAMOS TOCAR?</span><h2>Encontre seu ritmo.<br>O resto acompanha.</h2><p>Partitura, seções e letra no mesmo lugar.<br>Experimente acompanhar uma batida do início ao fim.</p><button class="light open-demo">Explorar demonstração ${icon('arrow')}</button><small>Áudio de bateria gerado · sem análise por IA</small></div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="record"><div class="record-label">c<span>96 BPM</span></div></div><span class="art-tag">♩ &nbsp; NO SEU TEMPO</span><div class="wave">${Array.from({length:23},(_,i)=>`<i style="height:${15 + ((i*37)%65)}px"></i>`).join('')}</div></div></section>
  <section class="real-intro"><div><h2>Teste com sua música</h2><p>Abra um áudio e importe um MIDI de bateria para acompanhar a gravação original.</p></div><button class="primary" id="import-real">Importar áudio e MIDI</button></section><div class="cards" id="real-library"></div><section class="collection"><div class="section-heading"><h2>Minha biblioteca <span>${1 + saved.length}</span></h2><span class="muted">Seu próximo ensaio começa aqui</span></div><div class="cards"><button class="song-card open-demo"><div class="cover"><span class="cover-top">COMPASSO SESSIONS <span>01</span></span><span class="cover-title">Primeiro<br>compasso<span>●</span></span><span class="cover-bottom">ESTUDO DE BATERIA <span>↗</span></span></div><div class="song-body"><span class="badge">DEMONSTRAÇÃO</span><h3>Primeiro compasso</h3><p>Groove de estudo · 96 BPM · 4/4</p><div class="song-footer"><span>0:20 <span>·</span> 8 compassos</span><span class="circle-play">${icon('play')}</span></div></div></button>
  ${saved.map(s=>`<article class="pending-card"><span class="pending-icon">${icon('link')}</span><span class="badge">YOUTUBE</span><h3>Vídeo salvo do YouTube</h3><p>Reproduza aqui, sem baixar um arquivo de áudio.</p><button class="primary play-youtube" data-video="${escape(youtubeId(s.url))}">${icon('play')} Reproduzir vídeo</button><a href="https://www.youtube.com/watch?v=${escape(youtubeId(s.url))}" target="_blank" rel="noopener noreferrer">Abrir no YouTube ↗</a><button class="remove" data-id="${escape(youtubeId(s.url))}">Remover da biblioteca</button></article>`).join('')}
  <button class="new-card add"><span>${icon('plus')}</span><h3>Sua próxima música</h3><p>Cole um link do YouTube<br>e dê play aqui no Compasso.</p></button></div></section>
  <footer><span>${icon('music')} Feito para acompanhar você.</span><span>Versão de testes · dados salvos neste navegador</span></footer></main>`);
  document.querySelector('#import-real').onclick=importReal;
  const realLibrary=document.querySelector('#real-library');
  import('./real-session.js').then(m=>{if(realLibrary.isConnected)m.renderRealLibrary(realLibrary,enterReal);}).catch(()=>{if(realLibrary.isConnected)realLibrary.textContent='Não foi possível carregar músicas locais. Recarregue a página.';});
  document.querySelectorAll('.open-demo').forEach(b=>b.onclick=study);
  document.querySelectorAll('.add').forEach(b=>b.onclick=addDialog);
  document.querySelectorAll('.play-youtube').forEach(b=>b.onclick=()=>youtubeStudy(b.dataset.video));
  document.querySelectorAll('.remove').forEach(b=>b.onclick=()=>{ saved=saved.filter(s=>youtubeId(s.url)!==b.dataset.id); persist(); library(); });
}
function youtubeStudy(videoId) {
  const iframe = createYoutubePlayer(videoId);
  player.pause(); realDispose?.(); realDispose=null; view='youtube';
  shell(`<main class="study youtube-study"><div class="youtube-heading"><button class="back">${icon('back')} Minha biblioteca</button><h1>Vídeo do YouTube</h1><button class="youtube-options" aria-label="Opções da música" disabled>⋮</button></div><div class="youtube-player"></div><div class="youtube-content"><p class="muted">Carregando partitura…</p></div><a class="youtube-fallback" href="https://www.youtube.com/watch?v=${escape(videoId)}" target="_blank" rel="noopener noreferrer">Abrir no YouTube ↗</a></main>`);
  const root=document.querySelector('.youtube-study');
  root.querySelector('.youtube-player').append(iframe);
  root.querySelector('.back').onclick=library;
  import('./youtube-session.js').then(async m=>{
    if(!root.isConnected)return;
    const dispose=await m.openYoutubeSession(videoId,root,iframe);
    if(root.isConnected)realDispose=dispose;else dispose?.();
  }).catch(()=>{if(root.isConnected)root.querySelector('.youtube-content').textContent='Não foi possível abrir a partitura. Volte à biblioteca e tente novamente.';});
  window.scrollTo(0,0);
}
function persist() { try { localStorage.setItem('compasso-links', JSON.stringify(saved)); return true; } catch { return false; } }
function addDialog() {
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `<form><div class="dialog-head"><span class="eyebrow">NOVA MÚSICA</span><button type="button" class="close" aria-label="Fechar">×</button></div><h2>Qual é a próxima?</h2><p>Cole o link da música que você quer tocar.</p><label for="url">Link do YouTube</label><input id="url" name="url" type="url" placeholder="https://www.youtube.com/watch?v=…" required autocomplete="off"><div class="info">Salve o link e toque em Reproduzir vídeo na biblioteca. O player do YouTube abre dentro do Compasso. Importe seu MIDI para acompanhar a partitura pelo vídeo. A transcrição por IA será adicionada depois.</div><p class="error" role="alert"></p><button class="primary" type="submit">${icon('plus')} Salvar link</button></form>`;
  document.body.append(dialog); dialog.showModal();
  dialog.querySelector('.close').onclick=()=>dialog.close(); dialog.onclose=()=>dialog.remove();
  dialog.querySelector('form').onsubmit=e=>{
    e.preventDefault(); const value=dialog.querySelector('input').value.trim(), id=youtubeId(value);
    const error=dialog.querySelector('.error');
    if(!id) { error.textContent='Insira um link válido de vídeo do YouTube.'; return; }
    if(saved.some(s=>youtubeId(s.url)===id)) { error.textContent='Essa música já está na biblioteca.'; return; }
    if(saved.length >= 30) { error.textContent='Limite de 30 links neste protótipo. Remova um link para adicionar outro.'; return; }
    saved.push({url:`https://www.youtube.com/watch?v=${id}`});
    if(!persist()) { saved.pop(); error.textContent='Não foi possível salvar. Verifique se o navegador permite armazenamento local.'; return; }
    dialog.close(); library();
  };
}
function notation(bar) {
  let svg = `<svg class="notation" viewBox="0 0 400 112" role="img" aria-label="Compasso ${bar+1}: chimbal em colcheias, bumbo nos tempos 1 e 3, caixa nos tempos 2 e 4${bar===7?', com caixa adicional nos contratempos de 3 e 4':''}"><g stroke="currentColor" stroke-width=".8">`;
  for(let y=36;y<=76;y+=10) svg+=`<path d="M12 ${y}H388"/>`;
  svg+='<path d="M12 36v40M388 36v40"/></g>';
  svg+='<g fill="currentColor"><rect x="22" y="44" width="3" height="23"/><rect x="29" y="44" width="3" height="23"/></g>';
  for(let i=0;i<8;i++) {
    const x=62+i*43;
    svg+=`<path d="M${x-4} 28l8 8m0-8-8 8M${x+4} 32V10" fill="none" stroke="currentColor" stroke-width="1.5"/>`;
    if(i%2===0) svg+=`<path d="M${x+4} 11h43" stroke="currentColor" stroke-width="3"/>`;
    for(const e of eventsForBar(bar).filter(e=>e.beat===i/2 && e.voice!=='hat')) {
      const y=e.voice==='kick'?71:51;
      svg+=`<ellipse cx="${x}" cy="${y}" rx="5.5" ry="3.7" fill="currentColor" transform="rotate(-20 ${x} ${y})"/><path d="M${x+4} ${y}V32" stroke="currentColor" stroke-width="1.3"/>`;
    }
    if(i%2===0) svg+=`<text x="${x}" y="103" text-anchor="middle" fill="#8b8d89" font-size="10">${i/2+1}</text>`;
  }
  return svg+'</svg>';
}
function study() {
  view='study'; lastBar=-1;
  shell(`<main class="study"><button class="back">${icon('back')} Minha biblioteca</button><div class="study-heading"><div><span class="eyebrow">COMPASSO SESSIONS / 01</span><h1>Primeiro compasso</h1><p>Bateria · 96 BPM · 4/4 <span class="badge">DEMONSTRAÇÃO</span></p></div><span class="study-icon">${icon('headphones')}</span></div><div class="demo-notice">Áudio de bateria sintetizado e partitura de exemplo. Os trechos de letra são fictícios e não há voz na gravação.</div>
  <nav class="sections" aria-label="Ir para seção">${sections.map(s=>`<button data-time="${s.bar*BAR}">${s.name}<small>${timeLabel(s.bar*BAR)}</small></button>`).join('')}</nav>
  <div class="score-toolbar"><span>PARTITURA DE BATERIA</span><label><input type="checkbox" id="autoscroll" ${autoScroll?'checked':''}> Rolagem automática</label></div>
  <div class="score">${sections.map(s=>`<section class="score-section"><div class="score-section-title"><h2>${s.name}</h2><span>${timeLabel(s.bar*BAR)}</span></div><p class="lyric">${s.cue}</p><div class="bar-pair">${[s.bar,s.bar+1].map(bar=>`<button class="measure" data-bar="${bar}" aria-label="Ir para compasso ${bar+1}"><span class="bar-number">${bar+1}</span>${notation(bar)}<span class="playhead"></span></button>`).join('')}</div></section>`).join('')}</div>
  <p class="score-legend">× Chimbal &nbsp; · &nbsp; ● Caixa: 3º espaço &nbsp; · &nbsp; ● Bumbo: 1º espaço<br>Toque em um compasso para ir até ele.</p></main><div class="transport"><div class="transport-inner"><div class="now-playing"><span class="mini-cover">c.</span><div><strong>Primeiro compasso</strong><small id="current-section">Introdução</small></div></div><div class="playback"><button id="restart" class="icon-button" aria-label="Voltar ao início">${icon('restart')}</button><button id="play" class="play-button" aria-label="Reproduzir">${icon('play')}</button><button id="loop" class="icon-button ${loop?'selected':''}" aria-label="Repetir música" aria-pressed="${loop}">${icon('repeat')}</button></div><div class="timeline"><span id="elapsed">0:00</span><input type="range" id="seek" min="0" max="${DURATION}" step="0.01" value="0" aria-label="Posição na música"><span>0:20</span></div></div><p id="audio-error" role="alert"></p></div>`);
  document.querySelector('.back').onclick=library;
  document.querySelector('#play').onclick=async()=>{ if(pendingPlay)return; if(player.playing)player.pause();else await playSafe(); update(); };
  document.querySelector('#restart').onclick=()=>seek(0);
  document.querySelector('#seek').oninput=e=>seek(Number(e.target.value));
  document.querySelector('#loop').onclick=e=>{loop=!loop; e.currentTarget.classList.toggle('selected',loop);e.currentTarget.setAttribute('aria-pressed',String(loop));};
  document.querySelector('#autoscroll').onchange=e=>autoScroll=e.target.checked;
  document.querySelectorAll('[data-time]').forEach(b=>b.onclick=()=>seek(Number(b.dataset.time)));
  document.querySelectorAll('[data-bar]').forEach(b=>b.onclick=()=>seek(Number(b.dataset.bar)*BAR));
  update();
}
async function playSafe(){
  pendingPlay=true;
  try { await player.play(); if(view!=='study') player.pause(); }
  catch { document.querySelector('#audio-error')?.replaceChildren('Não foi possível iniciar o áudio. Tente novamente em um navegador atualizado.'); }
  finally { pendingPlay=false; }
}
async function seek(t){ const resume=player.playing;player.seek(t);if(resume)await playSafe();update(); if(autoScroll && view==='study') document.querySelector(`[data-bar="${Math.min(7,Math.floor(t/BAR))}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}); }
function update(){
  if(view!=='study')return;
  const t=player.time, bar=Math.min(7,Math.floor(t/BAR)), section=sectionAt(t);
  document.querySelector('#elapsed').textContent=timeLabel(t);
  document.querySelector('#seek').value=t;
  document.querySelector('#current-section').textContent=section.name;
  const play=document.querySelector('#play');play.innerHTML=icon(player.playing?'pause':'play');play.setAttribute('aria-label',player.playing?'Pausar':'Reproduzir');
  document.querySelectorAll('[data-time]').forEach(b=>b.classList.toggle('active',Number(b.dataset.time)===section.bar*BAR));
  document.querySelectorAll('.measure').forEach(b=>{ const active=Number(b.dataset.bar)===bar;b.classList.toggle('active',active);if(active)b.style.setProperty('--progress',`${15.5+Math.min(1,(t-bar*BAR)/BAR)*80}%`); });
  if(lastBar!==bar){
    const measure=document.querySelector(`[data-bar="${bar}"]`);
    if(autoScroll && player.playing) {
      const rect=measure.getBoundingClientRect();
      if(rect.bottom>innerHeight-175 || rect.top<85) measure.scrollIntoView({behavior:'smooth',block:'center'});
    }
    lastBar=bar;
  }
}
function frame(){
  if(player.playing && player.time>=DURATION){player.pause();if(loop && view==='study'){player.seek(0);playSafe();}}
  if(player.playing || view==='study')update();
  requestAnimationFrame(frame);
}
library();requestAnimationFrame(frame);
