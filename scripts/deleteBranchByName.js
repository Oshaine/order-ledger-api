/**
 * Deletes one branch after migrating users and re-pointing menu inventory links to the keep branch.
 * Prefers keeping a branch whose name matches /Mandeville/i; otherwise keeps the first other branch.
 *
 *   DELETE_BRANCH_NAME="Main Branch" CONFIRM=yes node scripts/deleteBranchByName.js
 */
require('dotenv').config();
const { sequelize, Branch } = require('../models');
const { purgeBranchIntoKeep } = require('../utils/purgeBranchData');

const TARGET = (process.env.DELETE_BRANCH_NAME || 'Main Branch').trim();

async function main() {
  const ok = process.env.CONFIRM === 'yes' || process.argv.includes('--yes');
  if (!ok) {
    console.error('Refusing to run. Set CONFIRM=yes or pass --yes');
    process.exit(1);
  }

  await sequelize.authenticate();
  const branches = await Branch.findAll({ order: [['name', 'ASC']] });
  const targetLower = TARGET.toLowerCase();
  const victim =
    branches.find((b) => b.name.trim().toLowerCase() === targetLower) ||
    branches.find((b) => b.name.toLowerCase().includes(targetLower));

  if (!victim) {
    console.error(`Branch not found matching: ${TARGET}`);
    process.exit(1);
  }

  const others = branches.filter((b) => b.id !== victim.id);
  if (others.length === 0) {
    console.error('Cannot delete the only branch.');
    process.exit(1);
  }

  const keep =
    others.find((b) => /mandeville/i.test(b.name)) ||
    others.find((b) => b.isActive) ||
    others[0];

  const t = await sequelize.transaction();
  try {
    await purgeBranchIntoKeep(victim.id, keep.id, t);
    await t.commit();
    console.log(`Deleted branch "${victim.name}".`);
    console.log(`Users and menu stock links now use "${keep.name}" (${keep.id}).`);
  } catch (e) {
    await t.rollback();
    console.error(e);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
