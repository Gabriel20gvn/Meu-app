import {test,expect} from '@playwright/test';
test('mobile demo plays, pauses, seeks and returns to library',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:/Cada música/})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.getByRole('button',{name:/Explorar demonstração/}).click();
 await expect(page.locator('.measure')).toHaveCount(8);
 await page.getByRole('button',{name:'Reproduzir',exact:true}).click();
 await expect(page.locator('#elapsed')).not.toHaveText('0:00',{timeout:5000});
 await page.getByRole('button',{name:'Pausar',exact:true}).click();
 const paused=await page.locator('#seek').inputValue();
 await page.waitForTimeout(300);expect(await page.locator('#seek').inputValue()).toBe(paused);
 await page.getByRole('button',{name:'Refrão 0:10'}).click();
 await expect(page.locator('#elapsed')).toHaveText('0:10');
 await expect(page.locator('[data-bar="4"]')).toHaveClass(/active/);
 await page.getByRole('button',{name:'Repetir música',exact:true}).click();
 await expect(page.locator('#loop')).toHaveAttribute('aria-pressed','true');
 await page.screenshot({path:'/tmp/compasso-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Minha biblioteca',exact:true}).click();
 await expect(page.getByRole('heading',{name:/Minha biblioteca/})).toBeVisible();
 expect(errors).toEqual([]);
});
test('YouTube links are validated, persisted, deduplicated and removable',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Nova música',exact:true}).click();
 await page.getByLabel('Link do YouTube').fill('https://example.com/watch?v=dQw4w9WgXcQ');
 await page.getByRole('button',{name:'Salvar link'}).click();await expect(page.getByRole('alert')).toContainText('link válido');
 await page.getByLabel('Link do YouTube').fill('https://youtu.be/dQw4w9WgXcQ');await page.getByRole('button',{name:'Salvar link'}).click();
 await page.reload();await expect(page.getByText('YOUTUBE',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Nova música',exact:true}).click();await page.getByLabel('Link do YouTube').fill('https://youtu.be/dQw4w9WgXcQ');await page.getByRole('button',{name:'Salvar link'}).click();await expect(page.getByRole('alert')).toContainText('já está');
 await page.getByRole('button',{name:'Fechar',exact:true}).click();await page.getByRole('button',{name:'Remover da biblioteca'}).click();await page.reload();await expect(page.locator('.pending-card')).toHaveCount(0);
});
test('desktop library fits the viewport',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:'/tmp/compasso-desktop.png',fullPage:true});
});
