/**
 * Clears sales, deliveries, menu, inventory (+ logs), then creates standard inventory on each
 * active branch (same names for cross-branch POS stock mirroring), then seeds
 * data/restaurantMenuSeed.json with every menu image set to `${FRONTEND_URL}/foodbox.png`
 * (default FRONTEND_URL http://localhost:5173).
 *
 * Inventory per branch (6 rows):
 *   Small / Medium / Large Food Box — menu seed links these to portion sizes.
 *   Small / Medium / Large Soup Cup — extra stock lines for soup.
 *
 * Run from API project root:
 *   CONFIRM_RESET=yes node scripts/resetAndReseedMenu.js
 *   # or: CONFIRM_RESET=yes npm run reset-and-reseed-menu
 *
 * Optional: FRONTEND_URL=https://your-site.com  (stored image URL becomes that origin + /foodbox.png)
 *
 * The menu step always sets MENU_SEED_FORCE_FOODBOX_IMAGE=yes and pins MENU_SEED_BRANCH_ID to the
 * same branch as the Small/Medium/Large Food Box UUIDs passed from step 2.
 */
require('dotenv').config();
const path = require('path');
const { spawnSync } = require('child_process');

/** Rows created on every active branch (name + category + size). Menu uses Food Box S/M/L only. */
const STANDARD_INVENTORY_ROWS = [
  { name: 'Small Food Box', category: 'Food Box', size: 'Small' },
  { name: 'Medium Food Box', category: 'Food Box', size: 'Medium' },
  { name: 'Large Food Box', category: 'Food Box', size: 'Large' },
  { name: 'Small Soup Cup', category: 'Soup Cup', size: 'Small' },
  { name: 'Medium Soup Cup', category: 'Soup Cup', size: 'Medium' },
  { name: 'Large Soup Cup', category: 'Soup Cup', size: 'Large' }
];

const apiRoot = path.join(__dirname, '..');

async function main() {
  const ok = process.env.CONFIRM_RESET === 'yes' || process.argv.includes('--yes');
  if (!ok) {
    console.error('Refusing to run. Set CONFIRM_RESET=yes or pass --yes');
    process.exit(1);
  }

  console.log('Step 1/3: Clearing sales, menu, inventory, inventory logs…');
  const clear = spawnSync('node', [path.join(__dirname, 'clearBusinessData.js'), '--yes'], {
    cwd: apiRoot,
    stdio: 'inherit',
    env: { ...process.env, CONFIRM_CLEAR: 'yes' }
  });
  if (clear.status !== 0) {
    console.error('Clear step failed.');
    process.exit(clear.status || 1);
  }

  console.log('\nStep 2/3: Creating standard inventory on each active branch…');
  const { sequelize, Branch, InventoryItem } = require('../models');
  await sequelize.authenticate();

  const branches = await Branch.findAll({ where: { isActive: true }, order: [['name', 'ASC']] });
  if (!branches.length) {
    console.error('No active branch. Create a branch before reseeding.');
    await sequelize.close();
    process.exit(1);
  }

  for (const b of branches) {
    for (const row of STANDARD_INVENTORY_ROWS) {
      await InventoryItem.create({
        name: row.name,
        category: row.category,
        size: row.size,
        currentStock: 100,
        lowStockThreshold: 10,
        unit: row.category === 'Soup Cup' ? 'cup' : 'box',
        branchId: b.id
      });
      console.log(`  + ${row.name} @ ${b.name}`);
    }
  }

  // Prefer Mandeville for menu seed inventory IDs when multiple branches exist (not alphabetically first).
  const seedBranch =
    branches.find((b) => /mandeville/i.test(b.name || '')) || branches[0];
  console.log(`  (Menu seed will link Food Box S/M/L to: ${seedBranch.name})`);
  const smallFb = await InventoryItem.findOne({
    where: { branchId: seedBranch.id, name: 'Small Food Box' }
  });
  const mediumFb = await InventoryItem.findOne({
    where: { branchId: seedBranch.id, name: 'Medium Food Box' }
  });
  const largeFb = await InventoryItem.findOne({
    where: { branchId: seedBranch.id, name: 'Large Food Box' }
  });
  if (!smallFb || !mediumFb || !largeFb) {
    console.error('Missing Food Box inventory rows on seed branch.');
    await sequelize.close();
    process.exit(1);
  }
  await sequelize.close();

  const foodboxBase = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  console.log(
    `\nStep 3/3: Seeding menu (default image for every dish: ${foodboxBase}/foodbox.png; Food Box S/M/L → portions)…`
  );
  const seed = spawnSync('node', [path.join(__dirname, 'seedRestaurantMenu.js'), '--yes'], {
    cwd: apiRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      CONFIRM_SEED: 'yes',
      // Same branch as the inventory UUIDs below (overrides MENU_SEED_BRANCH_ID in .env for this run).
      MENU_SEED_BRANCH_ID: seedBranch.id,
      MENU_SEED_INVENTORY_SMALL_ID: smallFb.id,
      MENU_SEED_INVENTORY_MEDIUM_ID: mediumFb.id,
      MENU_SEED_INVENTORY_LARGE_ID: largeFb.id,
      MENU_SEED_FORCE_FOODBOX_IMAGE: 'yes'
    }
  });
  if (seed.status !== 0) {
    console.error('Seed step failed.');
    process.exit(seed.status || 1);
  }

  console.log('\nDone. Reset + menu reseed complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
