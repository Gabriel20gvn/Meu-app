const MAX_LENGTH=160;

export function lyricAt(lyrics,index){
  const value=lyrics?.[index];
  return typeof value==='string'?value:'';
}

export function showBarLyrics(container,lyrics){
  container.querySelectorAll('.real-measure').forEach(button=>{
    const index=Number(button.dataset.index),line=button.querySelector('.bar-lyric');
    if(!line)return;
    const lyric=lyricAt(lyrics,index);
    line.textContent=lyric;
    line.hidden=!lyric;
    button.setAttribute('aria-label',`Ir para compasso ${index+1}${lyric?`. Letra: ${lyric}`:''}`);
  });
}

export function openBarLyricsEditor({count,lyrics,startIndex=0,save,parent=document.body}){
  if(!count)return;
  const d=document.createElement('dialog');
  d.className='real-dialog bar-lyrics-dialog';
  d.innerHTML=`<button type="button" class="close" aria-label="Fechar">×</button><form><h2>Letra por compasso</h2><p>Escreva o trecho cantado neste compasso. Deixe vazio quando não houver letra.</p><label for="lyric-bar">Compasso</label><select id="lyric-bar"></select><label for="bar-lyric-text">Trecho da letra</label><textarea id="bar-lyric-text" maxlength="${MAX_LENGTH}" rows="3" placeholder="Trecho cantado neste compasso"></textarea><div class="bar-lyrics-navigation"><button type="button" class="secondary" id="lyric-previous">Anterior</button><button type="button" class="secondary" id="lyric-next">Próximo</button></div><p class="error" role="alert"></p><button class="primary" type="submit">Salvar letra</button></form>`;
  const select=d.querySelector('#lyric-bar'),input=d.querySelector('#bar-lyric-text');
  const previous=d.querySelector('#lyric-previous'),next=d.querySelector('#lyric-next');
  const submit=d.querySelector('[type=submit]'),error=d.querySelector('[role=alert]');
  let current=Math.max(0,Math.min(count-1,startIndex)),saved={...lyrics},busy=false;
  function options(){
    select.innerHTML=Array.from({length:count},(_,index)=>`<option value="${index}">Compasso ${index+1}${lyricAt(saved,index)?' · com letra':''}</option>`).join('');
  }
  function show(index){
    current=index;select.value=String(index);input.value=lyricAt(saved,index);
    error.textContent='';controls();
  }
  function controls(){
    const changed=input.value.trim()!==lyricAt(saved,current),locked=busy||changed;
    select.disabled=locked;previous.disabled=locked||current===0;next.disabled=locked||current===count-1;
    submit.disabled=busy||!changed;
    submit.textContent=current===count-1?'Salvar letra':'Salvar e próximo';
  }
  d.querySelector('.close').onclick=()=>d.close();
  d.onclose=()=>d.remove();
  previous.onclick=()=>show(current-1);
  next.onclick=()=>show(current+1);
  select.onchange=()=>show(Number(select.value));
  input.oninput=controls;
  d.querySelector('form').onsubmit=async event=>{
    event.preventDefault();
    const value=input.value.trim();
    if(value.length>MAX_LENGTH)return;
    const updated={...saved};
    if(value)updated[current]=value;else delete updated[current];
    busy=true;controls();
    try{
      await save(updated);
      if(!d.isConnected)return;
      saved=updated;options();show(Math.min(current+1,count-1));
    }catch(e){error.textContent=e.message;}
    finally{busy=false;controls();}
  };
  options();show(current);
  parent.append(d);d.showModal();return d;
}
