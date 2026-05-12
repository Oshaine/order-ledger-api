/**
 * Seeds menu from data/restaurantMenuSeed.json.
 *
 * Images: each item may include `image_url` (https) — stored as-is. If missing, defaults to the
 * frontend static asset `/foodbox.png` (served from `public/foodbox.png`): full URL is
 * `${FRONTEND_URL}/foodbox.png` (default FRONTEND_URL http://localhost:5173). Override with
 * MENU_SEED_IMAGE_URL (absolute https URL). Only if no JSON url and no default would Pexels/picsum run.
 *
 * Items with small/medium/large get one row per defined price; single-price items use **Large** only.
 *
 * Run (append to existing menu):
 *   CONFIRM_SEED=yes node scripts/seedRestaurantMenu.js
 *
 * Reseed (delete all menu rows + sizes, then seed):
 *   REPLACE_MENU=yes CONFIRM_SEED=yes node scripts/seedRestaurantMenu.js
 *   # or: node scripts/seedRestaurantMenu.js --yes --replace-menu
 *   REPLACE_MENU also deletes all sales (and payments, sale lines, deliveries, cash denominations)
 *   so menu_item_sizes can be removed — same data loss as clearing sales for FK reasons.
 *
 * Append only JSON items whose names are not already in menu (keeps sales / existing rows):
 *   APPEND_MISSING=yes CONFIRM_SEED=yes node scripts/seedRestaurantMenu.js
 *   # or: node scripts/seedRestaurantMenu.js --yes --append-missing
 *
 * Optional: PEXELS_RATE_MS=400 (delay between Pexels calls, default 350)
 *
 * Inventory (menu sizes link to Food Box rows on the seed branch):
 *   - Optional: MENU_SEED_INVENTORY_ITEM_ID, or SMALL/MEDIUM/LARGE IDs, or data/menuSeedInventory.json
 *   - If none of the above: auto-use Small/Medium/Large Food Box rows already on the seed branch.
 *   Seed branch: MENU_SEED_BRANCH_ID, else first active branch that has those three Food Box rows,
 *   else alphabetically first active branch.
 *
 * Force every dish image to frontend foodbox (ignore JSON image_url):
 *   MENU_SEED_FORCE_FOODBOX_IMAGE=yes
 *
 * Remove old placeholder rows after re-seeding: CONFIRM=yes node scripts/removeMenuSeedInventory.js
 */
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  sequelize,
  Branch,
  InventoryItem,
  MenuItem,
  MenuItemSize,
  CashDenomination,
  Payment,
  SaleItem,
  Delivery,
  Sale
} = require('../models');
const { Op } = require('sequelize');
const { normalizeUuid, sameUuid } = require('../utils/branchUuid');

const SEED_PATH = path.join(__dirname, '../data/restaurantMenuSeed.json');
const INVENTORY_CONFIG_PATH = path.join(__dirname, '../data/menuSeedInventory.json');
const PEXELS_SEARCH = 'https://api.pexels.com/v1/search';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parsePrice(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  const s = String(val).replace(/\+$/, '').replace(/[^\d.]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function sizesForItem(item) {
  const rows = [];
  const addIf = (sizeLabel, key) => {
    const pr = parsePrice(item[key]);
    if (pr != null) rows.push({ size: sizeLabel, price: pr });
  };

  const hasPortionPrices =
    parsePrice(item.small) != null ||
    parsePrice(item.medium) != null ||
    parsePrice(item.large) != null;

  if (hasPortionPrices) {
    addIf('Small', 'small');
    addIf('Medium', 'medium');
    addIf('Large', 'large');
    if (rows.length > 0) return rows;
  }

  if (item.price_min != null && item.price_max != null) {
    const min = parsePrice(item.price_min);
    const max = parsePrice(item.price_max);
    if (min != null && max != null) {
      return [{ size: 'Large', price: Math.round(((min + max) / 2) * 100) / 100 }];
    }
  }

  const single = parsePrice(item.price);
  if (single != null) {
    return [{ size: 'Large', price: single }];
  }

  return [{ size: 'Large', price: 500 }];
}

function fallbackImageUrl(name, sectionName) {
  const key = crypto.createHash('md5').update(`${sectionName}|${name}`).digest('hex').slice(0, 12);
  return `https://picsum.photos/seed/${key}/480/360`;
}

/** Build a concise food-photo search query for Pexels */
function pexelsSearchQuery(dishName, sectionName) {
  const dish = String(dishName)
    .replace(/[—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const section = String(sectionName || '').trim();
  let q = `${dish} ${section} food`;
  if (q.length > 100) q = `${dish} food plate`;
  return q;
}

const queryToUrlCache = new Map();

/**
 * @param {string} dishName
 * @param {string} sectionName
 * @param {string|null} apiKey
 * @param {number} rateMs delay after each successful network request (not used on cache hit)
 * @param {{ count: number }} stats increments when a real Pexels HTTP request is made
 */
async function resolveMenuImageUrl(dishName, sectionName, apiKey, rateMs, stats) {
  const query = pexelsSearchQuery(dishName, sectionName);
  if (queryToUrlCache.has(query)) {
    return queryToUrlCache.get(query);
  }

  if (!apiKey) {
    const fb = fallbackImageUrl(dishName, sectionName);
    queryToUrlCache.set(query, fb);
    return fb;
  }

  const url = new URL(PEXELS_SEARCH);
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', '1');
  url.searchParams.set('orientation', 'landscape');

  const doFetch = async () => {
    stats.count += 1;
    const res = await fetch(url.toString(), {
      headers: { Authorization: apiKey.trim() }
    });
    if (res.status === 429) {
      const err = new Error('Pexels rate limited (429)');
      err.status = 429;
      throw err;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`Pexels HTTP ${res.status} for "${query}":`, text.slice(0, 120));
      return null;
    }
    const data = await res.json();
    const photo = data.photos?.[0];
    const src =
      photo?.src?.large2x ||
      photo?.src?.large ||
      photo?.src?.medium ||
      photo?.src?.original ||
      null;
    return src;
  };

  let src = null;
  try {
    src = await doFetch();
  } catch (e) {
    if (e.status === 429) {
      console.warn('Pexels 429, waiting 3s and retrying once…');
      await sleep(3000);
      try {
        src = await doFetch();
      } catch (e2) {
        console.warn('Pexels retry failed:', e2.message);
      }
    } else {
      console.warn('Pexels request failed:', e.message);
    }
  }

  if (src) {
    queryToUrlCache.set(query, src);
    await sleep(rateMs);
    return src;
  }

  const fb = fallbackImageUrl(dishName, sectionName);
  queryToUrlCache.set(query, fb);
  return fb;
}

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

async function ensureImageColumn() {
  const dialect = sequelize.getDialect();
  try {
    if (dialect === 'mysql') {
      await sequelize.query('ALTER TABLE menu_items MODIFY COLUMN image VARCHAR(2048) NULL');
    } else if (dialect === 'postgres') {
      await sequelize.query('ALTER TABLE menu_items ALTER COLUMN image TYPE VARCHAR(2048)');
    }
  } catch (e) {
    console.warn('Image column alter (optional):', e.message);
  }
}

async function clearAllMenu() {
  const t = await sequelize.transaction();
  try {
    const deletedCash = await CashDenomination.destroy({ where: {}, transaction: t });
    const deletedPayments = await Payment.destroy({ where: {}, transaction: t });
    const deletedSaleItems = await SaleItem.destroy({ where: {}, transaction: t });
    const deletedDeliveries = await Delivery.destroy({ where: {}, transaction: t });
    const deletedSales = await Sale.destroy({ where: {}, transaction: t });
    const nSizes = await MenuItemSize.destroy({ where: {}, transaction: t });
    const nItems = await MenuItem.destroy({ where: {}, transaction: t });
    await t.commit();
    console.log(
      `Cleared menu: ${nSizes} sizes, ${nItems} items. ` +
        `Also removed ${deletedSales} sales (${deletedSaleItems} sale lines, ${deletedPayments} payments, ${deletedCash} cash denomination rows, ${deletedDeliveries} deliveries) so FK allows menu replace.`
    );
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

function imageUrlFromJsonItem(item) {
  if (process.env.MENU_SEED_FORCE_FOODBOX_IMAGE === 'yes') {
    return null;
  }
  const raw = item.image_url != null ? String(item.image_url).trim() : '';
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  return raw.length > 2048 ? raw.slice(0, 2048) : raw;
}

/** Full URL to frontend `public/foodbox.png` (or MENU_SEED_IMAGE_URL). */
function getDefaultSeedMenuImageUrl() {
  const explicit = (process.env.MENU_SEED_IMAGE_URL || process.env.MENU_DEFAULT_IMAGE_URL || '').trim();
  if (explicit && /^https?:\/\//i.test(explicit)) {
    return explicit.length > 2048 ? explicit.slice(0, 2048) : explicit;
  }
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const url = `${base}/foodbox.png`;
  return url.length > 2048 ? url.slice(0, 2048) : url;
}

/**
 * Uses JSON image_url when valid (unless MENU_SEED_FORCE_FOODBOX_IMAGE=yes); otherwise foodbox / Pexels / picsum.
 */
async function resolveItemImage(item, name, sectionName, pexelsKey, rateMs, stats) {
  const fromJson = imageUrlFromJsonItem(item);
  if (fromJson) return fromJson;
  const fallback = getDefaultSeedMenuImageUrl();
  if (fallback) return fallback;
  return resolveMenuImageUrl(name, sectionName, pexelsKey, rateMs, stats);
}

function menuNeedsPexelsOrFetch(data) {
  if (getDefaultSeedMenuImageUrl()) return false;
  for (const sec of data.menu?.sections || []) {
    for (const item of sec.items || []) {
      if (!imageUrlFromJsonItem(item)) return true;
    }
  }
  return false;
}

function readOptionalMenuSeedInventoryJson() {
  if (!fs.existsSync(INVENTORY_CONFIG_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(INVENTORY_CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('Invalid data/menuSeedInventory.json:', e.message);
    process.exit(1);
  }
}

/**
 * @returns {Promise<{ Small: object, Medium: object, Large: object }>}
 */
async function loadMenuSeedInventoryPool(branchIdNorm) {
  const j = readOptionalMenuSeedInventoryJson() || {};

  const envSingle = normalizeUuid(process.env.MENU_SEED_INVENTORY_ITEM_ID);
  const fileSingle = normalizeUuid(j.itemId || j.inventoryItemId);
  const single = envSingle || fileSingle;

  const smallId =
    normalizeUuid(process.env.MENU_SEED_INVENTORY_SMALL_ID) || normalizeUuid(j.smallId);
  const mediumId =
    normalizeUuid(process.env.MENU_SEED_INVENTORY_MEDIUM_ID) || normalizeUuid(j.mediumId);
  const largeId =
    normalizeUuid(process.env.MENU_SEED_INVENTORY_LARGE_ID) || normalizeUuid(j.largeId);

  let sId;
  let mId;
  let lId;
  if (single) {
    sId = mId = lId = single;
  } else if (smallId && mediumId && largeId) {
    sId = smallId;
    mId = mediumId;
    lId = largeId;
  } else {
    const standardNames = ['Small Food Box', 'Medium Food Box', 'Large Food Box'];
    const rows = await InventoryItem.findAll({
      where: {
        branchId: branchIdNorm,
        category: 'Food Box',
        name: { [Op.in]: standardNames }
      }
    });
    const byName = new Map(rows.map((r) => [r.name, r]));
    const sRow = byName.get('Small Food Box');
    const mRow = byName.get('Medium Food Box');
    const lRow = byName.get('Large Food Box');
    if (sRow && mRow && lRow) {
      sId = sRow.id;
      mId = mRow.id;
      lId = lRow.id;
      console.log('Menu seed: using Small/Medium/Large Food Box rows on the seed branch (auto-discovered).');
    } else {
      console.error(
        'Menu seed inventory is not configured. Do one of:\n' +
          '  • Ensure the seed branch has Small/Medium/Large Food Box inventory rows, or\n' +
          '  • Set MENU_SEED_INVENTORY_ITEM_ID=<uuid> (one Food Box row used for Small/Medium/Large on the menu), or\n' +
          '  • Set MENU_SEED_INVENTORY_SMALL_ID, MENU_SEED_INVENTORY_MEDIUM_ID, MENU_SEED_INVENTORY_LARGE_ID, or\n' +
          '  • Copy data/menuSeedInventory.example.json to data/menuSeedInventory.json and add UUIDs.\n' +
          'Inventory rows must belong to the seed branch (MENU_SEED_BRANCH_ID or first active branch with Food Box stock).'
      );
      process.exit(1);
    }
  }

  const loadOne = async (id, label) => {
    const row = await InventoryItem.findByPk(id);
    if (!row) {
      console.error(`Inventory not found (${label}): ${id}`);
      process.exit(1);
    }
    if (!sameUuid(row.branchId, branchIdNorm)) {
      console.error(
        `Inventory "${row.name}" (${label}) belongs to another branch. ` +
          `Expected branch ${branchIdNorm}, got ${normalizeUuid(row.branchId)}. ` +
          'Set MENU_SEED_BRANCH_ID to match that inventory branch, or use items from the seed branch.'
      );
      process.exit(1);
    }
    return row;
  };

  const Small = await loadOne(sId, 'Small');
  const Medium = await loadOne(mId, 'Medium');
  const Large = await loadOne(lId, 'Large');
  return { Small, Medium, Large };
}

/**
 * Prefer an active branch that already has Food Box inventory (S/M/L names),
 * so seed works when the alphabetically-first branch has no stock rows yet.
 */
async function pickSeedBranchPreferringInventory() {
  const branches = await Branch.findAll({ where: { isActive: true }, order: [['name', 'ASC']] });
  if (!branches.length) {
    console.error('No active branch found. Create a branch first.');
    process.exit(1);
  }
  for (const b of branches) {
    const n = await InventoryItem.count({
      where: {
        branchId: b.id,
        category: 'Food Box',
        name: { [Op.in]: ['Small Food Box', 'Medium Food Box', 'Large Food Box'] }
      }
    });
    if (n >= 3) return b;
  }
  return branches[0];
}

async function resolveSeedBranch() {
  const explicit = normalizeUuid(process.env.MENU_SEED_BRANCH_ID);
  if (explicit) {
    const b = await Branch.findByPk(explicit);
    if (!b) {
      console.error(`MENU_SEED_BRANCH_ID not found: ${explicit}`);
      process.exit(1);
    }
    if (!b.isActive) {
      console.error(`Branch is inactive: ${explicit}`);
      process.exit(1);
    }
    return b;
  }
  return pickSeedBranchPreferringInventory();
}

async function main() {
  const ok = process.env.CONFIRM_SEED === 'yes' || process.argv.includes('--yes');
  if (!ok) {
    console.error('Refusing to run. Set CONFIRM_SEED=yes or pass --yes');
    process.exit(1);
  }

  const replaceMenu =
    process.env.REPLACE_MENU === 'yes' || process.argv.includes('--replace-menu');
  const appendMissing =
    process.env.APPEND_MISSING === 'yes' || process.argv.includes('--append-missing');

  if (replaceMenu && appendMissing) {
    console.error('Use either REPLACE_MENU or APPEND_MISSING, not both.');
    process.exit(1);
  }

  const raw = fs.readFileSync(SEED_PATH, 'utf8');
  const data = JSON.parse(raw);
  const sections = data.menu?.sections || [];
  const expectedItems = sections.reduce((acc, s) => acc + (s.items || []).length, 0);
  console.log(
    `JSON: ${sections.length} section(s), ${expectedItems} item(s) in ${path.basename(SEED_PATH)}`
  );

  const needsFetch = menuNeedsPexelsOrFetch(data);
  if (process.env.MENU_SEED_FORCE_FOODBOX_IMAGE === 'yes') {
    const u = getDefaultSeedMenuImageUrl();
    console.log(
      `MENU_SEED_FORCE_FOODBOX_IMAGE=yes — JSON image_url ignored; every dish uses: ${u}`
    );
  }
  if (needsFetch && typeof fetch !== 'function') {
    console.error('Node 18+ required (global fetch) when any item lacks image_url or PEXELS_API_KEY is used.');
    process.exit(1);
  }

  const pexelsKey = process.env.PEXELS_API_KEY || null;
  const rateMs = Math.max(0, parseInt(process.env.PEXELS_RATE_MS || '350', 10) || 350);

  if (needsFetch) {
    if (!pexelsKey) {
      console.warn('PEXELS_API_KEY not set — items without image_url use picsum placeholders.');
    } else {
      console.log(`Using Pexels API for items missing image_url (rate delay ${rateMs}ms).`);
    }
  } else {
    const def = getDefaultSeedMenuImageUrl();
    if (def && data.menu?.sections?.some((s) => (s.items || []).some((it) => !imageUrlFromJsonItem(it)))) {
      console.log(`Default menu image (no Pexels): ${def}`);
    } else {
      console.log('All items have image_url — skipping Pexels / fetch for images.');
    }
  }

  await sequelize.authenticate();
  await ensureImageColumn();

  if (replaceMenu) {
    await clearAllMenu();
  }

  if (appendMissing) {
    const existing = await MenuItem.count();
    console.log(`Append-missing mode: ${existing} menu row(s) already in DB; will skip duplicates by name.`);
  }

  const seedBranch = await resolveSeedBranch();
  const branchNorm = normalizeUuid(seedBranch.id);
  const inv = await loadMenuSeedInventoryPool(branchNorm);
  console.log(
    `Menu sizes will deduct inventory: Small="${inv.Small.name}" Medium="${inv.Medium.name}" Large="${inv.Large.name}" (branch: ${seedBranch.name})`
  );

  let created = 0;
  let skipped = 0;
  const pexelsStats = { count: 0 };

  for (const section of sections) {
    const sectionNotes = [section.notes].filter(Boolean).join(' — ');
    for (const item of section.items || []) {
      const name = truncate(item.name, 100);
      if (appendMissing) {
        const dup = await MenuItem.findOne({ where: { name }, attributes: ['id'] });
        if (dup) {
          skipped += 1;
          continue;
        }
      }
      const descParts = [`Section: ${section.name}`];
      if (sectionNotes) descParts.push(sectionNotes);
      if (item.notes) descParts.push(item.notes);
      const description = descParts.join(' | ') || null;

      const sizeRows = sizesForItem(item);
      const image = await resolveItemImage(item, name, section.name, pexelsKey, rateMs, pexelsStats);

      const menuItem = await MenuItem.create({
        name,
        description,
        image,
        branchId: null,
        isActive: true
      });

      for (const row of sizeRows) {
        const invRow = inv[row.size];
        await MenuItemSize.create({
          menuItemId: menuItem.id,
          size: row.size,
          price: row.price,
          inventoryItemId: invRow.id,
          isActive: true
        });
      }
      created += 1;
    }
  }

  if (appendMissing) {
    console.log(`Seeded ${created} new menu item(s), skipped ${skipped} existing name(s).`);
  } else {
    console.log(`Seeded ${created} menu items.`);
  }
  if (pexelsKey && needsFetch) {
    console.log(`Pexels API requests: ${pexelsStats.count} (only for items without image_url).`);
  }
  console.log(`Seed branch: ${seedBranch.name} (${seedBranch.id})`);
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
