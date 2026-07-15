#!/usr/bin/env node

require('dotenv').config();

const path = require('path');
const { execFileSync } = require('child_process');

const db = require('../db');
const { scanAvailableFixturesFromESPN, scrapeFromESPN } = require('../services/scraper');

async function clearEspnOverride() {
  await db.run(
    'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
    ['espn_scoreboard_url', '']
  );
}

(async () => {
  try {
    await db.ping();

    const serverDir = path.join(__dirname, '..');
    execFileSync(process.execPath, ['seed.js'], {
      cwd: serverDir,
      stdio: 'inherit'
    });

    await clearEspnOverride();
    const changes = await scanAvailableFixturesFromESPN();
    const sync = await scrapeFromESPN();

    console.log(JSON.stringify({
      ok: true,
      fixed: true,
      scanned: changes.length,
      synced: sync.length
    }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e.message }, null, 2));
    process.exit(1);
  }
})();
