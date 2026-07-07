import { test, expect } from '@playwright/test';

test.describe('smoke', () => {
  test('menu → custom game → start match → issue move command', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('http://127.0.0.1:5173/');

    await page.getByTestId('menu-custom-game').click();
    await page.getByTestId('lobby-template').selectOption('skirmish_1v1');
    await page.getByTestId('lobby-start').click();

    const canvas = page.locator('[data-testid="game-canvas-host"] canvas');
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.hud')).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    if (!box) return;

    const selectX = box.x + box.width * 0.45;
    const selectY = box.y + box.height * 0.52;
    const moveX = box.x + box.width * 0.65;
    const moveY = box.y + box.height * 0.45;

    await page.mouse.click(selectX, selectY);
    await page.mouse.click(moveX, moveY);

    await page.waitForTimeout(800);
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });
});
