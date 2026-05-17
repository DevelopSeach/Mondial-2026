// טבלת מצטיינים (async/MySQL)
const express = require('express');
const { leaderboard } = require('../services/scoring');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(), async (req, res) => {
  try {
    const rows = await leaderboard();
    res.json(rows);
  } catch (e) {
    console.error('leaderboard:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
