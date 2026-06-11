// כל הזמנים באתר מוצגים לפי שעון ישראל (Asia/Jerusalem).
// ה-API מחזיר DATETIME כמחרוזת UTC נאיבית ("2026-06-11 19:00:00") ללא אזור זמן;
// יש לפרש אותה כ-UTC (כפי שהשרת עושה), אחרת הדפדפן מפרש בזמן המקומי ומקבל instant שגוי
// (ובפרט זמן נעילת הניחושים יוצג/יחושב לא נכון).
export const IL_TZ = 'Asia/Jerusalem';

export function parseServerDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value;
  const s = String(value).trim();
  // אם כבר יש אזור זמן (Z או ±hh:mm) — להשתמש כמו שהוא; אחרת להתייחס כ-UTC
  if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  return new Date(`${s.replace(' ', 'T')}Z`);
}

// חותמת זמן במילישניות (absolute) — לחישוב נעילה/השוואות
export function ilMs(value) {
  const d = parseServerDate(value);
  return d ? d.getTime() : NaN;
}

export function ilDateTime(value, locale, opts = {}) {
  const d = parseServerDate(value);
  return d ? d.toLocaleString(locale, { timeZone: IL_TZ, ...opts }) : '';
}

export function ilDate(value, locale, opts = {}) {
  const d = parseServerDate(value);
  return d ? d.toLocaleDateString(locale, { timeZone: IL_TZ, ...opts }) : '';
}

export function ilTime(value, locale, opts = {}) {
  const d = parseServerDate(value);
  return d ? d.toLocaleTimeString(locale, { timeZone: IL_TZ, ...opts }) : '';
}

// מפתח יום (YYYY-MM-DD) לפי שעון ישראל — לקיבוץ משחקים לפי תאריך ישראלי
export function ilDayKey(value) {
  const d = parseServerDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IL_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}
