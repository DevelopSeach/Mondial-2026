const db = require('../db');
const players = require('../data/players');

async function upsertPlayers(tx = db) {
  let count = 0;
  for (const player of players) {
    await tx.run(`
      INSERT INTO players (external_id, name_en, name_he, country_en, country_he, team_code, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name_en = VALUES(name_en),
        name_he = VALUES(name_he),
        country_en = VALUES(country_en),
        country_he = VALUES(country_he),
        team_code = VALUES(team_code),
        image_url = VALUES(image_url)
    `, [
      player.external_id || null,
      player.name_en,
      player.name_he || player.name_en,
      player.country_en || null,
      player.country_he || player.country_en || null,
      player.team_code || null,
      player.image_url || null
    ]);
    count += 1;
  }
  return count;
}

async function seedPlayersIfEmpty() {
  const row = await db.one('SELECT COUNT(*) AS n FROM players');
  const count = Number(row?.n || 0);
  if (count > 0) return { inserted: 0, skipped: true, existing: count };

  const inserted = await db.tx(async (t) => upsertPlayers(t));
  return { inserted, skipped: false, existing: 0 };
}

module.exports = { players, upsertPlayers, seedPlayersIfEmpty };
