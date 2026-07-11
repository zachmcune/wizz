import { test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
}

test('solo screenshots differ over time', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.getByTestId('menu-custom-game').click();
  await page.getByTestId('lobby-template').selectOption('skirmish_1v1');
  await page.getByTestId('lobby-start').click();
  await page.waitForSelector('[data-testid="game-canvas-host"] canvas', { timeout: 15_000 });
  await page.waitForTimeout(1000);
  await page.locator('[data-testid="game-canvas-host"] canvas').screenshot({ path: '/tmp/canvas-t0.png' });
  await page.waitForTimeout(2500);
  await page.locator('[data-testid="game-canvas-host"] canvas').screenshot({ path: '/tmp/canvas-t2.png' });
  const h0 = hashFile('/tmp/canvas-t0.png');
  const h2 = hashFile('/tmp/canvas-t2.png');
  console.log('canvas hash t0', h0, 't2', h2);
  if (h0 === h2) throw new Error(`Canvas screenshot unchanged: ${h0}`);
});
