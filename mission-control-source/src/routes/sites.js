/**
 * Mission Control — Sites API Routes
 * Mounted at: /api/sites
 *
 * Endpoints:
 *   GET  /api/sites/stats              — Global stats + status breakdown
 *   GET  /api/sites/directories        — List directories (filter/search/paginate)
 *   GET  /api/sites/directories/:id    — Single directory
 *   GET  /api/sites/products           — List products
 *   GET  /api/sites/campaigns          — List campaigns (filter by product)
 *   GET  /api/sites/campaigns/:id      — Campaign detail + submissions
 *   GET  /api/sites/submissions        — List submissions (filter by campaign/status)
 *   PUT  /api/sites/submissions/:id    — Update submission status
 *   GET  /api/sites/followups          — List pending follow-ups
 *   PUT  /api/sites/followups/:id/complete — Mark follow-up complete
 */

'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const DB_PATH = path.resolve(process.env.HOME, '.openclaw/workspace/sites.db');

// ─── Database ─────────────────────────────────────────────────────────────────
let _db = null;

function getDb() {
  if (_db) return _db;

  if (!fs.existsSync(DB_PATH)) {
    return null; // DB not yet initialized
  }

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    const localPath = path.join(__dirname, '../../node_modules/better-sqlite3');
    try {
      Database = require(localPath);
    } catch (e2) {
      return null;
    }
  }

  _db = new Database(DB_PATH, { readonly: false });
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  return _db;
}

function requireDb(res) {
  const db = getDb();
  if (!db) {
    res.status(503).json({
      error: 'Sites DB not initialized. Run: node tools/site-manager.js init',
      code: 'DB_NOT_INITIALIZED'
    });
    return null;
  }
  return db;
}

// ─── Middleware: timing ───────────────────────────────────────────────────────
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

// ─── GET /api/sites/stats ─────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const db = requireDb(res);
  if (!db) return;

  try {
    const dirs = db.prepare('SELECT COUNT(*) as count FROM directories').get();
    const products = db.prepare('SELECT COUNT(*) as count FROM products').get();
    const campaigns = db.prepare("SELECT COUNT(*) as count FROM campaigns WHERE status = 'active'").get();
    const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM submissions GROUP BY status').all();
    const totalSubs = byStatus.reduce((s, r) => s + r.count, 0);
    const approved = byStatus.find(s => s.status === 'approved')?.count || 0;
    const submitted = byStatus.filter(s => ['submitted', 'pending_review', 'approved'].includes(s.status)).reduce((s, r) => s + r.count, 0);

    const today = new Date().toISOString().split('T')[0];
    const endOfWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const overdueFollowups = db.prepare(`
      SELECT COUNT(*) as count FROM follow_ups WHERE completed_at IS NULL AND due_date <= ?
    `).get(today);

    const weekFollowups = db.prepare(`
      SELECT COUNT(*) as count FROM follow_ups WHERE completed_at IS NULL AND due_date <= ? AND due_date > ?
    `).get(endOfWeek, today);

    res.json({
      directories: dirs.count,
      products: products.count,
      active_campaigns: campaigns.count,
      total_submissions: totalSubs,
      submitted,
      approved,
      approval_rate: totalSubs > 0 ? Math.round(approved / totalSubs * 100) : 0,
      submission_rate: totalSubs > 0 ? Math.round(submitted / totalSubs * 100) : 0,
      followups_overdue: overdueFollowups.count,
      followups_this_week: weekFollowups.count,
      by_status: byStatus.reduce((obj, r) => { obj[r.status] = r.count; return obj; }, {}),
      query_ms: Date.now() - req._startTime
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sites/directories ───────────────────────────────────────────────
router.get('/directories', (req, res) => {
  const db = requireDb(res);
  if (!db) return;

  try {
    const { tier, health, search, limit = 100, offset = 0, paid_only } = req.query;
    const where = [];
    const params = [];

    if (tier) { where.push('tier = ?'); params.push(parseInt(tier)); }
    if (health) { where.push('health_status = ?'); params.push(health); }
    if (paid_only === '1') { where.push('paid_only = 1'); }
    if (paid_only === '0') { where.push('paid_only = 0'); }
    if (search) {
      where.push('(name LIKE ? OR url LIKE ? OR notes LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) as count FROM directories ${whereClause}`).get(...params);
    const rows = db.prepare(`
      SELECT id, name, url, domain_rating, tier, health_status, captcha_type,
             requires_account, requires_backlink, paid_only, pricing, niche_tags,
             submit_url, notes, created_at
      FROM directories
      ${whereClause}
      ORDER BY tier ASC, domain_rating DESC NULLS LAST
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), parseInt(offset));

    res.json({ total: total.count, rows, query_ms: Date.now() - req._startTime });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sites/directories/:id ──────────────────────────────────────────
router.get('/directories/:id', (req, res) => {
  const db = requireDb(res);
  if (!db) return;

  try {
    const row = db.prepare('SELECT * FROM directories WHERE id = ?').get(parseInt(req.params.id));
    if (!row) return res.status(404).json({ error: 'Directory not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sites/products ──────────────────────────────────────────────────
router.get('/products', (req, res) => {
  const db = requireDb(res);
  if (!db) return;

  try {
    const rows = db.prepare(`
      SELECT p.*,
             COUNT(DISTINCT c.id) as campaign_count,
             COUNT(s.id) as total_submissions,
             SUM(CASE WHEN s.status = 'approved' THEN 1 ELSE 0 END) as approved
      FROM products p
      LEFT JOIN campaigns c ON c.product_id = p.id
      LEFT JOIN submissions s ON s.campaign_id = c.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all();
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sites/campaigns ─────────────────────────────────────────────────
router.get('/campaigns', (req, res) => {
  const db = requireDb(res);
  if (!db) return;

  try {
    const { product, status } = req.query;
    const where = [];
    const params = [];

    if (product) {
      const p = db.prepare('SELECT id FROM products WHERE slug = ?').get(product);
      if (p) { where.push('c.product_id = ?'); params.push(p.id); }
    }
    if (status) { where.push('c.status = ?'); params.push(status); }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT c.id, c.name, c.status, c.created_at, c.notes,
             p.id as product_id, p.slug as product_slug, p.name as product_name,
             COUNT(s.id) as total,
             SUM(CASE WHEN s.status IN ('submitted','pending_review','approved') THEN 1 ELSE 0 END) as submitted,
             SUM(CASE WHEN s.status = 'approved' THEN 1 ELSE 0 END) as approved,
             SUM(CASE WHEN s.status = 'queued' THEN 1 ELSE 0 END) as queued
      FROM campaigns c
      JOIN products p ON p.id = c.product_id
      LEFT JOIN submissions s ON s.campaign_id = c.id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).all(...params);

    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sites/campaigns/:id ────────────────────────────────────────────
router.get('/campaigns/:id', (req, res) => {
  const db = requireDb(res);
  if (!db) return;

  try {
    const campaign = db.prepare(`
      SELECT c.*, p.slug as product_slug, p.name as product_name
      FROM campaigns c JOIN products p ON p.id = c.product_id
      WHERE c.id = ?
    `).get(parseInt(req.params.id));

    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const stats = db.prepare(`
      SELECT status, COUNT(*) as count FROM submissions WHERE campaign_id = ? GROUP BY status
    `).all(campaign.id);

    const total = stats.reduce((s, r) => s + r.count, 0);
    const approved = stats.find(s => s.status === 'approved')?.count || 0;

    res.json({
      campaign,
      stats: stats.reduce((obj, r) => { obj[r.status] = r.count; return obj; }, {}),
      total,
      approval_rate: total > 0 ? Math.round(approved / total * 100) : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sites/submissions ───────────────────────────────────────────────
router.get('/submissions', (req, res) => {
  const db = requireDb(res);
  if (!db) return;

  try {
    const { campaign, status, limit = 200, offset = 0 } = req.query;
    const where = [];
    const params = [];

    if (campaign) { where.push('s.campaign_id = ?'); params.push(parseInt(campaign)); }
    if (status) { where.push('s.status = ?'); params.push(status); }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`
      SELECT COUNT(*) as count FROM submissions s ${whereClause}
    `).get(...params);

    const rows = db.prepare(`
      SELECT s.id, s.status, s.submitted_at, s.confirmed_at, s.approved_at, s.rejected_at,
             s.submitted_by, s.listing_url, s.notes, s.updated_at,
             d.id as dir_id, d.name as dir_name, d.url as dir_url,
             d.tier, d.domain_rating, d.captcha_type, d.requires_account,
             d.health_status,
             c.id as campaign_id, c.name as campaign_name
      FROM submissions s
      JOIN directories d ON d.id = s.directory_id
      JOIN campaigns c ON c.id = s.campaign_id
      ${whereClause}
      ORDER BY s.status, d.tier ASC, d.domain_rating DESC NULLS LAST
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), parseInt(offset));

    res.json({ total: total.count, rows, query_ms: Date.now() - req._startTime });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/sites/submissions/:id ──────────────────────────────────────────
router.put('/submissions/:id', express.json(), (req, res) => {
  const db = requireDb(res);
  if (!db) return;

  try {
    const id = parseInt(req.params.id);
    const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    const { status, listing_url, notes } = req.body;

    let extraCols = '';
    if (status === 'approved') extraCols += ', approved_at = CURRENT_TIMESTAMP';
    if (status === 'rejected') extraCols += ', rejected_at = CURRENT_TIMESTAMP';
    if (status === 'submitted') extraCols += ', submitted_at = CURRENT_TIMESTAMP';

    db.prepare(`
      UPDATE submissions
      SET status = COALESCE(?, status),
          listing_url = COALESCE(?, listing_url),
          notes = COALESCE(?, notes),
          updated_at = CURRENT_TIMESTAMP
          ${extraCols}
      WHERE id = ?
    `).run(status || null, listing_url || null, notes || null, id);

    const updated = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
    res.json({ ok: true, submission: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sites/followups ─────────────────────────────────────────────────
router.get('/followups', (req, res) => {
  const db = requireDb(res);
  if (!db) return;

  try {
    const { filter = 'pending', campaign } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const endOfWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const where = ['f.completed_at IS NULL'];
    const params = [];

    if (filter === 'overdue') {
      where.push('f.due_date < ?');
      params.push(today);
    } else if (filter === 'today') {
      where.push('f.due_date = ?');
      params.push(today);
    } else if (filter === 'week') {
      where.push('f.due_date <= ?');
      params.push(endOfWeek);
    }
    // filter=pending → all uncompleted

    if (campaign) {
      where.push('s.campaign_id = ?');
      params.push(parseInt(campaign));
    }

    const rows = db.prepare(`
      SELECT f.id, f.type, f.due_date, f.notes, f.created_at,
             s.id as submission_id, s.status as sub_status,
             d.id as dir_id, d.name as dir_name, d.url as dir_url,
             c.id as campaign_id, c.name as campaign_name,
             CASE
               WHEN f.due_date < ? THEN 'overdue'
               WHEN f.due_date = ? THEN 'today'
               ELSE 'upcoming'
             END as urgency
      FROM follow_ups f
      JOIN submissions s ON s.id = f.submission_id
      JOIN directories d ON d.id = s.directory_id
      JOIN campaigns c ON c.id = s.campaign_id
      WHERE ${where.join(' AND ')}
      ORDER BY f.due_date ASC, urgency ASC
      LIMIT 500
    `).all(today, today, ...params);

    res.json({ rows, query_ms: Date.now() - req._startTime });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/sites/followups/:id/complete ────────────────────────────────────
router.put('/followups/:id/complete', express.json(), (req, res) => {
  const db = requireDb(res);
  if (!db) return;

  try {
    const id = parseInt(req.params.id);
    const row = db.prepare('SELECT id FROM follow_ups WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Follow-up not found' });

    db.prepare('UPDATE follow_ups SET completed_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
