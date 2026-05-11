/**
 * Seeds menu from data/restaurantMenuSeed.json.
 *
 * Images: each item may include `image_url` (https) — stored as-is. If missing, uses Pexels when
 * PEXELS_API_KEY is set, else picsum placeholder (see https://www.pexels.com/api/ ).
 *
 * Items with small/medium/large get one row per defined price; single-price items use **Large** only.
 *
 * Run (append to existing menu):
 *   CONFIRM_SEED=yes node scripts/seedRestaurantMenu.js
 *
 * Reseed (delete all menu rows + sizes, then seed):
 *   REPLACE_MENU=yes CONFIRM_SEED=yes node scripts/seedRestaurantMenu.js
 *   # or: node scripts/seedRestaurantMenu.js --yes --replace-menu
 *
 * Optional: PEXELS_RATE_MS=400 (delay between Pexels calls, default 350)
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
  MenuItemSize
} = require('../models');

const SEED_PATH = path.join(__dirname, '../data/restaurantMenuSeed.json');
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
    const nSizes = await MenuItemSize.destroy({ where: {}, transaction: t });
    const nItems = await MenuItem.destroy({ where: {}, transaction: t });
    await t.commit();
    console.log(`Cleared menu: ${nSizes} sizes, ${nItems} items.`);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

function imageUrlFromJsonItem(item) {
  const raw = item.image_url != null ? String(item.image_url).trim() : '';
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  return raw.length > 2048 ? raw.slice(0, 2048) : raw;
}

/**
 * Uses JSON image_url when valid; otherwise Pexels / picsum (no HTTP call for JSON URLs).
 */
async function resolveItemImage(item, name, sectionName, pexelsKey, rateMs, stats) {
  const fromJson = imageUrlFromJsonItem(item);
  if (fromJson) return fromJson;
  return resolveMenuImageUrl(name, sectionName, pexelsKey, rateMs, stats);
}

function menuNeedsPexelsOrFetch(data) {
  for (const sec of data.menu?.sections || []) {
    for (const item of sec.items || []) {
      if (!imageUrlFromJsonItem(item)) return true;
    }
  }
  return false;
}

async function ensureInventoryPool(branchId) {
  const existing = await InventoryItem.findAll({
    where: { branchId },
    limit: 50
  });
  const byLabel = {};
  for (const row of existing) {
    if (row.name === 'Menu seed — Small') byLabel.Small = row;
    if (row.name === 'Menu seed — Medium') byLabel.Medium = row;
    if (row.name === 'Menu seed — Large') byLabel.Large = row;
  }
  const need = ['Small', 'Medium', 'Large'].filter((s) => !byLabel[s]);
  for (const size of need) {
    byLabel[size] = await InventoryItem.create({
      name: `Menu seed — ${size}`,
      category: 'Food Box',
      size,
      currentStock: 9999,
      lowStockThreshold: 0,
      unit: 'portion',
      branchId
    });
  }
  return byLabel;
}

async function main() {
  const ok = process.env.CONFIRM_SEED === 'yes' || process.argv.includes('--yes');
  if (!ok) {
    console.error('Refusing to run. Set CONFIRM_SEED=yes or pass --yes');
    process.exit(1);
  }

  const replaceMenu =
    process.env.REPLACE_MENU === 'yes' || process.argv.includes('--replace-menu');

  const raw = fs.readFileSync(SEED_PATH, 'utf8');
  const data = JSON.parse(raw);
  const sections = data.menu?.sections || [];

  const needsFetch = menuNeedsPexelsOrFetch(data);
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
    console.log('All items have image_url — skipping Pexels / fetch for images.');
  }

  await sequelize.authenticate();
  await ensureImageColumn();

  if (replaceMenu) {
    await clearAllMenu();
  }

  const branch = await Branch.findOne({ where: { isActive: true }, order: [['name', 'ASC']] });
  if (!branch) {
    console.error('No active branch found. Create a branch first.');
    process.exit(1);
  }

  const inv = await ensureInventoryPool(branch.id);
  let created = 0;
  const pexelsStats = { count: 0 };

  for (const section of sections) {
    const sectionNotes = [section.notes].filter(Boolean).join(' — ');
    for (const item of section.items || []) {
      const name = truncate(item.name, 100);
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

  console.log(`Seeded ${created} menu items.`);
  if (pexelsKey && needsFetch) {
    console.log(`Pexels API requests: ${pexelsStats.count} (only for items without image_url).`);
  }
  console.log(`Branch inventory pool: ${branch.name} (${branch.id})`);
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
