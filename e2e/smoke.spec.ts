import { expect, test } from '@playwright/test';

const shots = '/opt/cursor/artifacts';

test('upload, edit, and export STL and 3MF', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.screenshot({ path: `${shots}/designer.png` });
  await page.getByLabel('Upload artwork').setInputFiles('public/samples/heart.png');
  await page.getByRole('button', { name: 'Trace' }).click();
  const largest = page.getByRole('button', { name: 'Largest only' });
  if (await largest.isVisible().catch(() => false)) await largest.click();
  await expect(page.locator('.statusbar')).toContainText('mm', { timeout: 30000 });
  const depth = page.getByLabel('Blade depth (mm)');
  await depth.fill('14');
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/preview.png` });
  await page.getByRole('button', { name: 'Export free' }).click();
  await page.screenshot({ path: `${shots}/export-menu.png` });
  const stl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download STL' }).click();
  expect((await stl).suggestedFilename()).toMatch(/\.stl$/);
  await page.getByRole('button', { name: 'Export free' }).click();
  const threemf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download 3MF' }).click();
  expect((await threemf).suggestedFilename()).toMatch(/\.3mf$/);
});

test('sign-in screen and embed route', async ({ page }) => {
  await page.goto('/#/account');
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  await page.screenshot({ path: `${shots}/sign-in.png` });
  await page.setContent('<div id="host"></div>');
  await page.evaluate(() => {
    const bag = globalThis as { __msgs?: { type?: string }[] };
    bag.__msgs = [];
    window.addEventListener('message', (event) => bag.__msgs?.push(event.data));
    const frame = document.createElement('iframe');
    frame.title = 'Embedded Nenocutter';
    frame.src = 'http://127.0.0.1:5173/#/embed';
    frame.style.width = '1100px';
    frame.style.height = '760px';
    frame.style.border = '0';
    document.body.appendChild(frame);
  });
  await page.waitForFunction(() => {
    const messages = (globalThis as { __msgs?: { type?: string }[] }).__msgs ?? [];
    return messages.some((message) => message?.type === 'ready');
  });
  await expect(page.frameLocator('iframe').locator('.statusbar')).toContainText('mm', { timeout: 20000 });
  await page.screenshot({ path: `${shots}/embed.png` });
});
