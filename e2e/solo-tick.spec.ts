import { test, expect } from '@playwright/test';

test('solo sim tick advances (mana/hud)', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.getByTestId('menu-custom-game').click();
  await page.getByTestId('lobby-template').selectOption('skirmish_1v1');
  await page.getByTestId('lobby-start').click();
  await page.waitForSelector('[data-testid="game-canvas-host"] canvas', { timeout: 15_000 });

  const mana = page.locator('.stat-mana');
  await expect(mana).toBeVisible();
  const m0 = await mana.textContent();
  await page.waitForTimeout(2000);
  const m1 = await mana.textContent();
  const dbg = page.locator('.dbg-btn');
  await dbg.click();
  const debug = page.locator('.debug-overlay');
  await expect(debug).toBeVisible();
  const d0 = await debug.textContent();
  await page.waitForTimeout(1500);
  const d1 = await debug.textContent();
  expect(d1).not.toBe(d0);
  console.log('mana', m0, '->', m1, 'debug', d0, '->', d1);
});
