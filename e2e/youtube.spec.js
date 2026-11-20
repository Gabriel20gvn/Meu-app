import {test, expect} from '@playwright/test';

const videoId = 'dQw4w9WgXcQ';
const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1`;
const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

async function saveYoutubeLink(page) {
  await page.goto('/');
  await page.getByRole('button', {name: 'Nova música', exact: true}).click();
  await page.getByLabel('Link do YouTube').fill(
    `https://youtu.be/${videoId}?si=shared&autoplay=0&origin=https%3A%2F%2Fexample.com`
  );
  await page.getByRole('button', {name: 'Salvar link'}).click();
  await expect(page.getByText('YOUTUBE', {exact: true})).toBeVisible();
}

test('saved YouTube link opens an embedded player, fits mobile and stops on return', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Exercise the app integration without contacting YouTube or claiming real streaming.
  await page.route('https://www.youtube.com/embed/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body>Simulated YouTube embed</body></html>',
  }));

  await saveYoutubeLink(page);
  await page.reload();
  await expect(page.getByText('YOUTUBE', {exact: true})).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('button', {name: 'Reproduzir vídeo', exact: true}).click();

  const study = page.locator('.youtube-study');
  const iframe = study.locator('.youtube-player iframe');
  await expect(study.getByRole('heading', {name: 'Vídeo do YouTube', exact: true})).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(iframe).toHaveAttribute('title', 'Reprodutor de vídeo do YouTube');
  await expect(iframe).toHaveAttribute('src', embedUrl);
  await expect(iframe).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  expect(await iframe.evaluate(element => element.allowFullscreen)).toBe(true);
  await expect(page.frameLocator('.youtube-player iframe').getByText('Simulated YouTube embed')).toBeVisible();

  for (const viewport of [{width: 390, height: 844}, {width: 320, height: 640}, {width: 844, height: 390}]) {
    await page.setViewportSize(viewport);
    const bounds = await iframe.boundingBox();
    expect(bounds.height).toBeGreaterThanOrEqual(200);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }

  await expect(study.getByRole('link', {name: /^Abrir no YouTube/})).toHaveAttribute('href', watchUrl);
  await study.getByRole('button', {name: 'Minha biblioteca', exact: true}).click();
  await expect(page.getByRole('heading', {name: /Minha biblioteca/})).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('button', {name: 'Reproduzir vídeo', exact: true}).click();
  await expect(page.locator('iframe')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a blocked embed keeps the direct YouTube fallback available', async ({page}) => {
  await page.route('https://www.youtube.com/embed/**', route => route.abort('failed'));
  await saveYoutubeLink(page);
  const blockedEmbed = page.waitForEvent('requestfailed', {
    predicate: request => request.url() === embedUrl,
  });
  await page.getByRole('button', {name: 'Reproduzir vídeo', exact: true}).click();
  await blockedEmbed;

  const fallback = page.locator('.youtube-study').getByRole('link', {name: /^Abrir no YouTube/});
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute('href', watchUrl);
  await expect(fallback).toHaveAttribute('target', '_blank');
  await expect(fallback).toHaveAttribute('rel', /noopener/);
});
