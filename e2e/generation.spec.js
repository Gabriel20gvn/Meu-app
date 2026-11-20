import {test,expect} from '@playwright/test';
import MidiPackage from '@tonejs/midi';
const {Midi}=MidiPackage;
const endpoint='https://processor.test';
const video='dQw4w9WgXcQ';
const job='a'.repeat(32);
const second='b'.repeat(32);
const token='test-only-access-key-32-characters';

function resultMidi(){
  const midi=new Midi();midi.header.setTempo(120);
  midi.header.timeSignatures=[{ticks:0,timeSignature:[4,4]}];
  midi.header.meta=[{type:'marker',ticks:0,text:'COMPASSO_SYNC_V1:0.149'}];
  const track=midi.addTrack();track.channel=9;
  // Preserve a silent introductory bar, then four bars of synthetic drums.
  for(let i=0;i<16;i++)track.addNote({midi:i%2?38:35,time:2+i*.5,duration:.1});
  return Buffer.from(midi.toArray());
}
async function setup(page,handler,{configured=true}={}){
  if(configured)await page.addInitScript(({endpoint,token})=>{
    if(window!==window.top)return;
    localStorage.setItem('compasso-processor',endpoint);
    sessionStorage.setItem('compasso-processor-token',token);
  },{endpoint,token});
  await page.route(endpoint+'/**',async route=>{
    const request=route.request();
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'authorization,content-type'}});
    const path=new URL(request.url()).pathname;
    if(path.endsWith('/result'))return route.fulfill({contentType:'audio/midi',body:resultMidi()});
    await handler(route,path,request);
  });
  await page.route('https://www.youtube.com/embed/**',route=>route.fulfill({contentType:'text/html',body:'Player de teste'}));
  await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({contentType:'text/javascript',body:`
    window.videoClock={time:0};window.YT={Player:class {
    constructor(frame,options){queueMicrotask(()=>options.events.onReady());}
    getCurrentTime(){return window.videoClock.time;}getDuration(){return 60;}
    getPlayerState(){return 2;}getVideoData(){return {title:'Teste de geração'};}
    seekTo(t){window.videoClock.time=t;}destroy(){}}};window.onYouTubeIframeAPIReady();`}));
  await page.goto('/');
}
async function start(page,bpm){
  await page.getByRole('button',{name:'Nova música',exact:true}).click();
  await page.getByLabel('Link do YouTube').fill('https://youtu.be/'+video);
  if(bpm){await page.getByText('Ajustes opcionais',{exact:true}).click();await page.getByLabel('BPM conhecido (opcional)').fill(bpm);}
  await page.getByRole('button',{name:'Gerar partitura',exact:true}).click();
}
const reply=(route,value,status=200)=>route.fulfill({status,json:value});

test('link generates a score with optional BPM, saves alignment and keeps it if regeneration fails',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let state='transcribing',posts=0;
  await setup(page,async(route,path,request)=>{
    expect(request.headers().authorization).toBe('Bearer '+token);
    if(request.method()==='POST'){
      posts++;expect(request.postDataJSON()).toEqual({video_id:video,bpm:posts===1?101:null});
      return reply(route,{id:posts===1?job:second,state:'queued'},202);
    }
    return reply(route,path.endsWith(second)?{id:second,state:'failed',error:'Não foi possível analisar.',code:'processing_failed'}:{id:job,state,summary:{title:'Teste gerado'}});
  });
  await start(page,'101');await expect(page.getByRole('status')).toHaveText('Identificando a bateria');
  await page.screenshot({path:'/tmp/compasso-generation-progress.png',fullPage:true});
  state='completed';
  await expect(page.locator('.real-measure')).toHaveCount(5);
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Opções da música'}).click();
  await expect(page.getByLabel('Ajuste de sincronização (segundos)')).toHaveValue('0.149');
  await page.getByLabel('Visualização',{exact:true}).selectOption('grid');
  await page.getByRole('button',{name:'Salvar ajustes'}).click();
  await page.reload();await page.getByRole('button',{name:'Reproduzir vídeo',exact:true}).click();
  await expect(page.locator('.real-measure')).toHaveCount(5);
  await expect(page.locator('.drum-grid').first()).toBeVisible();
  await page.getByRole('button',{name:'Opções da música'}).click();
  await page.getByRole('button',{name:'Gerar novamente',exact:true}).click();
  await page.getByRole('button',{name:'Gerar partitura',exact:true}).click();
  await expect(page.locator('dialog [role=alert]')).toHaveText('Não foi possível analisar.');
  await page.getByRole('button',{name:'Fechar',exact:true}).click();
  await expect(page.locator('.real-measure')).toHaveCount(5);
  await expect(page.locator('.drum-grid').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('blocked YouTube audio offers upload and generates from the same recording',async({page})=>{
  let uploads=0;
  await setup(page,async(route,path,request)=>{
    if(path==='/api/jobs'&&request.method()==='POST'){
      expect(request.postDataJSON().bpm).toBeNull();return reply(route,{id:job,state:'queued'},202);
    }
    if(path==='/api/jobs/upload'){
      uploads++;expect(request.headers()['content-type']).toContain('multipart/form-data');
      expect(request.postDataBuffer().toString()).toContain('same-recording.wav');
      return reply(route,{id:second,state:'queued'},202);
    }
    return reply(route,path.endsWith(second)?{id:second,state:'completed'}:{id:job,state:'failed',code:'youtube_unavailable',error:'O YouTube não liberou o áudio. Envie um MP3 ou WAV da mesma gravação para continuar.'});
  });
  await start(page);await expect(page.locator('dialog [role=alert]')).toContainText('YouTube não liberou');
  await page.getByLabel('Ou envie MP3/WAV da mesma gravação').setInputFiles({name:'same-recording.wav',mimeType:'audio/wav',buffer:Buffer.from('synthetic test upload')});
  await page.getByRole('button',{name:'Enviar áudio e gerar'}).click();
  await expect(page.locator('.real-measure')).toHaveCount(5);expect(uploads).toBe(1);
});

test('closing and reloading resumes the existing job and cancellation does not enqueue another',async({page})=>{
  let posts=0,deletes=0;
  await setup(page,async(route,path,request)=>{
    if(request.method()==='POST'){posts++;return reply(route,{id:job,state:'queued'},202);}
    if(request.method()==='DELETE'){deletes++;return reply(route,{id:job,state:'cancelled'});}
    return reply(route,{id:job,state:'transcribing'});
  });
  await start(page);await expect(page.getByRole('status')).toHaveText('Identificando a bateria');
  await page.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.reload();await page.getByRole('button',{name:'Reproduzir vídeo',exact:true}).click();
  await page.getByRole('button',{name:'Gerar partitura',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Identificando a bateria');
  await page.getByRole('button',{name:'Cancelar análise'}).click();
  await expect(page.locator('dialog [role=alert]')).toHaveText('Análise cancelada.');
  expect(posts).toBe(1);expect(deletes).toBe(1);
  expect(await page.evaluate(video=>localStorage.getItem('compasso-generation:'+video),video)).toBeNull();
});

test('first use validates the processor key before starting any analysis',async({page})=>{
  let posts=0;
  await setup(page,async(route,path,request)=>{
    if(path==='/api/connection')return reply(route,request.headers().authorization==='Bearer '+token?{status:'ok'}:{detail:'A chave de acesso ao processador é inválida.'},request.headers().authorization==='Bearer '+token?200:401);
    if(request.method()==='POST'){posts++;return reply(route,{id:job,state:'queued'},202);}
    return reply(route,{id:job,state:'completed'});
  },{configured:false});
  await start(page);await expect(page.getByRole('heading',{name:'Conectar processador'})).toBeVisible();expect(posts).toBe(0);
  await page.getByLabel('Endereço do processador').fill(endpoint);
  await page.getByLabel('Chave de acesso').fill('invalid');await page.getByRole('button',{name:'Conectar',exact:true}).click();
  await expect(page.locator('dialog').last().getByRole('alert')).toContainText('inválida');expect(posts).toBe(0);
  await page.getByLabel('Chave de acesso').fill(token);await page.getByRole('button',{name:'Conectar',exact:true}).click();
  await expect(page.locator('.real-measure')).toHaveCount(5);expect(posts).toBe(1);
  expect(await page.evaluate(()=>localStorage.getItem('compasso-processor-token'))).toBeNull();
});
