// נתיבי ניהול - גישה רק למנהל (async/MySQL)
const express = require('express');
const db = require('../db');
const { auth, adminOnly } = require('../middleware/auth');
const { updateMatchScore, runDailyUpdate } = require('../services/scraper');
const { recalcForMatch } = require('../services/scoring');

const router = express.Router();
router.use(auth(), adminOnly);

// סיכום מצב המערכת
router.get('/overview', async (req, res) => {
  try {
    const users      = await db.one('SELECT COUNT(*) AS n FROM users WHERE is_admin = 0');
    const preds      = await db.one('SELECT COUNT(*) AS n FROM predictions');
    const matchesC   = await db.one('SELECT COUNT(*) AS n FROM matches');
    const finished   = await db.one("SELECT COUNT(*) AS n FROM matches WHERE status = 'finished'");
    res.json({
      users:        users.n,
      predictions:  preds.n,
      matches:      matchesC.n,
      finished:     finished.n
    });
  } catch (e) {
    console.error('admin/overview:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// רשימת משתמשים
router.get('/users', async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT u.id, u.email, u.name, u.is_admin, u.created_at,
        (SELECT COUNT(*) FROM predictions WHERE user_id = u.id) AS num_predictions
      FROM users u
      ORDER BY u.id DESC
    `);
    res.json(rows);
  } catch (e) {
    console.error('admin/users:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// מחיקת משתמש
router.delete('/users/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'לא ניתן למחוק את עצמך' });
    await db.run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('admin/delete-user:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// עדכון תוצאה ידני
router.post('/matches/:id/score', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { home_score, away_score, status } = req.body || {};
    if (!Number.isInteger(home_score) || !Number.isInteger(away_score)) {
      return res.status(400).json({ error: 'תוצאה לא תקינה' });
    }
    const ok = await updateMatchScore(id, home_score, away_score, status || 'finished');
    if (!ok) return res.status(404).json({ error: 'המשחק לא נמצא' });
    res.json({ ok: true });
  } catch (e) {
    console.error('admin/score:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ביטול תוצאה
router.delete('/matches/:id/score', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.run(`
      UPDATE matches
      SET home_score = NULL, away_score = NULL, status = 'scheduled', updated_at = NOW()
      WHERE id = ?
    `, [id]);
    await db.run('UPDATE predictions SET points = 0 WHERE match_id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('admin/clear-score:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// הוספת/עדכון משחק (לשלבי נוקאאוט)
router.post('/matches', async (req, res) => {
  try {
    const { id, stage, group_letter, home_code, away_code, kickoff, venue } = req.body || {};
    if (!home_code || !away_code || !kickoff) {
      return res.status(400).json({ error: 'חסרים שדות' });
    }
    // ממיר ISO ל-DATETIME של MySQL
    const k = new Date(kickoff).toISOString().slice(0, 19).replace('T', ' ');
    if (id) {
      await db.run(`
        UPDATE matches SET stage=?, group_letter=?, home_code=?, away_code=?, kickoff=?, venue=?
        WHERE id=?
      `, [stage || 'group', group_letter || null, home_code, away_code, k, venue || null, id]);
      return res.json({ ok: true, id });
    }
    // לנוקאאוט - מצא ID פנוי גבוה
    const last = await db.one('SELECT COALESCE(MAX(id), 0) AS m FROM matches');
    const newId = last.m + 1;
    await db.run(`
      INSERT INTO matches (id, stage, group_letter, home_code, away_code, kickoff, venue, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')
    `, [newId, stage || 'knockout', group_letter || null, home_code, away_code, k, venue || null]);
    res.json({ ok: true, id: newId });
  } catch (e) {
    console.error('admin/add-match:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// הפעלת סקרייפינג ידנית
router.post('/scrape-now', async (req, res) => {
  try {
    const result = await runDailyUpdate();
    res.json(result);
  } catch (e) {
    console.error('admin/scrape-now:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// הגדרות
router.get('/settings', async (req, res) => {
  try {
    const rows = await db.query('SELECT `key`, `value` FROM settings');
    const obj = {};
    for (const r of rows) obj[r.key] = r.value;
    res.json(obj);
  } catch (e) {
    console.error('admin/settings/get:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

router.post('/settings', async (req, res) => {
  try {
    await db.tx(async (t) => {
      for (const [k, v] of Object.entries(req.body || {})) {
        await t.run(
          'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ' +
          'ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
          [k, String(v)]
        );
      }
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('admin/settings/set:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// חישוב מחדש של כל הניקוד
router.post('/recalculate', async (req, res) => {
  try {
    const matches = await db.query("SELECT id FROM matches WHERE status = 'finished'");
    let total = 0;
    for (const m of matches) total += await recalcForMatch(m.id);
    res.json({ ok: true, predictions_updated: total });
  } catch (e) {
    console.error('admin/recalculate:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// כל הניחושים של משתמש מסוים (לצפייה)
router.get('/users/:id/predictions', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const preds = await db.query(`
      SELECT p.*, m.home_code, m.away_code, m.kickoff, m.status,
        m.home_score AS actual_home, m.away_score AS actual_away
      FROM predictions p
      JOIN matches m ON m.id = p.match_id
      WHERE p.user_id = ?
      ORDER BY m.kickoff ASC
    `, [id]);
    const special = await db.one('SELECT * FROM special_predictions WHERE user_id = ?', [id]);
    res.json({ predictions: preds, special: special || null });
  } catch (e) {
    console.error('admin/user-preds:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
