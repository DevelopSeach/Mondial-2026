// דוח יומי: צילום (תמונת PNG) של "טבלת המצטיינים" ושליחתו במייל ל"מנהלת שליחות".
// התמונה נוצרת מתוך נתוני הטבלה (leaderboard) ומומרת ל-PNG דרך resvg עם גופן עברי מצורף,
// כך שאין תלות בדפדפן headless או בגופני-מערכת (עובד זהה על כל השרתים).

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { Resvg } = require('@resvg/resvg-js');
const db = require('../db');
const { leaderboard } = require('./scoring');

const FONT_PATH = path.join(__dirname, '..', 'assets', 'fonts', 'Alef-Regular.ttf');
const FONT_FAMILY = 'Alef';

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function readSettingsMap(keys) {
  if (!keys.length) return {};
  const rows = await db.query(
    `SELECT \`key\`, \`value\` FROM settings WHERE \`key\` IN (${keys.map(() => '?').join(',')})`,
    keys
  );
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

function buildTransportConfig(s) {
  const security = String(s.smtp_security || 'STARTTLS').trim().toUpperCase();
  const port = Number(s.smtp_port || 587);
  const secure = security === 'SSL' || security === 'SMTPS' || port === 465;
  return {
    host: String(s.smtp_server || '').trim(),
    port,
    secure,
    requireTLS: security === 'STARTTLS',
    auth: { user: String(s.smtp_user || '').trim(), pass: String(s.smtp_password || '') }
  };
}

// בונה SVG של טבלת המצטיינים (RTL) מתוך שורות הדירוג
function buildLeaderboardSvg(rows, dateLabel, limit) {
  const top = rows.slice(0, limit);
  const W = 760;
  const rowH = 46;
  const headTop = 132;
  const H = headTop + rowH * (top.length + 1) + 28;

  // עמודות (קואורדינטות x), כותרות מימין לשמאל
  const X_RANK = 700;   // מקום
  const X_NAME = 660;   // שם (יישור לימין, גדל שמאלה)
  const X_PTS = 250;    // נקודות
  const X_EXACT = 150;  // ניחושים מדויקים
  const X_PRED = 70;    // סה״כ ניחושים

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#0b3d2e"/>`);
  parts.push(`<rect x="0" y="0" width="${W}" height="96" fill="#08311f"/>`);
  parts.push(`<text x="${W - 30}" y="50" font-family="${FONT_FAMILY}" font-size="34" font-weight="bold" fill="#ffd700" text-anchor="end">טבלת המצטיינים</text>`);
  parts.push(`<text x="${W - 30}" y="80" font-family="${FONT_FAMILY}" font-size="18" fill="#cfe8d8" text-anchor="end">מונדיאל 2026 · ${xmlEscape(dateLabel)}</text>`);

  // כותרות עמודות
  const hy = headTop;
  parts.push(`<text x="${X_RANK}" y="${hy}" font-family="${FONT_FAMILY}" font-size="18" fill="#ffd700" text-anchor="middle">מקום</text>`);
  parts.push(`<text x="${X_NAME}" y="${hy}" font-family="${FONT_FAMILY}" font-size="18" fill="#ffd700" text-anchor="end">שם</text>`);
  parts.push(`<text x="${X_PTS}" y="${hy}" font-family="${FONT_FAMILY}" font-size="18" fill="#ffd700" text-anchor="middle">נק׳</text>`);
  parts.push(`<text x="${X_EXACT}" y="${hy}" font-family="${FONT_FAMILY}" font-size="18" fill="#ffd700" text-anchor="middle">מדויקים</text>`);
  parts.push(`<text x="${X_PRED}" y="${hy}" font-family="${FONT_FAMILY}" font-size="18" fill="#ffd700" text-anchor="middle">ניחושים</text>`);
  parts.push(`<line x1="20" y1="${hy + 12}" x2="${W - 20}" y2="${hy + 12}" stroke="#2d6e3e" stroke-width="2"/>`);

  top.forEach((r, i) => {
    const y = headTop + rowH * (i + 1) + 18;
    const cy = y - 14;
    if (i % 2 === 0) parts.push(`<rect x="14" y="${cy}" width="${W - 28}" height="${rowH}" fill="#ffffff10"/>`);
    const rankColor = r.rank === 1 ? '#ffd700' : r.rank === 2 ? '#c0c0c0' : r.rank === 3 ? '#cd7f32' : '#ffffff';
    parts.push(`<text x="${X_RANK}" y="${y}" font-family="${FONT_FAMILY}" font-size="22" font-weight="bold" fill="${rankColor}" text-anchor="middle">${r.rank}</text>`);
    parts.push(`<text x="${X_NAME}" y="${y}" font-family="${FONT_FAMILY}" font-size="22" fill="#ffffff" text-anchor="end">${xmlEscape(r.name)}</text>`);
    parts.push(`<text x="${X_PTS}" y="${y}" font-family="${FONT_FAMILY}" font-size="22" font-weight="bold" fill="#7CFC9A" text-anchor="middle">${r.total_points}</text>`);
    parts.push(`<text x="${X_EXACT}" y="${y}" font-family="${FONT_FAMILY}" font-size="20" fill="#cfe8d8" text-anchor="middle">${r.exact_hits}</text>`);
    parts.push(`<text x="${X_PRED}" y="${y}" font-family="${FONT_FAMILY}" font-size="20" fill="#cfe8d8" text-anchor="middle">${r.num_predictions}</text>`);
  });

  parts.push('</svg>');
  return parts.join('\n');
}

// יוצר PNG (Buffer) של טבלת המצטיינים
async function renderLeaderboardPng(limit = 15) {
  const rows = await leaderboard();
  const dateLabel = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(new Date());
  const svg = buildLeaderboardSvg(rows, dateLabel, limit);
  const fontBuffer = fs.readFileSync(FONT_PATH);
  const resvg = new Resvg(svg, {
    font: { fontBuffers: [fontBuffer], defaultFontFamily: FONT_FAMILY, loadSystemFonts: false },
    background: '#0b3d2e'
  });
  return { png: resvg.render().asPng(), dateLabel, count: rows.length };
}

// מפיק ושולח את הדוח ל"מנהלת שליחות" (smtp_manager_email) דרך SMTP
async function sendLeaderboardReport() {
  const s = await readSettingsMap([
    'smtp_server', 'smtp_port', 'smtp_security', 'smtp_user', 'smtp_password', 'smtp_manager_email'
  ]);
  if (!s.smtp_server || !s.smtp_user || !s.smtp_password) {
    throw new Error('חסרים פרטי SMTP בהגדרות');
  }
  const manager = String(s.smtp_manager_email || '').trim();
  if (!manager) throw new Error('לא הוגדרה כתובת "מנהלת שליחות" (smtp_manager_email)');

  const { png, dateLabel, count } = await renderLeaderboardPng(15);
  const transporter = nodemailer.createTransport(buildTransportConfig(s));
  const fileDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const filename = `leaderboard-${fileDate}.png`;

  await transporter.sendMail({
    from: String(s.smtp_user || '').trim(),
    to: manager,
    subject: `טבלת המצטיינים — דוח יומי (${dateLabel})`,
    text: `מצורפת תמונת טבלת המצטיינים נכון לתאריך ${dateLabel}.`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif">
      <p>מצורפת תמונת <strong>טבלת המצטיינים</strong> נכון לתאריך ${xmlEscape(dateLabel)}.</p>
      <img src="cid:leaderboard" alt="טבלת המצטיינים" style="max-width:100%;border-radius:8px"/>
    </div>`,
    attachments: [{ filename, content: png, contentType: 'image/png', cid: 'leaderboard' }]
  });

  return { to: manager, count, dateLabel };
}

module.exports = { renderLeaderboardPng, sendLeaderboardReport, buildLeaderboardSvg };
