// שירות הימורי מטבעות ("שיחים") — ארנקים, יישוב הימורים, לוח מצטיינים
const db = require('../db');

const START_BALANCE = 10000; // יתרת פתיחה לכל משתמש

async function getSettingNum(key, def) {
  const r = await db.one('SELECT `value` FROM settings WHERE `key` = ?', [key]);
  const n = r ? Number(r.value) : NaN;
  return Number.isFinite(n) ? n : def;
}

// יוצר ארנק אם חסר (מחוץ לטרנזקציה). מחזיר את היתרה.
async function ensureWallet(userId) {
  const r = await db.run(
    'INSERT IGNORE INTO coin_wallets (user_id, balance) VALUES (?, ?)',
    [userId, START_BALANCE]
  );
  if (r.affectedRows) {
    await db.run(
      'INSERT INTO coin_transactions (user_id, amount, reason, balance_after) VALUES (?, ?, ?, ?)',
      [userId, START_BALANCE, 'seed', START_BALANCE]
    );
  }
  const w = await db.one('SELECT balance FROM coin_wallets WHERE user_id = ?', [userId]);
  return w ? Number(w.balance) : START_BALANCE;
}

// גרסת-טרנזקציה: מוודא ארנק בתוך t
async function ensureWalletTx(t, userId) {
  const r = await t.run(
    'INSERT IGNORE INTO coin_wallets (user_id, balance) VALUES (?, ?)',
    [userId, START_BALANCE]
  );
  if (r.affectedRows) {
    await t.run(
      'INSERT INTO coin_transactions (user_id, amount, reason, balance_after) VALUES (?, ?, ?, ?)',
      [userId, START_BALANCE, 'seed', START_BALANCE]
    );
  }
}

// משנה יתרה בתוך טרנזקציה ורושם לספר החשבונות. מחזיר את היתרה החדשה.
async function adjust(t, userId, amount, reason, betId = null) {
  await ensureWalletTx(t, userId);
  await t.run('UPDATE coin_wallets SET balance = balance + ? WHERE user_id = ?', [amount, userId]);
  const w = await t.one('SELECT balance FROM coin_wallets WHERE user_id = ?', [userId]);
  const balanceAfter = w ? Number(w.balance) : amount;
  await t.run(
    'INSERT INTO coin_transactions (user_id, amount, reason, bet_id, balance_after) VALUES (?, ?, ?, ?, ?)',
    [userId, amount, reason, betId, balanceAfter]
  );
  return balanceAfter;
}

function outcomeOf(match) {
  if (match.home_score == null || match.away_score == null) return null;
  if (match.home_score > match.away_score) return 'home';
  if (match.home_score < match.away_score) return 'away';
  return 'draw';
}

// יישוב כל ההימורים על משחק שהסתיים. נקרא מתוך recalcForMatch.
// matched → המנצח לוקח 2X. open (לא נתפס) → החזר ליוצר וביטול.
async function settleCoinBetsForMatch(matchId) {
  const match = await db.one('SELECT * FROM matches WHERE id = ?', [matchId]);
  if (!match || match.status !== 'finished') return;
  const outcome = outcomeOf(match);
  if (!outcome) return;

  const bets = await db.query(
    "SELECT * FROM coin_bets WHERE match_id = ? AND status IN ('open','matched')",
    [matchId]
  );
  if (!bets.length) return;

  await db.tx(async (t) => {
    for (const bet of bets) {
      const creatorWon = outcome === bet.proposition; // היוצר הימר על proposition; כל מקבל על ההפך

      // משתתפים (רב-מקבלים); נפילה לאחור להימור 1:1 ישן עם opponent_id
      let participants = await t.query(
        'SELECT id, opponent_id, stake FROM coin_bet_participants WHERE bet_id = ?', [bet.id]
      );
      const legacy = participants.length === 0 && bet.opponent_id;
      if (legacy) participants = [{ id: null, opponent_id: bet.opponent_id, stake: bet.stake }];

      const escrowSlots = legacy ? 1 : Number(bet.max_acceptors || 1);

      // אם אין מקבלים כלל — החזר ליוצר את כל הפיקדון ובטל
      if (participants.length === 0) {
        await adjust(t, bet.creator_id, bet.stake * escrowSlots, 'bet_void_refund', bet.id);
        await t.run("UPDATE coin_bets SET status = 'void', settled_at = CURRENT_TIMESTAMP WHERE id = ?", [bet.id]);
        continue;
      }

      // יישוב כל משתתף — even money: המנצח לוקח 2X של הפיקדון
      for (const p of participants) {
        const winnerId = creatorWon ? bet.creator_id : p.opponent_id;
        await adjust(t, winnerId, p.stake * 2, 'bet_win', bet.id);
        if (p.id) await t.run('UPDATE coin_bet_participants SET won = ? WHERE id = ?', [creatorWon ? 0 : 1, p.id]);
      }

      // החזר ליוצר על משבצות שלא נתפסו
      const refundSlots = escrowSlots - participants.length;
      if (refundSlots > 0) await adjust(t, bet.creator_id, bet.stake * refundSlots, 'bet_unmatched_refund', bet.id);

      await t.run(
        "UPDATE coin_bets SET status = 'settled', winner_id = ?, settled_at = CURRENT_TIMESTAMP WHERE id = ?",
        [creatorWon ? bet.creator_id : null, bet.id]
      );
    }
  });
}

// לוח מצטיינים לפי יתרת מטבעות + סטטיסטיקות הימורים
// תגמול מטבעות לכותב ריביו לפי מספר ההצבעות, ×5 אם הניחוש שלו היה מדויק.
// אידמפוטנטי: שומר coins_awarded ומזכה רק את ההפרש — בטוח להרצה חוזרת ומתעדכן
// כשמגיעות הצבעות נוספות (גם אחרי שהמשחק הסתיים).
async function settleReviewReward(review) {
  const match = await db.one('SELECT id, status, home_score, away_score FROM matches WHERE id = ?', [review.match_id]);
  if (!match || match.status !== 'finished' || match.home_score == null || match.away_score == null) return;

  const votesRow = await db.one('SELECT COUNT(*) AS n FROM review_votes WHERE review_id = ?', [review.id]);
  const votes = Number(votesRow?.n || 0);

  const pred = await db.one(
    'SELECT home_score, away_score FROM predictions WHERE user_id = ? AND match_id = ?',
    [review.user_id, review.match_id]
  );
  const correct = !!pred && pred.home_score === match.home_score && pred.away_score === match.away_score;

  const perVote = await getSettingNum('review_coins_per_vote', 10);
  const multiplier = await getSettingNum('review_correct_multiplier', 2);
  const target = votes * perVote * (correct ? multiplier : 1);
  const delta = target - Number(review.coins_awarded || 0);
  if (delta === 0) return;

  await db.tx(async (t) => {
    // עדכון אטומי: מזכה רק אם coins_awarded לא השתנה בינתיים
    const upd = await t.run(
      'UPDATE match_reviews SET coins_awarded = ? WHERE id = ? AND coins_awarded = ?',
      [target, review.id, Number(review.coins_awarded || 0)]
    );
    if (upd.affectedRows) {
      await adjust(t, review.user_id, delta, 'review_reward');
    }
  });
}

// יישוב תגמולי הריביו לכל הריביוים על משחק שהסתיים. נקרא מתוך recalcForMatch.
async function settleReviewRewardsForMatch(matchId) {
  const reviews = await db.query(
    "SELECT id, user_id, match_id, coins_awarded FROM match_reviews WHERE match_id = ? AND status = 'published'",
    [matchId]
  );
  for (const r of reviews) await settleReviewReward(r);
}

async function coinLeaderboard() {
  const rows = await db.query(`
    SELECT u.id, u.name, u.profile_image_url,
      COALESCE(w.balance, ?) AS balance,
      (SELECT COUNT(*) FROM coin_bets b
         WHERE b.status = 'settled' AND (b.creator_id = u.id OR b.opponent_id = u.id
           OR EXISTS(SELECT 1 FROM coin_bet_participants p WHERE p.bet_id = b.id AND p.opponent_id = u.id))) AS bets_settled,
      ((SELECT COUNT(*) FROM coin_bets b WHERE b.status = 'settled' AND b.winner_id = u.id)
       + (SELECT COUNT(*) FROM coin_bet_participants p JOIN coin_bets b ON b.id = p.bet_id
            WHERE b.status = 'settled' AND p.opponent_id = u.id AND p.won = 1)) AS bets_won
    FROM users u
    LEFT JOIN coin_wallets w ON w.user_id = u.id
    WHERE u.is_admin = 0 AND u.is_guest = 0
    ORDER BY balance DESC, bets_won DESC, u.name ASC
  `, [START_BALANCE]);

  rows.forEach(r => {
    r.balance = Number(r.balance);
    r.bets_settled = Number(r.bets_settled);
    r.bets_won = Number(r.bets_won);
    r.win_rate = r.bets_settled ? Math.round((r.bets_won / r.bets_settled) * 100) : 0;
  });

  // דירוג עם טיפול בשוויון (1, 1, 3, ...)
  let lastBal = null, lastRank = 0;
  rows.forEach((r, i) => {
    if (r.balance !== lastBal) { lastRank = i + 1; lastBal = r.balance; }
    r.rank = lastRank;
  });

  // תגי שיחים לפי הקונפיגורציה (ניתנת לעריכה בלוח הניהול)
  try {
    const { loadBadgeConfig } = require('./scoring'); // lazy — נמנע מתלות מעגלית
    const defs = (await loadBadgeConfig()).coin_badges || {};
    rows.forEach(r => {
      r.coin_badges = Object.values(defs)
        .filter(d => d && d.enabled && evalCoinBadge(d, r))
        .map(d => ({ emoji: d.emoji, label: d.label }));
    });
  } catch { rows.forEach(r => { r.coin_badges = []; }); }

  return rows;
}

function evalCoinBadge(def, row) {
  const th = Number(def.threshold);
  switch (def.metric) {
    case 'rank':         return Number(row.rank) === th;
    case 'win_rate':     return Number(row.bets_settled) >= 3 && Number(row.win_rate) >= th;
    case 'balance':      return Number(row.balance) >= th;
    case 'bets_settled': return Number(row.bets_settled) >= th;
    case 'bets_won':     return Number(row.bets_won) >= th;
    default:             return false;
  }
}

// קובע אם המשתמש גלוי לאתגרי ניחוש
async function setChallengeOpen(userId, open) {
  await ensureWallet(userId);
  await db.run('UPDATE coin_wallets SET challenge_open = ? WHERE user_id = ?', [open ? 1 : 0, userId]);
}

async function userCoinStats(userId) {
  const balance = await ensureWallet(userId);
  const wallet = await db.one('SELECT challenge_open FROM coin_wallets WHERE user_id = ?', [userId]);
  const dayRow = await db.one(
    "SELECT COALESCE(SUM(amount),0) AS net FROM coin_transactions WHERE user_id = ? AND created_at >= (NOW() - INTERVAL 1 DAY)",
    [userId]
  );
  const agg = await db.one(`
    SELECT
      (SELECT COUNT(*) FROM coin_bets b WHERE b.status='settled'
         AND (b.creator_id=? OR EXISTS(SELECT 1 FROM coin_bet_participants p WHERE p.bet_id=b.id AND p.opponent_id=?))) AS settled,
      ((SELECT COUNT(*) FROM coin_bets b WHERE b.status='settled' AND b.winner_id=?)
       + (SELECT COUNT(*) FROM coin_bet_participants p JOIN coin_bets b ON b.id=p.bet_id WHERE b.status='settled' AND p.opponent_id=? AND p.won=1)) AS won,
      (SELECT COUNT(*) FROM coin_bets b WHERE b.status='open' AND b.creator_id=?) AS open_offers,
      (SELECT COUNT(*) FROM coin_bets b WHERE b.status='matched'
         AND (b.creator_id=? OR EXISTS(SELECT 1 FROM coin_bet_participants p WHERE p.bet_id=b.id AND p.opponent_id=?))) AS active
  `, [userId, userId, userId, userId, userId, userId, userId]);

  const board = await coinLeaderboard();
  const me = board.find(r => r.id === userId) || null;

  return {
    balance,
    challenge_open: !!(wallet && wallet.challenge_open),
    last_day_net: Number(dayRow?.net || 0),
    rank: me ? me.rank : null,
    players_count: board.length,
    bets_settled: Number(agg?.settled || 0),
    bets_won: Number(agg?.won || 0),
    open_offers: Number(agg?.open_offers || 0),
    active_bets: Number(agg?.active || 0),
    win_rate: Number(agg?.settled) ? Math.round((Number(agg.won) / Number(agg.settled)) * 100) : 0
  };
}

// ───────── הימורי ניחושים מיוחדים (אלופה/סגנית/מלך שערים) כן/לא מול יריב ─────────
const SPECIAL_MARKETS = ['champion', 'runner_up', 'top_scorer'];
const SPECIAL_SETTING = { champion: 'real_champion', runner_up: 'real_runner_up', top_scorer: 'real_top_scorer' };

async function getSettingStr(key) {
  const r = await db.one('SELECT `value` FROM settings WHERE `key` = ?', [key]);
  return r && r.value != null ? String(r.value) : '';
}

async function createSpecialBet(creatorId, { market, subject_code, subject_label, proposition, stake }) {
  if (!SPECIAL_MARKETS.includes(market)) throw new Error('שוק לא חוקי');
  if (!subject_code || !String(subject_code).trim()) throw new Error('יש לבחור נושא להימור');
  if (!['yes', 'no'].includes(proposition)) throw new Error('בחירה לא חוקית');
  const amt = Math.trunc(Number(stake));
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('סכום לא חוקי');
  const bal = await ensureWallet(creatorId);
  if (bal < amt) throw new Error('אין מספיק שיחים');
  return db.tx(async t => {
    await adjust(t, creatorId, -amt, 'special_bet_create', null);
    const r = await t.run(
      `INSERT INTO coin_special_bets (creator_id, market, subject_code, subject_label, proposition, stake, status)
       VALUES (?, ?, ?, ?, ?, ?, 'open')`,
      [creatorId, market, String(subject_code).trim().slice(0, 60), String(subject_label || subject_code).trim().slice(0, 120), proposition, amt]
    );
    return { id: r.insertId };
  });
}

async function acceptSpecialBet(betId, opponentId) {
  return db.tx(async t => {
    const b = await t.one("SELECT * FROM coin_special_bets WHERE id = ? FOR UPDATE", [betId]);
    if (!b) throw new Error('ההימור לא נמצא');
    if (b.status !== 'open') throw new Error('ההימור כבר נתפס');
    if (b.creator_id === opponentId) throw new Error('אי אפשר לאשר הימור של עצמך');
    await ensureWalletTx(t, opponentId);
    const w = await t.one('SELECT balance FROM coin_wallets WHERE user_id = ?', [opponentId]);
    if (!w || Number(w.balance) < b.stake) throw new Error('אין מספיק שיחים');
    await adjust(t, opponentId, -b.stake, 'special_bet_accept', null);
    await t.run("UPDATE coin_special_bets SET status='matched', opponent_id=? WHERE id=? AND status='open'", [opponentId, betId]);
    return { ok: true };
  });
}

async function cancelSpecialBet(betId, userId) {
  return db.tx(async t => {
    const b = await t.one("SELECT * FROM coin_special_bets WHERE id = ? FOR UPDATE", [betId]);
    if (!b) throw new Error('ההימור לא נמצא');
    if (b.creator_id !== userId) throw new Error('אפשר לבטל רק הימור שיצרת');
    if (b.status !== 'open') throw new Error('אי אפשר לבטל הימור שכבר נתפס');
    await adjust(t, b.creator_id, b.stake, 'special_bet_refund', null);
    await t.run("UPDATE coin_special_bets SET status='void' WHERE id=? AND status='open'", [betId]);
    return { ok: true };
  });
}

async function listOpenSpecialBets(userId) {
  return db.query(
    `SELECT b.id, b.market, b.subject_code, b.subject_label, b.proposition, b.stake, b.created_at,
            u.name AS creator_name, u.profile_image_url AS creator_image
     FROM coin_special_bets b JOIN users u ON u.id = b.creator_id
     WHERE b.status='open' AND b.creator_id <> ?
     ORDER BY b.created_at DESC LIMIT 100`, [userId]);
}

async function listMySpecialBets(userId) {
  return db.query(
    `SELECT b.*, cu.name AS creator_name, ou.name AS opponent_name
     FROM coin_special_bets b
     JOIN users cu ON cu.id = b.creator_id
     LEFT JOIN users ou ON ou.id = b.opponent_id
     WHERE b.creator_id = ? OR b.opponent_id = ?
     ORDER BY b.created_at DESC LIMIT 100`, [userId, userId]);
}

// יישוב הימורים מיוחדים — נקרא כשמוגדרות התוצאות האמיתיות (real_champion וכו')
async function settleSpecialBets() {
  const real = {};
  for (const m of SPECIAL_MARKETS) real[m] = (await getSettingStr(SPECIAL_SETTING[m])).trim();
  const bets = await db.query("SELECT * FROM coin_special_bets WHERE status='matched'");
  let settled = 0;
  for (const b of bets) {
    const actual = real[b.market];
    if (!actual) continue; // התוצאה עדיין לא הוגדרה
    const hit = b.market === 'top_scorer'
      ? actual.toLowerCase() === String(b.subject_code).trim().toLowerCase()
      : actual === String(b.subject_code).trim();
    const creatorWon = (b.proposition === 'yes') === hit;
    const winner = creatorWon ? b.creator_id : b.opponent_id;
    await db.tx(async t => {
      const row = await t.one("SELECT status FROM coin_special_bets WHERE id=? FOR UPDATE", [b.id]);
      if (!row || row.status !== 'matched') return;
      await adjust(t, winner, b.stake * 2, 'special_bet_win', null);
      await t.run("UPDATE coin_special_bets SET status='settled', creator_won=?, settled_at=NOW() WHERE id=?", [creatorWon ? 1 : 0, b.id]);
      settled++;
    });
  }
  return { settled };
}

module.exports = {
  START_BALANCE,
  ensureWallet,
  adjust,
  setChallengeOpen,
  outcomeOf,
  settleCoinBetsForMatch,
  settleReviewReward,
  settleReviewRewardsForMatch,
  coinLeaderboard,
  userCoinStats,
  createSpecialBet,
  acceptSpecialBet,
  cancelSpecialBet,
  listOpenSpecialBets,
  listMySpecialBets,
  settleSpecialBets
};
