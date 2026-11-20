import { parseDrumMidi, positionAt, validateCues, DRUMS } from './transcription.js';
import { saveSession, getSession, listSessions, deleteSession } from './session-store.js';
import { cursorX } from './score-renderer.js';
import { drawScoreBar, scoreView, viewOptions } from './score-view.js';
import { timeLabel } from './music.js';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MAX_AUDIO=80*1024*1024;
function dialog(content){
  const d=document.createElement('dialog');d.className='real-dialog';
  d.innerHTML=`<button type="button" class="close" aria-label="Fechar">×</button>${content}`;
  document.body.append(d);d.querySelector('.close').onclick=()=>d.close();d.onclose=()=>d.remove();d.showModal();return d;
}
async function durationOf(file){
  if(!file || !file.size || file.size>MAX_AUDIO)throw new Error('Selecione um áudio de até 80 MB.');
  const url=URL.createObjectURL(file),audio=new Audio();
  try {
    return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('O navegador não conseguiu ler o áudio. Tente exportar em MP3 ou WAV.')),15000);
      audio.onloadedmetadata=()=>{clearTimeout(timer);Number.isFinite(audio.duration)&&audio.duration>0&&audio.duration<=1800?resolve(audio.duration):reject(new Error('O áudio deve durar até 30 minutos.'));};
      audio.onerror=()=>{clearTimeout(timer);reject(new Error('Formato não reconhecido. Tente um arquivo MP3, WAV ou OGG válido.'));};audio.src=url;
    });
  } finally {audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);}
}
export function importSession(onSaved){
  const d=dialog(`<form><span class="eyebrow">MÚSICA REAL</span><h2>Traga sua gravação</h2><p>O áudio e o MIDI ficam neste navegador. Nenhum arquivo é enviado a um serviço de IA.</p><label for="track-title">Nome da música</label><input id="track-title" maxlength="100" placeholder="Nome da música"><label for="audio-file">Arquivo de áudio · até 80 MB / 30 minutos</label><input id="audio-file" type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a" required><label for="midi-file">Transcrição MIDI de bateria · opcional</label><input id="midi-file" type="file" accept=".mid,.midi"><div class="info">Já tem uma transcrição? Importe o MIDI General MIDI (canal 10), em 4/4. Sem MIDI, você pode ouvir a gravação e marcar seções e trechos da letra. A transcrição automática por IA está em avaliação.</div><p class="error" role="alert"></p><button class="primary" type="submit">Abrir música</button></form>`);
  d.querySelector('form').onsubmit=async e=>{
    e.preventDefault();const submit=d.querySelector('[type=submit]');submit.disabled=true;submit.textContent='Lendo arquivos…';
    try {
      const audio=d.querySelector('#audio-file').files[0],midi=d.querySelector('#midi-file').files[0];
      if(midi?.size>5*1024*1024)throw new Error('O MIDI deve ter até 5 MB.');
      const duration=await durationOf(audio),score=midi?parseDrumMidi(await midi.arrayBuffer()):null;
      const session={id:crypto.randomUUID(),title:d.querySelector('#track-title').value.trim()||audio.name,audio,duration,score,midiName:midi?.name??'',offset:0,cues:[]};
      if(!d.isConnected)return;
      await saveSession(session);d.close();onSaved(session.id);
    } catch(e){if(d.isConnected)d.querySelector('.error').textContent=e.message;}
    finally{submit.disabled=false;submit.textContent='Abrir música';}
  };
}
export async function renderRealLibrary(container,onOpen){
  try {
    const sessions=await listSessions();if(!container.isConnected)return;
    container.innerHTML=sessions.map(s=>`<article class="pending-card"><span class="badge">${s.hasScore?'ÁUDIO + MIDI':'ÁUDIO IMPORTADO'}</span><h3>${esc(s.title)}</h3><p>${timeLabel(s.duration)} · salvo neste navegador</p><button class="primary" data-open="${s.id}">Abrir música</button><button class="remove" data-delete="${s.id}">Excluir áudio e marcações</button></article>`).join('');
    container.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>onOpen(b.dataset.open));
    container.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{
      if(!confirm('Excluir o áudio e suas marcações deste navegador?'))return;
      try{await deleteSession(b.dataset.delete);await renderRealLibrary(container,onOpen);}catch(e){alert(e.message);}
    });
  }catch(e){container.textContent=e.message;}
}
export async function openRealSession(id,root,onBack){
  const session=await getSession(id);if(!root.isConnected)return null;if(!session)throw new Error('Esta música não está mais na biblioteca.');
  if(![1,2,4].includes(session.measuresPerRow)) session.measuresPerRow=matchMedia('(max-width: 760px)').matches?1:2;
  session.scoreView=scoreView(session.scoreView);
  const audioUrl=URL.createObjectURL(session.audio);
  let raf,disposed=false,observer,scroll=true,lastBar=-1,writeQueue=Promise.resolve();
  root.innerHTML=`<main class="study real-study"><button class="back">‹ Minha biblioteca</button><div class="study-heading"><div><span class="eyebrow">SUA GRAVAÇÃO ORIGINAL</span><h1>${esc(session.title)}</h1><p>${timeLabel(session.duration)} · áudio local <span class="badge">MÚSICA REAL</span></p></div></div>
  <div class="real-audio"><audio controls preload="metadata" aria-label="Reprodução da gravação original"></audio><label><input id="real-loop" type="checkbox"> Repetir música</label></div><p class="error" id="session-error" role="alert"></p>
  <div class="session-actions"><button class="primary" id="add-cue">Marcar seção e letra</button><button class="secondary" id="replace-midi">${session.score?'Substituir':'Importar'} MIDI de bateria</button></div>
  <section class="cue-panel"><h2>Onde estou na música?</h2><p id="current-cue">Adicione marcações de Introdução, Verso, Refrão…</p><nav class="sections" id="real-cues" aria-label="Seções da música"></nav></section>
  <div class="score-toolbar real-toolbar"><label>Ajuste de sincronização (segundos)<input id="offset" type="number" step="0.05" min="-1800" max="1800" value="${session.offset}"></label><label><input id="real-scroll" type="checkbox" checked> Rolagem automática</label></div><p class="muted sync-help">Valor positivo atrasa a partitura em relação ao áudio. As marcações de letra mantêm seus tempos na gravação.</p>
  <div class="score-layout-control"><label for="score-view">Visualização</label><select id="score-view">${viewOptions(session.scoreView)}</select><label for="measures-per-row">Compassos por linha</label><select id="measures-per-row" aria-describedby="layout-hint">${[1,2,4].map(n=>`<option value="${n}" ${session.measuresPerRow===n?'selected':''}>${n}</option>`).join('')}</select><span id="layout-hint">Para 4 compassos, experimente o celular na horizontal.</span></div>
  <p id="score-status" class="demo-notice"></p><div class="score-scroll" tabindex="0" aria-label="Partitura de bateria"><div id="real-score"></div></div><p id="real-legend" class="score-legend"></p></main><div class="real-current" role="status"><span id="real-time">0:00</span><strong id="real-location">Áudio pronto</strong><button id="real-toggle" class="primary">Reproduzir</button></div>`;
  const audio=root.querySelector('audio');audio.src=audioUrl;
  const error=root.querySelector('#session-error');
  function persist(){
    const copy={...session,cues:session.cues.map(c=>({...c}))};
    const result=writeQueue.then(()=>saveSession(copy));writeQueue=result.catch(()=>{});return result;
  }
  function report(e){if(!disposed)error.textContent=e.message;}
  function renderCues(){
    previousCue=-2;
    const nav=root.querySelector('#real-cues');
    nav.innerHTML=session.cues.map((c,i)=>`<div class="cue-item"><button data-cue="${i}">${esc(c.name)}<small>${timeLabel(c.time)}</small></button><button class="cue-delete" data-remove="${i}" aria-label="Excluir marcação ${esc(c.name)}">×</button></div>`).join('');
    nav.querySelectorAll('[data-cue]').forEach(b=>b.onclick=()=>{audio.currentTime=session.cues[Number(b.dataset.cue)].time;});
    nav.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{const previous=session.cues;session.cues=session.cues.filter((_,i)=>i!==Number(b.dataset.remove));try{await persist();renderCues();}catch(e){session.cues=previous;report(e);}});
  }
  root.querySelector('#add-cue').onclick=()=>{
    const d=dialog(`<form><h2>Marcar um momento</h2><label for="cue-name">Seção</label><input id="cue-name" list="section-names" maxlength="60" placeholder="Refrão" required><datalist id="section-names">${['Introdução','Verso','Pré-refrão','Refrão','Interlúdio','Ponte','Final'].map(n=>`<option value="${n}">`).join('')}</datalist><label for="cue-time">Tempo na gravação (segundos)</label><input id="cue-time" type="number" step="0.01" min="0" max="${session.duration-.01}" value="${audio.currentTime.toFixed(2)}" required><label for="cue-lyric">Trecho da letra (opcional)</label><input id="cue-lyric" maxlength="200" placeholder="Primeiras palavras desta seção"><p class="error" role="alert"></p><button class="primary" type="submit">Salvar marcação</button></form>`);
    d.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const button=d.querySelector('[type=submit]');button.disabled=true;const previous=session.cues;
      try{session.cues=validateCues([...session.cues,{name:d.querySelector('#cue-name').value,time:d.querySelector('#cue-time').value,lyric:d.querySelector('#cue-lyric').value}],session.duration);await persist();d.close();if(!disposed)renderCues();}
      catch(e){session.cues=previous;d.querySelector('.error').textContent=e.message;}finally{button.disabled=false;}
    };
  };
  const layoutSelect=root.querySelector('#measures-per-row');
  function applyLayout(){
    layoutSelect.value=String(session.measuresPerRow);
    root.querySelector('#real-score').style.setProperty('--measures-per-row',session.measuresPerRow);
  }
  layoutSelect.onchange=async()=>{
    const value=Number(layoutSelect.value),previous=session.measuresPerRow;
    if(![1,2,4].includes(value))return;
    session.measuresPerRow=value;applyLayout();layoutSelect.disabled=true;
    try{await persist();}
    catch(e){session.measuresPerRow=previous;applyLayout();report(e);}
    finally{layoutSelect.disabled=!session.score;}
  };
  applyLayout();
  const viewSelect=root.querySelector('#score-view');
  viewSelect.onchange=async()=>{
    const previous=session.scoreView;
    session.scoreView=scoreView(viewSelect.value);viewSelect.disabled=true;
    try{await persist();if(!disposed)drawScore();}
    catch(e){session.scoreView=previous;viewSelect.value=previous;report(e);}
    finally{viewSelect.disabled=!session.score;}
  };
  const layouts=new Map();
  function drawScore(){
    observer?.disconnect();layouts.clear();lastBar=-1;
    const score=session.score,container=root.querySelector('#real-score');
    root.querySelector('#offset').disabled=!score;
    layoutSelect.disabled=!score;viewSelect.disabled=!score;
    container.dataset.scoreView=session.scoreView;
    root.querySelector('#layout-hint').textContent=session.scoreView==='grid'?'Na grade, deslize para ver os compassos ao lado.':'Para 4 compassos, experimente o celular na horizontal.';
    if(!score){container.innerHTML='';root.querySelector('#score-status').textContent='Sem partitura ainda. Importe um MIDI de bateria correspondente a este áudio. A geração automática por IA ainda não foi integrada.';return;}
    root.querySelector('#score-status').textContent=`${score.noteCount} notas importadas · ${score.bars.length} compassos · ${Math.round(score.tempo)} BPM${score.hasTempoChanges?' com mudanças de andamento':''}. Notação em grade de semicolcheias; ${score.rounded} ataques arredondados. Tercinas e microvariações não são representadas fielmente nesta versão. O áudio original não é alterado.${score.assumedMeter?' MIDI sem indicação de compasso: assumido 4/4.':''}${score.bars.at(-1).end+session.offset>session.duration+1?' Atenção: a partitura termina depois do áudio; confira se os arquivos correspondem e ajuste a sincronização.':''}`;
    container.className='real-score-grid';
    container.innerHTML=score.bars.map(b=>`<button class="real-measure" data-index="${b.index}" aria-label="Ir para compasso ${b.index+1}"><span>Compasso ${b.index+1}</span><div class="engraving"><i class="real-playhead"></i></div></button>`).join('');
    const render=element=>{const index=Number(element.dataset.index);if(!layouts.has(index)){try{layouts.set(index,drawScoreBar(element.querySelector('.engraving'),score.bars[index],session.scoreView,score.pieces));}catch(e){element.querySelector('.engraving').textContent='Não foi possível desenhar este compasso.';report(new Error('Falha ao renderizar a partitura.'));}}};
    observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)render(e.target);}),{rootMargin:'400px'});
    container.querySelectorAll('.real-measure').forEach(b=>{observer.observe(b);b.onclick=()=>{audio.currentTime=Math.max(0,Math.min(session.duration,score.bars[Number(b.dataset.index)].start+session.offset));};});
    root.querySelector('#real-legend').textContent=(session.scoreView==='grid'?'x = pratos/chimbal · o = tambores. ':'')+score.pieces.map(p=>`${p}: ${DRUMS[p][0]}`).join(' · ');
  }
  root.querySelector('#replace-midi').onclick=()=>{
    const d=dialog('<form><h2>Importar transcrição</h2><p>MIDI de bateria General MIDI (canal 10), em 4/4, até 5 MB. Seções e letra serão preservadas.</p><label for="replacement-midi">Arquivo MIDI</label><input id="replacement-midi" type="file" accept=".mid,.midi" required><p class="error" role="alert"></p><button class="primary" type="submit">Usar esta transcrição</button></form>');
    d.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const submit=d.querySelector('[type=submit]');submit.disabled=true;
      const previous={score:session.score,midiName:session.midiName};
      try{const file=d.querySelector('input').files[0];if(file.size>5*1024*1024)throw new Error('O MIDI deve ter até 5 MB.');session.score=parseDrumMidi(await file.arrayBuffer());session.midiName=file.name;await persist();d.close();if(!disposed){drawScore();root.querySelector('#replace-midi').textContent='Substituir MIDI de bateria';}}
      catch(e){Object.assign(session,previous);d.querySelector('.error').textContent=e.message;}finally{submit.disabled=false;}
    };
  };
  root.querySelector('#offset').onchange=async e=>{
    const value=Number(e.target.value),previous=session.offset;
    if(!Number.isFinite(value)||Math.abs(value)>1800){e.target.value=previous;report(new Error('Use um ajuste entre -1800 e 1800 segundos.'));return;}
    session.offset=value;try{await persist();}catch(err){session.offset=previous;e.target.value=previous;report(err);}
  };
  root.querySelector('#real-scroll').onchange=e=>scroll=e.target.checked;
  root.querySelector('#real-loop').onchange=e=>audio.loop=e.target.checked;
  root.querySelector('#real-toggle').onclick=async()=>{try{if(audio.paused)await audio.play();else audio.pause();}catch{report(new Error('Não foi possível reproduzir o áudio. Verifique o formato do arquivo.'));}};
  audio.onerror=()=>report(new Error('Não foi possível reproduzir este arquivo. Tente MP3 ou WAV.'));
  let previousCue=-2;
  function tick(){
    if(disposed)return;
    const time=audio.currentTime;root.querySelector('#real-time').textContent=timeLabel(time);root.querySelector('#real-toggle').textContent=audio.paused?'Reproduzir':'Pausar';
    const cueIndex=session.cues.findLastIndex(c=>c.time<=time),cue=session.cues[cueIndex];
    root.querySelector('#current-cue').textContent=cue?`${cue.name}${cue.lyric?' — “'+cue.lyric+'”':''}`:'Sem marcação neste trecho';
    if(previousCue!==cueIndex){root.querySelectorAll('[data-cue]').forEach(b=>b.classList.toggle('active',Number(b.dataset.cue)===cueIndex));previousCue=cueIndex;}
    const position=session.score?positionAt(session.score,time,session.offset):null;
    root.querySelector('#real-location').textContent=position?`Compasso ${position.bar+1}${cue?' · '+cue.name:''}`:cue?.name??'Gravação original';
    if(lastBar!==position?.bar){root.querySelector('.real-measure.active')?.classList.remove('active');lastBar=position?.bar??-1;
      if(position){const element=root.querySelector(`[data-index="${position.bar}"]`);element.classList.add('active');if(scroll&&!audio.paused){const rect=element.getBoundingClientRect();if(rect.top<60||rect.bottom>innerHeight-100||rect.left<0||rect.right>innerWidth)element.scrollIntoView({behavior:'smooth',block:'center'});}}}
    if(position&&layouts.has(position.bar))root.querySelector(`[data-index="${position.bar}"]`).style.setProperty('--real-progress',`${cursorX(layouts.get(position.bar),position.progress)*100}%`);
    raf=requestAnimationFrame(tick);
  }
  function dispose(){disposed=true;cancelAnimationFrame(raf);observer?.disconnect();audio.pause();audio.removeAttribute('src');audio.load();URL.revokeObjectURL(audioUrl);}
  root.querySelector('.back').onclick=()=>{dispose();onBack();};renderCues();drawScore();tick();return dispose;
}
