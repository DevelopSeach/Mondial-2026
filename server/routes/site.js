const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { seedFooterDocuments } = require('../lib/footer-content');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

async function ensureWritableUploadDir(candidates) {
  let lastError = null;
  for (const dir of candidates) {
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.access(dir, fs.constants.W_OK);
      return dir;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('no writable upload directory');
}

router.get('/footer-docs', auth(false), async (req, res) => {
  try {
    await db.tx(async (t) => seedFooterDocuments(t));
    const rows = await db.query(`
      SELECT id, doc_key, label, file_url, file_type, sort_order
      FROM footer_documents
      ORDER BY sort_order ASC, id ASC
    `);
    res.json(rows);
  } catch (e) {
    console.error('site/footer-docs:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

router.post('/contact', auth(false), upload.single('image'), async (req, res) => {
  try {
    await db.tx(async (t) => seedFooterDocuments(t));
    const name = String(req.body?.name || req.user?.name || '').trim();
    const phone = String(req.body?.phone_number || '').trim();
    const message = String(req.body?.message || '').trim();

    if (!name || !message) {
      return res.status(400).json({ error: 'יש להזין שם והודעה' });
    }

    let imageUrl = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname || '').toLowerCase() || '.jpg';
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
      const rootDir = await ensureWritableUploadDir([
        path.join(__dirname, '..', '..', 'data', 'contact_messages'),
        path.join(__dirname, '..', '..', 'data', 'profile_images', 'contact_messages')
      ]);
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`;
      const fullPath = path.join(rootDir, fileName);
      await fs.promises.writeFile(fullPath, req.file.buffer);
      imageUrl = rootDir.includes(`${path.sep}profile_images${path.sep}`)
        ? `/data/profile_images/contact_messages/${fileName}`
        : `/data/contact_messages/${fileName}`;
    }

    await db.run(`
      INSERT INTO contact_messages (user_id, name, phone_number, message, image_url)
      VALUES (?, ?, ?, ?, ?)
    `, [req.user?.id || null, name, phone || null, message, imageUrl]);

    res.json({ ok: true });
  } catch (e) {
    console.error('site/contact:', e);
    res.status(500).json({ error: 'שליחת הפנייה נכשלה' });
  }
});

module.exports = router;
