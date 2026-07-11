import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
}

async function startSoloMatch(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('http://127.0.0.1:5173/');
  await page.getByTestId('menu-custom-game').click();
  await page.getByTestId('lobby-template').selectOption('skirmish_1v1');
  await page.getByTestId('lobby-start').click();
  await page.waitForSelector('[data-testid="game-canvas-host"] canvas', { timeout: 15_000 });
}

test('solo canvas repaints when camera pans', async ({ page }) => {
  await startSoloMatch(page);

  const canvas = page.locator('[data-testid="game-canvas-host"] canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;

  await canvas.screenshot({ path: '/tmp/canvas-before.png' });

  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(cx + box.width * 0.2, cy + box.height * 0.15, { steps: 6 });
  await page.mouse.up({ button: 'middle' });

  await canvas.screenshot({ path: '/tmp/canvas-after.png' });

  const before = hashFile('/tmp/canvas-before.png');
  const after = hashFile('/tmp/canvas-after.png');
  expect(after).not.toBe(before);
});
