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

    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
    await page.mouse.up({ button: 'middle' });

    await page.mouse.wheel(24, -36);
    await page.keyboard.down('d');
    await page.waitForTimeout(120);
    await page.keyboard.up('d');

    const dragStartX = box.x + box.width * 0.35;
    const dragStartY = box.y + box.height * 0.35;
    const dragEndX = box.x + box.width * 0.48;
    const dragEndY = box.y + box.height * 0.48;
    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    await page.mouse.move(dragEndX, dragEndY, { steps: 4 });
    await expect(page.locator('.box-select')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('.box-select')).toBeHidden();

    await page.waitForTimeout(800);
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });
});
