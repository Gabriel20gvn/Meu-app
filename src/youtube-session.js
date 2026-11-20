import { loadYoutubeApi } from './youtube.js';
import { parseDrumMidi, positionAt } from './transcription.js';
import { cursorX } from './score-renderer.js';
import { drawScoreBar, scoreView, viewOptions } from './score-view.js';
import { getSession, saveSession } from './session-store.js';

export async function openYoutubeSession(videoId, root, iframe) {
  let session = await getSession(`youtube:${videoId}`) ?? {
    id: `youtube:${videoId}`, kind: 'youtube', score: null, offset: 0,
    measuresPerRow: 2, autoScroll: true,
  };
  if (!root.isConnected) return;
  session.scoreView=scoreView(session.scoreView);
  let disposed=false, player, ready=false, observer, timer, active=-1, modal;
  const layouts=new Map();
  const content=root.querySelector('.youtube-content');
  content.innerHTML='<p class="error youtube-error" role="alert"></p><button class="primary youtube-import">Importar MIDI de bateria</button><p class="score-view-hint" hidden>Grade: x = pratos/chimbal · o = tambores. Deslize para ver os compassos ao lado.</p><div class="youtube-score-scroll" tabindex="0" aria-label="Partitura de bateria"><div class="real-score-grid"></div></div>';
  const error=content.querySelector('.youtube-error'), grid=content.querySelector('.real-score-grid');
  const viewport=content.querySelector('.youtube-score-scroll');
  const report=e=>{if(!disposed)error.textContent=e.message;};
  const importButton=content.querySelector('.youtube-import');
  function dialog(html) {
    modal?.close();
    const d=document.createElement('dialog');d.className='real-dialog youtube-dialog';
    d.innerHTML='<button type="button" class="close" aria-label="Fechar">×</button>'+html;
    d.querySelector('.close').onclick=()=>d.close();d.onclose=()=>d.remove();
    root.append(d);d.showModal();modal=d;return d;
  }
  async function save(next) {
    await saveSession(next);
    session=next;
  }
  function renderScore() {
    observer?.disconnect();layouts.clear();active=-1;
    importButton.hidden=!!session.score;
    viewport.hidden=!session.score;
    grid.style.setProperty('--measures-per-row',session.measuresPerRow);
    grid.dataset.scoreView=session.scoreView;
    content.querySelector('.score-view-hint').hidden=!session.score || session.scoreView!=='grid';
    grid.replaceChildren();
    if(!session.score)return;
    for(const bar of session.score.bars){
      const button=document.createElement('button');button.className='real-measure';
      button.dataset.index=bar.index;button.setAttribute('aria-label',`Ir para compasso ${bar.index+1}`);
      button.innerHTML=`<span>Compasso ${bar.index+1}</span><div class="engraving"><i class="real-playhead"></i></div>`;
      button.onclick=()=>{
        if(!ready){report(new Error('Aguarde o player conectar. Se necessário, toque no Play do vídeo.'));return;}
        const time=Math.max(0,bar.start+session.offset),duration=player.getDuration();
        player.seekTo(duration>0?Math.min(time,duration):time,true);
        tick();
      };
      grid.append(button);
    }
    observer=new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting){
        const b=entry.target,index=Number(b.dataset.index);
        if(!layouts.has(index))try{layouts.set(index,drawScoreBar(b.querySelector('.engraving'),session.score.bars[index],session.scoreView,session.score.pieces));}catch{report(new Error('Não foi possível desenhar este compasso.'));}
      }
    },{root:viewport,rootMargin:'300px'});
    grid.querySelectorAll('.real-measure').forEach(b=>observer.observe(b));
  }
  function importMidi() {
    const d=dialog('<form><h2>Importar MIDI de bateria</h2><p>Use o MIDI da mesma gravação, em 4/4 e no canal 10. Até 5 MB. O arquivo fica neste navegador.</p><label for="youtube-midi">Arquivo MIDI</label><input id="youtube-midi" type="file" accept=".mid,.midi" required><p class="error" role="alert"></p><button class="primary" type="submit">Usar MIDI</button></form>');
    d.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const submit=d.querySelector('[type=submit]');submit.disabled=true;
      try{
        const file=d.querySelector('input').files[0];
        if(!file||file.size>5*1024*1024)throw new Error('Selecione um MIDI de até 5 MB.');
        const score=parseDrumMidi(await file.arrayBuffer());
        if(disposed||!d.open)return;
        await save({...session,score,midiName:file.name});
        if(disposed)return;
        d.close();renderScore();
      }catch(e){d.querySelector('.error').textContent=e.message;}
      finally{submit.disabled=false;}
    };
  }
  importButton.onclick=importMidi;
  const options=root.querySelector('.youtube-options');options.disabled=false;
  options.onclick=()=>{
    const d=dialog(`<h2>Opções da música</h2><button class="secondary" id="youtube-replace">${session.score?'Trocar MIDI':'Importar MIDI'}</button><form><label for="youtube-view">Visualização</label><select id="youtube-view">${viewOptions(session.scoreView)}</select><label for="youtube-offset">Ajuste de sincronização (segundos)</label><input id="youtube-offset" type="number" min="-1800" max="1800" step="0.01" value="${session.offset}" required><p>Valor positivo atrasa a partitura. Use o MIDI da mesma versão da música.</p><label for="youtube-layout">Compassos por linha</label><select id="youtube-layout">${[1,2,4].map(n=>`<option ${n===session.measuresPerRow?'selected':''}>${n}</option>`).join('')}</select><label class="youtube-scroll-label"><input id="youtube-scroll" type="checkbox" ${session.autoScroll?'checked':''}> Rolagem automática</label><p class="youtube-score-info"></p><p class="error" role="alert"></p><button class="primary" type="submit">Salvar ajustes</button></form>`);
    d.querySelector('#youtube-replace').onclick=()=>{d.close();importMidi();};
    d.querySelector('.youtube-score-info').textContent=session.score?`${session.midiName} · ${session.score.bars.length} compassos · ${Math.round(session.score.tempo)} BPM${session.score.hasTempoChanges?' com mudanças de andamento':''}. Grade de semicolcheias: ${session.score.rounded} ataques arredondados. Tercinas e microvariações não são representadas fielmente.${session.score.assumedMeter?' Compasso não informado no MIDI: assumido 4/4.':''}`:'Importe um MIDI para exibir a partitura.';
    d.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const submit=d.querySelector('[type=submit]');submit.disabled=true;
      try{
        const offset=Number(d.querySelector('#youtube-offset').value),measuresPerRow=Number(d.querySelector('#youtube-layout').value);
        if(!Number.isFinite(offset)||Math.abs(offset)>1800||![1,2,4].includes(measuresPerRow))throw new Error('Confira os valores dos ajustes.');
        const nextView=scoreView(d.querySelector('#youtube-view').value),changedView=nextView!==session.scoreView;
        await save({...session,scoreView:nextView,offset,measuresPerRow,autoScroll:d.querySelector('#youtube-scroll').checked});
        if(disposed)return;
        grid.style.setProperty('--measures-per-row',session.measuresPerRow);
        if(changedView)renderScore();
        // Re-evaluate following even if the current bar did not change while
        // settings were saved (for example when enabling auto-scroll).
        active=-2;
        d.close();tick();
      }catch(e){d.querySelector('.error').textContent=e.message;}
      finally{submit.disabled=false;}
    };
  };
  function tick(){
    if(disposed||!ready||!session.score)return;
    const position=positionAt(session.score,player.getCurrentTime(),session.offset);
    if(active!==(position?.bar??-1)){
      grid.querySelector('.active')?.classList.remove('active');active=position?.bar??-1;
      const element=grid.querySelector(`[data-index="${active}"]`);
      if(element){
        element.classList.add('active');
        if(session.autoScroll&&player.getPlayerState()===1){
          const box=element.getBoundingClientRect(),bounds=viewport.getBoundingClientRect();
          const outsideY=box.top<bounds.top||box.bottom>bounds.bottom;
          const outsideX=box.left<bounds.left||box.right>bounds.right;
          if(outsideY||outsideX)viewport.scrollTo({
            top:outsideY?viewport.scrollTop+box.top-bounds.top:viewport.scrollTop,
            left:outsideX?viewport.scrollLeft+box.left-bounds.left:viewport.scrollLeft,behavior:'smooth'
          });
        }
      }
    }
    if(position&&layouts.has(active))grid.querySelector(`[data-index="${active}"]`).style.setProperty('--real-progress',`${cursorX(layouts.get(active),position.progress)*100}%`);
  }
  renderScore();
  loadYoutubeApi().then(YT=>{
    if(disposed||!root.isConnected)return;
    player=new YT.Player(iframe,{events:{
      onReady:()=>{
        if(disposed)return;
        ready=true;
        const title=player.getVideoData?.()?.title;
        if(title)root.querySelector('h1').textContent=title;
        tick();
      },
      onStateChange:()=>{active=-2;tick();},
      onError:()=>{ready=false;report(new Error('Este vídeo não pôde ser reproduzido aqui. Use Abrir no YouTube.'));},
    }});
  }).catch(report);
  timer=setInterval(tick,100);
  return ()=>{disposed=true;clearInterval(timer);observer?.disconnect();modal?.close();player?.destroy();};
}
