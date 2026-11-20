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
