// נתיבי ניחושים (async/MySQL)
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { seedPlayersIfEmpty } = require('../lib/players-catalog');
const { seedScheduleItems } = require('../lib/schedule-items');
const { parseScheduleLockMs } = require('../lib/special-lock');
const { leaderboard, userGroupStats } = require('../services/scoring');

const router = express.Router();

async function getSetting(key, def) {
  const r = await db.one('SELECT `value` FROM settings WHERE `key` = ?', [key]);
  return r ? r.value : def;
}

// יומן שינויי ניחושים — נוצר עצלן אם עדיין לא קיים
let historyReady = false;
async function ensureHistory() {
  if (historyReady) return;
  await db.run(`CREATE TABLE IF NOT EXISTS prediction_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL, match_id INT NOT NULL,
    home_score INT NOT NULL, away_score INT NOT NULL,
    changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ph_user_match (user_id, match_id),
    CONSTRAINT fk_ph_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ph_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  historyReady = true;
}

// כל הניחושים של המשתמש המחובר
router.get('/my', auth(), async (req, res) => {
  try {
    await ensureHistory();
    const preds = await db.query(`
      SELECT p.*, m.home_code, m.away_code, m.kickoff, m.status,
        m.home_label_he, m.home_label_en, m.home_label_ar,
        m.away_label_he, m.away_label_en, m.away_label_ar,
        th.name_he AS home_name, th.name_en AS home_name_en, th.name_ar AS home_name_ar,
        ta.name_he AS away_name, ta.name_en AS away_name_en, ta.name_ar AS away_name_ar,
        m.home_score AS actual_home, m.away_score AS actual_away,
        (SELECT COUNT(*) FROM prediction_history h WHERE h.user_id = p.user_id AND h.match_id = p.match_id) AS edit_count
      FROM predictions p
      JOIN matches m ON m.id = p.match_id
      LEFT JOIN teams th ON th.code = m.home_code
      LEFT JOIN teams ta ON ta.code = m.away_code
      WHERE p.user_id = ?
      ORDER BY m.kickoff ASC
    `, [req.user.id]);
    // תג "צלף" (first time hitter): ניחוש מדויק שלא שונה מעולם (הגשה אחת בלבד)
    for (const p of preds) {
      p.edit_count = Number(p.edit_count || 0);
      p.first_time_hitter = p.status === 'finished'
        && p.actual_home != null && p.actual_away != null
        && Number(p.home_score) === Number(p.actual_home)
        && Number(p.away_score) === Number(p.actual_away)
        && p.edit_count === 1;
    }

    const special = await db.one(`
      SELECT sp.*,
        p.name_en AS top_scorer_name_en,
        p.name_he AS top_scorer_name_he,
        p.country_en AS top_scorer_country_en,
        p.country_he AS top_scorer_country_he,
        p.image_url AS top_scorer_image_url
      FROM special_predictions sp
      LEFT JOIN players p ON p.id = sp.top_scorer_player_id
      WHERE sp.user_id = ?
    `, [req.user.id]);
    res.json({ predictions: preds, special: special || null });
  } catch (e) {
    console.error('predictions/my:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// סטטיסטיקות המשתמש המחובר (אישי + קבוצתי) — לעמוד הפרופיל
router.get('/stats', auth(), async (req, res) => {
  try {
    const exactWeight = Number(await getSetting('scoring_exact', 5));
    const resultWeight = Number(await getSetting('scoring_result', 3));

    const agg = await db.one(`
      SELECT
        COUNT(p.id) AS num_predictions,
        COALESCE(SUM(p.points), 0) AS total_points,
        SUM(CASE WHEN p.points = ? THEN 1 ELSE 0 END) AS exact_hits,
        SUM(CASE WHEN p.points > 0 AND p.points < ? THEN 1 ELSE 0 END) AS result_hits,
        SUM(CASE WHEN m.status = 'finished' AND m.home_score IS NOT NULL AND p.points = 0 THEN 1 ELSE 0 END) AS misses,
        SUM(CASE WHEN m.status = 'finished' AND m.home_score IS NOT NULL THEN 1 ELSE 0 END) AS settled
      FROM predictions p
      JOIN matches m ON m.id = p.match_id
      WHERE p.user_id = ?
    `, [exactWeight, exactWeight, req.user.id]);

    // דירוג אישי מתוך לוח המצטיינים הראשי
    const board = await leaderboard();
    const myRow = board.find(r => r.id === req.user.id) || null;

    const group = await userGroupStats(req.user.id);

    res.json({
      individual: {
        num_predictions: Number(agg?.num_predictions || 0),
        match_points:    Number(agg?.total_points || 0),
        exact_hits:      Number(agg?.exact_hits || 0),
        result_hits:     Number(agg?.result_hits || 0),
        misses:          Number(agg?.misses || 0),
        settled:         Number(agg?.settled || 0),
        total_points:    myRow ? myRow.total_points : Number(agg?.total_points || 0),
        bonus_points:    myRow ? myRow.bonus_points : 0,
        rank:            myRow ? myRow.rank : null,
        players_count:   board.length
      },
      group
    });
  } catch (e) {
    console.error('predictions/stats:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// רשימת שחקנים לבחירה (מלך השערים)
router.get('/players', auth(), async (req, res) => {
  try {
    await seedPlayersIfEmpty();
    const rows = await db.query(`
      SELECT id, name_en, name_he, country_en, country_he, image_url, team_code
      FROM players
      ORDER BY name_en ASC
    `);
    res.json(rows);
  } catch (e) {
    console.error('predictions/players:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// הזנת ניחוש למשחק
router.post('/match/:id', auth(), async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const { home_score, away_score } = req.body || {};
    if (!Number.isInteger(home_score) || !Number.isInteger(away_score) ||
        home_score < 0 || away_score < 0 || home_score > 30 || away_score > 30) {
      return res.status(400).json({ error: 'תוצאה לא תקינה' });
    }

    const match = await db.one('SELECT * FROM matches WHERE id = ?', [matchId]);
    if (!match) return res.status(404).json({ error: 'משחק לא נמצא' });

    // בדיקת נעילה
    const lockHours = Number(await getSetting('lock_hours_before', 1));
    const lockTime = new Date(match.kickoff + (match.kickoff.endsWith('Z') ? '' : 'Z')).getTime()
                     - (lockHours * 60 * 60 * 1000);
    if (Date.now() >= lockTime) {
      return res.status(403).json({ error: 'מאוחר מדי - הניחושים נעולים למשחק זה' });
    }

    await ensureHistory();
    const prev = await db.one('SELECT home_score, away_score FROM predictions WHERE user_id = ? AND match_id = ?', [req.user.id, matchId]);

    await db.run(`
      INSERT INTO predictions (user_id, match_id, home_score, away_score)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        home_score   = VALUES(home_score),
        away_score   = VALUES(away_score),
        submitted_at = CURRENT_TIMESTAMP,
        points       = 0
    `, [req.user.id, matchId, home_score, away_score]);

    // לוג שינוי: הגשה ראשונה, או כל פעם שהתוצאה באמת השתנתה
    if (!prev || Number(prev.home_score) !== home_score || Number(prev.away_score) !== away_score) {
      await db.run(
        'INSERT INTO prediction_history (user_id, match_id, home_score, away_score) VALUES (?, ?, ?, ?)',
        [req.user.id, matchId, home_score, away_score]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('predict-match:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// יומן השינויים של ניחוש מסוים (לפי זמן) עבור המשתמש המחובר
router.get('/history/:matchId', auth(), async (req, res) => {
  try {
    await ensureHistory();
    const matchId = Number(req.params.matchId);
    if (!Number.isInteger(matchId)) return res.status(400).json({ error: 'משחק לא תקין' });
    const rows = await db.query(
      'SELECT home_score, away_score, changed_at FROM prediction_history WHERE user_id = ? AND match_id = ? ORDER BY changed_at ASC, id ASC',
      [req.user.id, matchId]
    );
    res.json({ match_id: matchId, changes: rows, edit_count: rows.length });
  } catch (e) {
    console.error('predictions/history:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ניחושים מיוחדים (אלופה, סגן, מלך)
router.post('/special', auth(), async (req, res) => {
  try {
    await seedPlayersIfEmpty();
    await db.tx(async (t) => seedScheduleItems(t));
    const { champion_code, runner_up_code, top_scorer, top_scorer_player_id } = req.body || {};

    const specialLockRow = await db.one(`
      SELECT start_at, date_label
      FROM schedule_items
      WHERE title = 'סגירת ניחושים מיוחדים'
      ORDER BY sort_order ASC, id ASC
      LIMIT 1
    `);
    if (specialLockRow) {
      const lockAt = parseScheduleLockMs(specialLockRow);
      if (Date.now() >= lockAt) {
        return res.status(403).json({
          error: `נעילה: ניחושים מיוחדים נסגרו ב-${specialLockRow.date_label || 'המועד שנקבע'}`
        });
      }
    }

    let topScorerPlayerId = null;
    let topScorerText = top_scorer || null;
    if (top_scorer_player_id != null && top_scorer_player_id !== '') {
      const pid = Number(top_scorer_player_id);
      if (!Number.isInteger(pid) || pid <= 0) {
        return res.status(400).json({ error: 'שחקן לא תקין' });
      }
      const player = await db.one('SELECT id, name_en FROM players WHERE id = ?', [pid]);
      if (!player) return res.status(400).json({ error: 'שחקן לא נמצא' });
      topScorerPlayerId = player.id;
      topScorerText = player.name_en;
    }

    await db.run(`
      INSERT INTO special_predictions (user_id, champion_code, runner_up_code, top_scorer_player_id, top_scorer, submitted_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        champion_code  = VALUES(champion_code),
        runner_up_code = VALUES(runner_up_code),
        top_scorer_player_id = VALUES(top_scorer_player_id),
        top_scorer     = VALUES(top_scorer),
        submitted_at   = CURRENT_TIMESTAMP
    `, [req.user.id, champion_code || null, runner_up_code || null, topScorerPlayerId, topScorerText]);

    res.json({ ok: true });
  } catch (e) {
    console.error('predict-special:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
