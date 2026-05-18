#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const db = require('../db');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms, ratio = 0.2) {
  const delta = Math.floor(ms * ratio);
  return ms + Math.floor((Math.random() * (delta * 2 + 1)) - delta);
}

async function fetchJsonWithRetry(url, headers, opts = {}) {
  const {
    maxRetries = Number(process.env.PLAYERS_IMPORT_MAX_RETRIES || 7),
    baseDelayMs = Number(process.env.PLAYERS_IMPORT_BASE_DELAY_MS || 600),
    timeoutMs = Number(process.env.PLAYERS_IMPORT_TIMEOUT_MS || 25000)
  } = opts;

  let attempt = 0;
  while (true) {
    try {
      const { data } = await axios.get(url, { headers, timeout: timeoutMs });
      return data;
    } catch (e) {
      const status = e.response?.status || 0;
      const retryable = status === 429 || (status >= 500 && status < 600) || !status;
      if (!retryable || attempt >= maxRetries) throw e;

      const retryAfterSec = Number(e.response?.headers?.['retry-after'] || 0);
      const exponential = baseDelayMs * Math.pow(2, attempt);
      const waitMs = retryAfterSec > 0 ? retryAfterSec * 1000 : jitter(exponential);
      console.log(`⏳ retry ${attempt + 1}/${maxRetries} for ${url} in ${waitMs}ms (status ${status || 'net'})`);
      await sleep(waitMs);
      attempt += 1;
    }
  }
}

function normalizeName(v) {
  return String(v || '').trim().toLowerCase();
}

async function resolveNationalTeamId(nameEn, headers) {
  const url = `https://v3.football.api-sports.io/teams?search=${encodeURIComponent(nameEn)}`;
  const data = await fetchJsonWithRetry(url, headers);
  const response = data?.response || [];
  const target = normalizeName(nameEn);
  const exact = response.find(r => r?.team?.national && normalizeName(r.team.name) === target);
  if (exact) return exact.team.id;
  const contains = response.find(r => r?.team?.national && normalizeName(r.team.name).includes(target));
  return contains?.team?.id || null;
}

async function importPlayers() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY is missing in server/.env');
  const headers = { 'x-apisports-key': key };

  const teams = await db.query(`
    SELECT t.code, t.name_en, t.name_he,
      (SELECT COUNT(*) FROM players p WHERE p.team_code = t.code) AS existing_players
    FROM teams t
    ORDER BY existing_players ASC, t.name_en ASC
  `);
  let totalInsertedOrUpdated = 0;
  let teamsWithSquad = 0;
  let teamsSkipped = 0;

  for (const t of teams) {
    try {
      const teamId = await resolveNationalTeamId(t.name_en, headers);
      if (!teamId) {
        teamsSkipped += 1;
        continue;
      }
      await sleep(jitter(Number(process.env.PLAYERS_IMPORT_BETWEEN_CALLS_MS || 250)));
      const sqData = await fetchJsonWithRetry(`https://v3.football.api-sports.io/players/squads?team=${teamId}`, headers);
      const squad = sqData?.response?.[0]?.players || [];
      if (!squad.length) {
        teamsSkipped += 1;
        continue;
      }
      teamsWithSquad += 1;
      for (const p of squad) {
        const externalId = p.id || null;
        const nameEn = p.name || '';
        if (!nameEn) continue;
        const imageUrl = p.photo || null;
        const countryEn = t.name_en;
        const countryHe = t.name_he;
        const nameHe = nameEn; // fallback: no reliable Hebrew source from API-Football

        await db.run(`
          INSERT INTO players (external_id, name_en, name_he, country_en, country_he, team_code, image_url)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name_en = VALUES(name_en),
            name_he = VALUES(name_he),
            country_en = VALUES(country_en),
            country_he = VALUES(country_he),
            team_code = VALUES(team_code),
            image_url = VALUES(image_url)
        `, [externalId, nameEn, nameHe, countryEn, countryHe, t.code, imageUrl]);
        totalInsertedOrUpdated += 1;
      }
      // pacing between teams to reduce provider throttling
      await sleep(jitter(Number(process.env.PLAYERS_IMPORT_BETWEEN_TEAMS_MS || 500)));
    } catch (e) {
      teamsSkipped += 1;
      const status = e.response?.status ? `status ${e.response.status}` : 'network';
      console.log(`⚠️ skipped ${t.name_en}: ${status} ${e.message}`);
    }
  }

  const cnt = await db.one('SELECT COUNT(*) AS n FROM players');
  const teamCoverage = await db.one('SELECT COUNT(DISTINCT team_code) AS n FROM players WHERE team_code IS NOT NULL');
  console.log(`✅ imported/updated rows: ${totalInsertedOrUpdated}`);
  console.log(`✅ teams with squad data: ${teamsWithSquad}`);
  console.log(`✅ teams skipped this run: ${teamsSkipped}`);
  console.log(`✅ teams covered in DB: ${teamCoverage?.n || 0}`);
  console.log(`✅ total players in DB: ${cnt?.n || 0}`);
}

importPlayers()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('✗ players import failed:', e.message);
    process.exit(1);
  });
