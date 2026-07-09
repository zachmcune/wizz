import { test, expect, type Page } from '@playwright/test';

async function openSandboxPanel(page: Page): Promise<void> {
  const panel = page.getByTestId('sandbox-panel');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  if (await panel.evaluate((el) => el.classList.contains('collapsed'))) {
    await page.getByTestId('sandbox-fab').click();
  }
  await expect(panel).toHaveClass(/expanded/);
}

async function visitAllTabs(page: Page): Promise<void> {
  const tabs = [
    'economy',
    'units',
    'buildings',
    'ai',
    'map',
    'gameplay',
    'spells',
    'combat',
    'scenarios',
    'overlays',
  ] as const;
  for (const tab of tabs) {
    await page.getByTestId(`sandbox-tab-${tab}`).click();
    await expect(page.getByTestId('sandbox-body')).toBeVisible();
  }
}

test.describe('developer sandbox', () => {
  test('opens via ?sandbox=1, visits all tabs, runs representative actions', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('http://127.0.0.1:5173/?sandbox=1');

    const canvas = page.locator('[data-testid="game-canvas-host"] canvas');
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.hud')).toBeVisible();

    await openSandboxPanel(page);
    await visitAllTabs(page);

    // Economy
    await page.getByTestId('sandbox-tab-economy').click();
    await page.getByTestId('sandbox-mana-set-5k').click();
    await page.getByTestId('sandbox-chip-infiniteMana').click();
    await expect(page.getByTestId('sandbox-chip-infiniteMana')).toHaveClass(/active/);

    // Units — spawn
    await page.getByTestId('sandbox-tab-units').click();
    await page.getByTestId('sandbox-unit-select').selectOption('imp_swarmling');
    await page.getByTestId('sandbox-spawn-unit').click();

    // Play — pause / step / speed
    await page.getByTestId('sandbox-tab-gameplay').click();
    await page.getByTestId('sandbox-pause-toggle').click();
    await expect(page.getByTestId('sandbox-pause-toggle')).toHaveText('Resume');
    await page.getByTestId('sandbox-step-frame').click();
    await page.getByTestId('sandbox-speed-2').click();
    await page.getByTestId('sandbox-pause-toggle').click();

    // Command palette
    await page.getByTestId('sandbox-palette-open').click();
    await expect(page.getByTestId('sandbox-palette')).toBeVisible();
    await page.getByTestId('sandbox-palette-input').fill('give 100');
    await page.getByTestId('sandbox-palette-run').click();
    await expect(page.getByTestId('sandbox-palette')).toBeHidden();

    // Save scenario
    await page.getByTestId('sandbox-tab-scenarios').click();
    await page.getByTestId('sandbox-scenario-name').fill('e2e-sandbox-scenario');
    await page.getByTestId('sandbox-scenario-save').click();
    await expect(page.getByTestId('sandbox-scenario-name')).toBeVisible();

    // Restart from header
    await page.getByTestId('sandbox-restart').click();

    // Close via ✕ then reopen with backtick
    await page.getByTestId('sandbox-close').click();
    await expect(page.getByTestId('sandbox-panel')).toHaveClass(/collapsed/);
    await page.keyboard.press('`');
    await expect(page.getByTestId('sandbox-panel')).toHaveClass(/expanded/);

    // Filter tools
    await page.getByTestId('sandbox-tab-economy').click();
    await page.getByTestId('sandbox-filter').fill('mana');
    await expect(page.getByTestId('sandbox-mana-set-5k')).toBeVisible();

    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });

  test('opens via main menu Developer Sandbox button', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('http://127.0.0.1:5173/');
    await page.getByTestId('menu-dev-sandbox').click();

    const canvas = page.locator('[data-testid="game-canvas-host"] canvas');
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await openSandboxPanel(page);
    await expect(page.getByTestId('sandbox-tab-economy')).toBeVisible();

    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });

  test('AI / Map / Spells / Combat / Debug controls toggle without page errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('http://127.0.0.1:5173/?sandbox=1');
    await expect(page.locator('[data-testid="game-canvas-host"] canvas')).toBeVisible({ timeout: 15_000 });
    await openSandboxPanel(page);

    await page.getByTestId('sandbox-tab-ai').click();
    await page.getByTestId('sandbox-chip-multiPlayerControl').click();
    await page.getByTestId('sandbox-force-attack').click();
    await expect(page.getByTestId('sandbox-force-attack')).toHaveClass(/active/);
    await page.getByTestId('sandbox-force-expand').click();
    await expect(page.getByTestId('sandbox-force-expand')).toHaveClass(/active/);
    await page.getByTestId('sandbox-chip-ai-revealIntel').click();

    await page.getByTestId('sandbox-tab-map').click();
    await page.getByTestId('sandbox-chip-revealMap').click();
    await expect(page.getByTestId('sandbox-chip-revealMap')).toHaveClass(/active/);

    await page.getByTestId('sandbox-tab-spells').click();
    await page.getByTestId('sandbox-chip-noCooldowns').click();
    await page.getByTestId('sandbox-chip-noManaCost').click();
    await page.getByTestId('sandbox-cast-spell').click();

    await page.getByTestId('sandbox-tab-buildings').click();
    await page.getByTestId('sandbox-spawn-building').click();
    await page.getByTestId('sandbox-chip-ignorePlacementRestrictions').click();

    await page.getByTestId('sandbox-tab-combat').click();
    await page.getByTestId('sandbox-clear-all').click();

    await page.getByTestId('sandbox-tab-overlays').click();
    await page.getByTestId('sandbox-overlay-unitIds').click();
    await page.getByTestId('sandbox-overlay-visionRadius').click();

    await page.getByTestId('sandbox-tab-scenarios').click();
    await page.getByTestId('sandbox-scenario-builtin:early-game').click();

    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });
});
