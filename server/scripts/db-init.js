#!/usr/bin/env node
// scripts/db-init.js
// מריץ את כל ה-CREATE TABLE IF NOT EXISTS מתוך ../schema.js.
// בטוח להרצה חוזרת.

require('dotenv').config();
const db = require('../db');
const schema = require('../schema');

async function main() {
  console.log('🛠️  יוצר טבלאות (אם לא קיימות)...');
  try {
    await db.ping();
  } catch (e) {
    console.error('✗ אין גישה ל-DATABASE. הרץ קודם: npm run db:create');
    console.error('   הודעה:', e.message);
    process.exit(1);
  }
  for (const ddl of schema) {
    await db.query(ddl);
    const tableName = (ddl.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/) || [])[1] || '?';
    console.log(`   ✓ ${tableName}`);
  }
  console.log('   ✓ הסכמה הוקמה בהצלחה');
}

main().then(() => process.exit(0)).catch(e => {
  console.error('✗ שגיאה ביצירת טבלאות:', e.message);
  process.exit(1);
});
