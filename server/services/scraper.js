// שירות עדכון תוצאות (async/MySQL)
// תומך בשלושה מצבים:
//   1. manual       - עדכון ידני בלבד דרך ממשק הניהול (ברירת מחדל)
//   2. espn         - סקרייפינג מ-ESPN (חינמי)
//   3. api-football - דרך api-football.com (דורש מפתח חינמי)

const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../db');
const { recalcForMatch } = require('./scoring');

const TEAM_NAME_VARIANTS = {
  'mexico': 'mx', 'south korea': 'kr', 'korea republic': 'kr', 'south africa': 'za',
  'czech republic': 'cz', 'czechia': 'cz',
  'canada': 'ca', 'switzerland': 'ch', 'qatar': 'qa',
  'bosnia and herzegovina': 'ba', 'bosnia-herzegovina': 'ba', 'bosnia': 'ba',
  'brazil': 'br', 'morocco': 'ma', 'scotland': 'gb-sct', 'haiti': 'ht',
  'usa': 'us', 'united states': 'us', 'paraguay': 'py', 'australia': 'au',
  'turkiye': 'tr', 'turkey': 'tr',
  'germany': 'de', 'ecuador': 'ec', 'ivory coast': 'ci',
  "côte d'ivoire": 'ci', "cote d'ivoire": 'ci', 'curacao': 'cw', 'curaçao': 'cw',
  'netherlands': 'nl', 'japan': 'jp', 'tunisia': 'tn', 'sweden': 'se',
  'belgium': 'be', 'iran': 'ir', 'egypt': 'eg', 'new zealand': 'nz',
  'spain': 'es', 'uruguay': 'uy', 'saudi arabia': 'sa',
  'cape verde': 'cv', 'cabo verde': 'cv',
  'france': 'fr', 'senegal': 'sn', 'norway': 'no', 'iraq': 'iq',
  'argentina': 'ar', 'austria': 'at', 'algeria': 'dz', 'jordan': 'jo',
  'portugal': 'pt', 'colombia': 'co', 'uzbekistan': 'uz',
  'dr congo': 'cd', 'congo dr': 'cd', 'dem. republic of congo': 'cd',
  'england': 'gb-eng', 'croatia': 'hr', 'panama': 'pa', 'ghana': 'gh'
};

function teamCode(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase()
    .replace(/\s+/g, ' ').replace(/^the /, '');
  return TEAM_NAME_VARIANTS[key] || null;
}

// עדכון תוצאת משחק יחיד
async function updateMatchScore(matchId, homeScore, awayScore, status = 'finished') {
  const r = await db.run(`
    UPDATE matches
    SET home_score = ?, away_score = ?, status = ?, updated_at = NOW()
    WHERE id = ?
  `, [homeScore, awayScore, status, matchId]);
  if (r.affectedRows && status === 'finished') {
    await recalcForMatch(matchId);
  }
  return r.affectedRows > 0;
}

async function getModeFromSettings() {
  // settings.scraper_mode עוקף את .env (ברגע שהמנהל בחר במסך)
  const r = await db.one("SELECT `value` FROM settings WHERE `key` = 'scraper_mode'");
  return (r && r.value) || (process.env.SCRAPER_MODE || 'manual').toLowerCase();
}

// ─────────── ESPN ───────────
async function scrapeFromESPN() {
  const url = 'https://www.espn.com/soccer/fixtures/_/league/fifa.world';
  const updated = [];
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Mondial2026Bot/1.0)' },
    timeout: 20000
  });
  const $ = cheerio.load(data);
  const rows = $('tr').toArray();
  for (const row of rows) {
    const text = $(row).text();
    const m = text.match(/([A-Za-z .'-]+?)\s+(\d+)\s*[-–]\s*(\d+)\s+([A-Za-z .'-]+)/);
    if (!m) continue;
    const home = teamCode(m[1]);
    const away = teamCode(m[4]);
    if (!home || !away) continue;
    const hs = parseInt(m[2], 10);
    const as = parseInt(m[3], 10);
    const match = await db.one(`
      SELECT id FROM matches
      WHERE home_code = ? AND away_code = ? AND status != 'finished'
      ORDER BY kickoff ASC LIMIT 1
    `, [home, away]);
    if (match) {
      if (await updateMatchScore(match.id, hs, as, 'finished')) {
        updated.push({ id: match.id, score: `${home} ${hs}-${as} ${away}` });
      }
    }
  }
  return updated;
}

// ─────────── api-football ───────────
async function scrapeFromApiFootball() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY לא הוגדר ב-.env');
  const url = 'https://v3.football.api-sports.io/fixtures?league=1&season=2026';
  const updated = [];
  const { data } = await axios.get(url, {
    headers: { 'x-apisports-key': key },
    timeout: 20000
  });
  if (!data || !data.response) return updated;
  for (const fx of data.response) {
    if (fx.fixture.status.short !== 'FT') continue;
    const home = teamCode(fx.teams.home.name);
    const away = teamCode(fx.teams.away.name);
    if (!home || !away) continue;
    const match = await db.one(`
      SELECT id FROM matches
      WHERE home_code = ? AND away_code = ? AND status != 'finished'
      ORDER BY kickoff ASC LIMIT 1
    `, [home, away]);
    if (match) {
      if (await updateMatchScore(match.id, fx.goals.home, fx.goals.away, 'finished')) {
        updated.push({ id: match.id, score: `${home} ${fx.goals.home}-${fx.goals.away} ${away}` });
      }
    }
  }
  return updated;
}

// ─────────── Dispatcher ───────────
async function runDailyUpdate() {
  const mode = await getModeFromSettings();
  console.log(`[${new Date().toISOString()}] עדכון תוצאות - מצב: ${mode}`);
  try {
    let updated = [];
    if (mode === 'espn') updated = await scrapeFromESPN();
    else if (mode === 'api-football') updated = await scrapeFromApiFootball();
    else {
      console.log('   מצב ידני - לא בוצע סקרייפינג.');
      return { mode, updated: [] };
    }
    console.log(`   עודכנו ${updated.length} משחקים`);
    return { mode, updated };
  } catch (e) {
    console.error('   ✗ שגיאה בעדכון:', e.message);
    return { mode, updated: [], error: e.message };
  }
}

module.exports = { runDailyUpdate, updateMatchScore, teamCode };
