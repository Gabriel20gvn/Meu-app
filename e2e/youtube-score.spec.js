import {test,expect} from '@playwright/test';
import MidiPackage from '@tonejs/midi';
const {Midi}=MidiPackage;
function midiFile(offset){
 const midi=new Midi();midi.header.setTempo(120);midi.header.timeSignatures=[{ticks:0,timeSignature:[4,4]}];
 if(offset!==undefined)midi.header.meta=[{type:'marker',ticks:0,text:`COMPASSO_SYNC_V1:${offset}`}];
 const track=midi.addTrack();track.channel=9;
 for(let i=0;i<32;i++)track.addNote({midi:i%2?38:36,time:i*.5,duration:.1,velocity:.8});
 for(const [midi,time] of [[42,0],[49,0],[46,.125],[54,.25],[56,.375]])track.addNote({midi,time,duration:.05,velocity:.8});
 return {name:'bateria.mid',mimeType:'audio/midi',buffer:Buffer.from(midi.toArray())};
}
test('YouTube MIDI follows video time, seeks with offset, saves settings and remains separate from audio',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://www.youtube.com/embed/**',route=>route.fulfill({contentType:'text/html',body:'Player de teste'}));
 // Official API boundary mock: real streaming must be verified on the published site.
 await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({contentType:'text/javascript',body:`
 window.videoClock={time:0,state:2,destroyed:false};
 window.YT={Player:class {
 constructor(frame,options){queueMicrotask(()=>options.events.onReady());}
 getCurrentTime(){return window.videoClock.time;}
 getDuration(){return 60;}
 getPlayerState(){return window.videoClock.state;}
 getVideoData(){return {title:'Ensaio no YouTube'};}
 seekTo(t){window.videoClock.time=t;}
 destroy(){window.videoClock.destroyed=true;}
 }};window.onYouTubeIframeAPIReady();` }));
 await page.goto('/');await page.getByRole('button',{name:'Nova música',exact:true}).click();
 await page.getByLabel('Link do YouTube').fill('https://youtu.be/dQw4w9WgXcQ');
 await page.getByRole('button',{name:'Salvar link'}).click();
 await page.getByRole('button',{name:'Reproduzir vídeo',exact:true}).click();
 await page.getByRole('button',{name:'Importar MIDI de bateria',exact:true}).click();
 await page.getByLabel('Arquivo MIDI').setInputFiles(midiFile(.149));await page.getByRole('button',{name:'Usar MIDI',exact:true}).click();
 await expect(page.locator('.real-measure')).toHaveCount(8);
 await expect(page.locator('.engraving svg').first()).toBeVisible();
 await page.getByRole('button',{name:'Opções da música'}).click();
 await page.getByRole('button',{name:'Letra por compasso'}).click();
 await page.getByLabel('Compasso',{exact:true}).selectOption('1');
 await page.getByLabel('Trecho da letra').fill('Chegou o refrão');
 await page.getByRole('button',{name:'Salvar e próximo'}).click();
 await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await expect(page.locator('[data-index="1"] .bar-lyric')).toHaveText('Chegou o refrão');
 expect(await page.locator('[data-index="1"] .bar-lyric').evaluate(e=>e.getBoundingClientRect().bottom<e.nextElementSibling.getBoundingClientRect().top)).toBe(true);
 await expect(page.getByRole('button',{name:'Importar MIDI de bateria',exact:true})).toBeHidden();
 await expect(page.getByLabel('Compassos por linha')).toHaveCount(0);
 await page.evaluate(()=>{window.videoClock.time=4.2;});
 await expect(page.locator('[data-index="2"]')).toHaveClass(/active/);
 await page.getByRole('button',{name:'Opções da música'}).click();
 await expect(page.getByLabel('Ajuste de sincronização (segundos)')).toHaveValue('0.149');
 await page.getByLabel('Ajuste de sincronização (segundos)').fill('1');
 await page.getByLabel('Compassos por linha').selectOption('4');
 await page.getByLabel('Visualização',{exact:true}).selectOption('grid');
 await page.getByLabel('Rolagem automática').uncheck();
 await page.getByRole('button',{name:'Salvar ajustes'}).click();
 await expect(page.locator('[data-index="1"]')).toHaveClass(/active/);
 await expect(page.locator('.drum-grid').first()).toBeVisible();
 await expect(page.locator('[data-index="1"] .bar-lyric')).toHaveText('Chegou o refrão');
 expect(await page.evaluate(()=>window.videoClock.time)).toBe(4.2);
 expect(await page.evaluate(()=>window.videoClock.state)).toBe(2);
 const first=page.locator('[data-index="0"]');
 const simultaneous=first.locator('.grid-hit[data-slot="0"]');
 await expect(simultaneous).toHaveCount(3);
 expect(new Set(await simultaneous.evaluateAll(es=>es.map(e=>e.getAttribute('x')))).size).toBe(1);
 await expect(first.locator('.grid-hit[data-slot="1"][data-pitches="46"]')).toHaveCount(1);
 await expect(first.locator('.grid-hit[data-slot="2"][data-pitches="54"]')).toHaveCount(1);
 await expect(first.locator('.grid-hit[data-slot="3"][data-pitches="56"]')).toHaveCount(1);
 await page.getByRole('button',{name:'Ir para compasso 4',exact:true}).click();
 expect(await page.evaluate(()=>window.videoClock.time)).toBe(7);
 await expect(page.locator('[data-index="3"]')).toHaveClass(/active/);
 await page.evaluate(()=>{window.videoClock.time=0;});await expect(page.locator('.real-measure.active')).toHaveCount(0);
 await page.getByRole('button',{name:'Opções da música'}).click();await page.getByRole('button',{name:'Trocar MIDI',exact:true}).click();
 await page.getByLabel('Arquivo MIDI').setInputFiles({name:'bad.mid',mimeType:'audio/midi',buffer:Buffer.from('invalid')});
 await page.getByRole('button',{name:'Usar MIDI',exact:true}).click();await expect(page.locator('dialog [role=alert]')).toContainText('inválido');
 await page.getByRole('button',{name:'Fechar',exact:true}).click();await expect(page.locator('.real-measure')).toHaveCount(8);
 await page.getByRole('button',{name:'Minha biblioteca',exact:true}).click();
 expect(await page.evaluate(()=>window.videoClock.destroyed)).toBe(true);
 await expect(page.locator('iframe')).toHaveCount(0);await expect(page.locator('#real-library article')).toHaveCount(0);
 await page.reload();await page.getByRole('button',{name:'Reproduzir vídeo',exact:true}).click();
 await expect(page.locator('.real-measure')).toHaveCount(8);
 await page.getByRole('button',{name:'Opções da música'}).click();
 await expect(page.getByLabel('Ajuste de sincronização (segundos)')).toHaveValue('1');
 await expect(page.getByLabel('Compassos por linha')).toHaveValue('4');
 await expect(page.getByLabel('Visualização',{exact:true})).toHaveValue('grid');
 await expect(page.getByLabel('Rolagem automática')).not.toBeChecked();
 await expect(page.locator('[data-index="1"] .bar-lyric')).toHaveText('Chegou o refrão');
 await page.getByRole('button',{name:'Fechar',exact:true}).click();
 for(const width of [320,390,844]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.setViewportSize({width:390,height:844});
 // Auto-follow must move horizontally as well as vertically in grid view.
 await page.getByRole('button',{name:'Opções da música'}).click();
 await page.getByLabel('Rolagem automática').check();await page.getByRole('button',{name:'Salvar ajustes'}).click();
 await page.evaluate(()=>{window.videoClock.time=7;window.videoClock.state=1;});
 await expect.poll(()=>page.locator('.youtube-score-scroll').evaluate(e=>e.scrollLeft)).toBeGreaterThan(500);
 await expect(page.locator('[data-index="3"]')).toHaveClass(/active/);
 await page.evaluate(()=>{window.videoClock.state=2;});
 // Change only the display: the clock, offset and imported notes remain intact.
 await page.getByRole('button',{name:'Opções da música'}).click();
 await page.getByLabel('Visualização',{exact:true}).selectOption('notation');
 await page.getByRole('button',{name:'Salvar ajustes'}).click();
 await expect(page.locator('.drum-grid')).toHaveCount(0);
 await expect(page.locator('.engraving svg').first()).toBeVisible();
 expect(await page.evaluate(()=>window.videoClock.time)).toBe(7);
 await page.getByRole('button',{name:'Opções da música'}).click();
 await page.getByLabel('Visualização',{exact:true}).selectOption('grid');
 await page.getByLabel('Compassos por linha').selectOption('1');
 await page.getByRole('button',{name:'Salvar ajustes'}).click();
 await expect(page.locator('.drum-grid').first()).toBeVisible();
 await page.screenshot({path:'/tmp/compasso-youtube-score.png',fullPage:true});
 // A replacement from the automatic notebook supplies its own alignment.
 await page.getByRole('button',{name:'Opções da música'}).click();
 await page.getByRole('button',{name:'Trocar MIDI',exact:true}).click();
 await page.getByLabel('Arquivo MIDI').setInputFiles(midiFile(-.123456));
 await page.getByRole('button',{name:'Usar MIDI',exact:true}).click();
 await expect(page.locator('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Opções da música'}).click();
 await expect(page.getByLabel('Ajuste de sincronização (segundos)')).toHaveValue('-0.123456');
 await page.getByRole('button',{name:'Salvar ajustes'}).click();
 await expect(page.locator('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Minha biblioteca',exact:true}).click();
 await page.reload();await page.getByRole('button',{name:'Reproduzir vídeo',exact:true}).click();
 await page.getByRole('button',{name:'Opções da música'}).click();
 await expect(page.getByLabel('Ajuste de sincronização (segundos)')).toHaveValue('-0.123456');
 expect(errors).toEqual([]);
});
