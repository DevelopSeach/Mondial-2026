#!/usr/bin/env node
require('dotenv').config();

const db = require('../db');
const { upsertPlayers, players } = require('../lib/players-catalog');

async function fillPlayers() {
  console.log('🌍 Filling players catalog...');

  try {
    await db.ping();
  } catch (e) {
    console.error('✗ No database access. Run db:create and db:init first.');
    console.error('   Message:', e.message);
    process.exit(1);
  }

  const before = await db.one('SELECT COUNT(*) AS n FROM players');
  const existing = Number(before?.n || 0);

  await db.tx(async (t) => {
    await upsertPlayers(t);
  });

  const after = await db.one('SELECT COUNT(*) AS n FROM players');
  const total = Number(after?.n || 0);

  console.log(`   ✓ source catalog rows: ${players.length}`);
  console.log(`   ✓ players before: ${existing}`);
  console.log(`   ✓ players after: ${total}`);
  console.log('✅ Players fill completed');
}

fillPlayers()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('✗ Players fill failed:', e.message);
    process.exit(1);
  });
