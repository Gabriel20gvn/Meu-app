import {test,expect} from '@playwright/test';

test('local app preselects its own processor without asking for a server address',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Nova música',exact:true}).click();
  await page.getByLabel('Link do YouTube').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByRole('button',{name:'Gerar partitura',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Conectar processador'})).toBeVisible();
  const url=new URL(page.url());
  const expected=url.port==='5173'?`${url.protocol}//${url.hostname}:8000`:url.origin;
  await expect(page.getByLabel('Endereço do processador')).toHaveValue(expected);
});

test('phone on a private Wi-Fi address can connect to the same local processor',async({page})=>{
  const host='http://192.168.18.23:8000';
  await page.route(`${host}/**`,async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/connection'){
      await route.fulfill({json:{max_audio_mb:80,max_minutes:15}});
      return;
    }
    const target=`http://127.0.0.1:5173${url.pathname}${url.search}`;
    await route.fulfill({response:await route.fetch({url:target})});
  });
  await page.goto(host);
  await page.getByRole('button',{name:'Nova música',exact:true}).click();
  await page.getByLabel('Link do YouTube').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByRole('button',{name:'Gerar partitura',exact:true}).click();
  await expect(page.getByLabel('Endereço do processador')).toHaveValue(host);
  await page.getByLabel('Chave de acesso').fill('test-key-for-private-wifi');
  await page.getByRole('button',{name:'Conectar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Conectar processador'})).toBeHidden();
});
