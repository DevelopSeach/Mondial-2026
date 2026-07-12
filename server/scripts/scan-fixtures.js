#!/usr/bin/env node

require('dotenv').config();

const db = require('../db');
const { scanAvailableFixturesFromESPN } = require('../services/scraper');

(async () => {
  try {
    await db.ping();
    const changes = await scanAvailableFixturesFromESPN();
    console.log(JSON.stringify({ ok: true, scanned: changes.length, changes }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e.message }, null, 2));
    process.exit(1);
  }
})();
