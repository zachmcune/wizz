// DOES THE BUILD-ORDER RESERVE EVER LET A 550-750 PURCHASE HAPPEN?
//
// The AI's second refinery (750), second producer (550), golem forge (850) and nexus (1200) were all measured as
// "saving for X (n/cost)" for whole matches. This tabulates the reserve arithmetic directly, so the claim is a table
// rather than a reading of the code, then simulates a bank under income to show where it saturates.
//
//   npx vite-node audit/reserve-convergence.ts

/** The SHIPPED policy before the fix, extracted verbatim from `planEconomy` §5. */
function oldReserve(mana: number, cost: number): number {
  const gap = Math.max(0, cost - mana);
  const share = gap > cost * 0.5 ? 0.35 : 0.6;
  return Math.max(0, Math.min(Math.floor(mana * share), Math.max(0, mana - 260)));
}

/** The shipped policy after the fix. */
function newReserve(mana: number, cost: number): number {
  const closing = mana * 2 >= cost;
  return closing
    ? Math.max(0, Math.floor(mana - 120))
    : Math.max(0, Math.min(Math.floor(mana * 0.35), Math.max(0, mana - 260)));
}

console.log('BANK  | old: reserve/spendable | new: reserve/spendable   (cost 750)');
for (const mana of [100, 200, 300, 400, 500, 550, 600, 650, 700, 750, 800]) {
  const o = oldReserve(mana, 750);
  const n = newReserve(mana, 750);
  console.log(
    `${String(mana).padStart(4)}  |      ${String(o).padStart(3)} / ${String(mana - o).padStart(3)}        ` +
      `|      ${String(n).padStart(3)} / ${String(mana - n).padStart(3)}`,
  );
}

/**
 * Simulate the bank over a match: fixed income, and the army spends one unit (cost `unit`) whenever the spendable figure
 * covers it. This is the smallest model that reproduces the treadmill — no combat, no losses, just income and spending
 * against the reserve.
 */
function simulate(
  cost: number,
  unit: number,
  incomePerSecond: number,
  seconds: number,
  reserve: typeof oldReserve,
): { peak: number; funded: boolean } {
  let bank = 300;
  let peak = bank;
  for (let s = 0; s < seconds; s++) {
    bank += incomePerSecond;
    peak = Math.max(peak, bank);
    if (bank >= cost) return { peak, funded: true };
    /**
     * The army buys AT MOST ONE unit a second (that is the production cadence: a unit takes seconds to build, and the
     * planner issues one `produce` per pass while the reserve allows). Spawning a whole batch per tick spent the bank to
     * zero and made every policy look identical, which is the mistake this model existed to avoid.
     */
    if (bank - reserve(bank, cost) >= unit) bank -= unit;
  }
  return { peak, funded: false };
}

/**
 * The army's cheapest unit is 115-140 in this content set, not 200 (a wisp is the only 200 unit and it is not an army
 * unit). That detail is what the reserve's 260 floor was sized around, so the simulation uses the real figure.
 */
console.log('\n15-minute bank simulation, income 10/s, army unit 140 (imp_swarmling)');
for (const [name, fn] of [
  ['old policy', oldReserve],
  ['new policy', newReserve],
] as const) {
  const r = simulate(750, 140, 10, 900, fn);
  console.log(`  ${name.padEnd(10)} peak bank=${String(r.peak).padStart(4)}  750-refinery funded=${r.peak >= 750}`);
}
