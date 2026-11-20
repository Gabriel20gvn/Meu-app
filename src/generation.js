import {processorConfig,normalizeEndpoint,storeProcessor,processorJSON,processorRequest} from './generation-api.js';
import {parseDrumMidi,offsetForImport} from './transcription.js';
import {getSession,saveSession} from './session-store.js';
import './generation.css';

export function connectProcessor(){
  return new Promise(resolve=>{
    const d=document.createElement('dialog');d.className='real-dialog generation-dialog';
    d.innerHTML='<button type="button" class="close" aria-label="Fechar">×</button><form><h2>Conectar processador</h2><p>Conecte o servidor que executa sua IA. A chave fica somente nesta sessão do navegador.</p><label for="processor-url">Endereço do processador</label><input id="processor-url" type="url" placeholder="https://seu-processador.onrender.com" required><label for="processor-token">Chave de acesso</label><input id="processor-token" type="password" autocomplete="off" required><p class="error" role="alert"></p><button class="primary" type="submit">Conectar</button></form>';
    const current=processorConfig();d.querySelector('#processor-url').value=current.endpoint;
    d.querySelector('#processor-token').value=current.token;
    let connected=false;
    d.querySelector('.close').onclick=()=>d.close();
    d.onclose=()=>{d.remove();resolve(connected);};
    d.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const button=d.querySelector('[type=submit]');button.disabled=true;
      try{
        const endpoint=normalizeEndpoint(d.querySelector('#processor-url').value.trim()),token=d.querySelector('#processor-token').value.trim();
        await processorJSON('/api/connection',{config:{endpoint,token}});
        if(!d.open)return;
        storeProcessor(endpoint,token);connected=true;d.close();
      }catch(e){d.querySelector('.error').textContent=e.message;}
      finally{button.disabled=false;}
    };
    document.body.append(d);d.showModal();
  });
}

export function generateScore(videoId,{onReady=()=>{},start=false,bpm=null}={}){
  if(!/^[\w-]{11}$/.test(videoId))throw new Error('Vídeo inválido.');
  const key=`compasso-generation:${videoId}`;
  const d=document.createElement('dialog');d.className='real-dialog generation-dialog';
  d.innerHTML='<button type="button" class="close" aria-label="Fechar">×</button><h2>Gerar partitura</h2><div class="generation-body"></div>';
  const body=d.querySelector('.generation-body');
  let timer,epoch=0,job=null,closed=false;
  const remember=value=>{try{if(value)localStorage.setItem(key,JSON.stringify(value));else localStorage.removeItem(key);}catch{}};
  try{job=JSON.parse(localStorage.getItem(key)||'null');}catch{}
  if(job && (job.endpoint!==processorConfig().endpoint||!job.id?.match(/^[a-f0-9]{32}$/)))job=null;
  d.onclose=()=>{closed=true;epoch++;clearTimeout(timer);d.remove();};
  d.querySelector('.close').onclick=()=>d.close();
  document.body.append(d);d.showModal();

  function form(message=''){
    body.innerHTML='<form><p>A IA identifica a bateria e organiza os compassos em 4/4, com precisão até semicolcheias.</p><details><summary>Ajustes opcionais</summary><label for="generation-bpm">BPM conhecido (opcional)</label><input id="generation-bpm" type="number" min="40" max="240" step="any" placeholder="Automático"><p>Informe somente se souber. Tercinas e outros compassos ainda não são suportados.</p></details><p class="error" role="alert"></p><button class="primary" type="submit">Gerar partitura</button><button class="generation-link processor-settings" type="button">Configurar processador</button></form>';
    body.querySelector('[role=alert]').textContent=message;
    if(bpm!==null)body.querySelector('input').value=bpm;
    body.querySelector('.processor-settings').onclick=()=>connectProcessor();
    body.querySelector('form').onsubmit=e=>{e.preventDefault();const value=body.querySelector('input').value;bpm=value?Number(value):null;begin();};
  }
  function progress(state){
    body.innerHTML='<ol class="generation-stages"></ol><p class="generation-status" role="status" aria-live="polite"></p><p class="generation-note">Você pode fechar esta janela e retomar pela música. O processamento continua no servidor.</p><button class="secondary cancel-generation">Cancelar análise</button>';
    const stages=[['queued','Na fila'],['preparing','Preparando o áudio'],['transcribing','Identificando a bateria'],['aligning','Organizando os compassos'],['completed','Salvando a partitura']];
    const index=stages.findIndex(s=>s[0]===state);
    for(let i=0;i<stages.length;i++){
      const li=document.createElement('li');li.textContent=stages[i][1];li.className=i<index?'done':i===index?'current':'';body.querySelector('ol').append(li);
    }
    body.querySelector('.generation-status').textContent=stages[index]?.[1]||'Consultando a análise…';
    body.querySelector('.cancel-generation').onclick=cancel;
  }
  function failure(error,code){
    body.innerHTML='<p class="error" role="alert"></p><button class="primary retry-generation">Tentar novamente</button><form class="generation-upload"><label for="generation-file">Ou envie MP3/WAV da mesma gravação</label><input id="generation-file" type="file" accept=".mp3,.wav" required><p>Use o áudio com o mesmo início do vídeo. Até 80 MB e 15 minutos.</p><button class="secondary" type="submit">Enviar áudio e gerar</button></form><button class="generation-link processor-settings">Configurar processador</button>';
    body.querySelector('[role=alert]').textContent=error;
    body.querySelector('.retry-generation').onclick=()=>job?resume():begin();
    body.querySelector('.processor-settings').onclick=async()=>{if(await connectProcessor()){if(job?.endpoint!==processorConfig().endpoint){job=null;remember(null);}if(!closed)form();}};
    body.querySelector('.generation-upload').onsubmit=e=>{
      e.preventDefault();const file=body.querySelector('input').files[0];
      if(!file || file.size>80*1024*1024){body.querySelector('[role=alert]').textContent='Selecione um MP3 ou WAV de até 80 MB.';return;}
      job=null;remember(null);begin(file);
    };
    // Never send a second recording while the first job may still be running.
    body.querySelector('.generation-upload').hidden=!!job;
  }
  async function begin(file=null){
    if(bpm!==null&&(!Number.isFinite(bpm)||bpm<40||bpm>240)){form('Informe um BPM entre 40 e 240.');return;}
    if(!processorConfig().endpoint||!processorConfig().token){
      form('Conecte o processador para iniciar a análise.');
      if(!await connectProcessor()||closed)return;
    }
    if(job){resume();return;}
    const run=++epoch;clearTimeout(timer);progress('preparing');
    body.querySelector('.cancel-generation').disabled=true;
    try{
      let result;
      if(file){
        const data=new FormData();data.set('video_id',videoId);data.set('bpm',bpm??'');data.set('audio',file);
        result=await processorJSON('/api/jobs/upload',{method:'POST',body:data,timeout:180000});
      }else result=await processorJSON('/api/jobs',{method:'POST',body:{video_id:videoId,bpm}});
      if(!/^[a-f0-9]{32}$/.test(result.id))throw new Error('Resposta inválida do processador.');
      job={id:result.id,endpoint:processorConfig().endpoint};remember(job);
      if(closed||run!==epoch)return;
      resume();
    }catch(e){if(!closed&&run===epoch)failure(e.message,e.code);}
  }
  async function resume(){
    if(!job){form();return;}
    const run=++epoch;clearTimeout(timer);progress('queued');
    async function poll(){
      if(closed||run!==epoch)return;
      try{
        const state=await processorJSON(`/api/jobs/${job.id}`);
        if(closed||run!==epoch)return;
        if(state.state==='failed'||state.state==='cancelled'){
          job=null;remember(null);failure(state.error||'Análise cancelada.',state.code);return;
        }
        if(!['queued','preparing','transcribing','aligning','completed'].includes(state.state))throw new Error('Estado de análise não reconhecido.');
        progress(state.state);
        if(state.state==='completed'){
          body.querySelector('.cancel-generation').disabled=true;
          const response=await processorRequest(`/api/jobs/${job.id}/result`);
          const blob=await response.blob();
          if(blob.size>5*1024*1024)throw new Error('O MIDI gerado excedeu o limite do app.');
          const score=parseDrumMidi(await blob.arrayBuffer());
          if(closed||run!==epoch)return;
          const previous=await getSession(`youtube:${videoId}`);
          await saveSession({...previous,id:`youtube:${videoId}`,kind:'youtube',score,midiName:'bateria-automatica.mid',offset:offsetForImport(score),measuresPerRow:previous?.measuresPerRow??2,autoScroll:previous?.autoScroll??true,title:state.summary?.title||previous?.title||'Vídeo do YouTube'});
          job=null;remember(null);
          if(!closed&&run===epoch){d.close();onReady();}
          return;
        }
        timer=setTimeout(poll,1500);
      }catch(e){
        if(closed||run!==epoch)return;
        if(e.code==='expired'){job=null;remember(null);}
        failure(e.message,e.code);
      }
    }
    poll();
  }
  async function cancel(){
    const run=++epoch;clearTimeout(timer);
    body.querySelector('.cancel-generation').disabled=true;
    try{
      if(job)await processorJSON(`/api/jobs/${job.id}`,{method:'DELETE'});
      if(closed||run!==epoch)return;
      job=null;remember(null);form('Análise cancelada.');
    }catch(e){if(!closed&&run===epoch)failure(e.message,e.code);}
  }
  if(job)resume();else if(start)begin();else form();
}
