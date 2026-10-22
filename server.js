require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'social_media.db'));
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 2000),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 1000),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS likes (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(post_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK(follower_id <> following_id),
    PRIMARY KEY(follower_id, following_id)
  );
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
`);

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(session({
  name: 'codealpha.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-me-before-deployment',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.static(path.join(__dirname, 'public')));

const publicUser = (row) => row ? ({
  id: row.id, username: row.username, displayName: row.display_name,
  bio: row.bio || '', avatarUrl: row.avatar_url || '', createdAt: row.created_at
}) : null;
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please sign in to continue.' });
  const user = db.prepare('SELECT id, username, email, display_name, bio, avatar_url, created_at FROM users WHERE id = ?').get(req.session.userId);
  if (!user) { req.session.destroy(() => {}); return res.status(401).json({ error: 'Your session expired. Please sign in again.' }); }
  req.user = user;
  next();
}
function validText(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}
function postPayload(post, viewerId) {
  const comments = db.prepare(`SELECT c.id, c.content, c.created_at, u.id AS user_id, u.username, u.display_name
    FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at ASC, c.id ASC`).all(post.id);
  return {
    id: post.id, content: post.content, createdAt: post.created_at,
    author: { id: post.user_id, username: post.username, displayName: post.display_name, avatarUrl: post.avatar_url || '' },
    likeCount: db.prepare('SELECT COUNT(*) AS count FROM likes WHERE post_id = ?').get(post.id).count,
    commentCount: comments.length,
    likedByMe: Boolean(db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(post.id, viewerId)),
    comments: comments.map(c => ({ id: c.id, content: c.content, createdAt: c.created_at, user: { id: c.user_id, username: c.username, displayName: c.display_name } }))
  };
}
function getUserPosts(userId, viewerId) {
  const posts = db.prepare(`SELECT p.id, p.content, p.created_at, u.id AS user_id, u.username, u.display_name, u.avatar_url
    FROM posts p JOIN users u ON u.id = p.user_id WHERE p.user_id = ? ORDER BY p.created_at DESC, p.id DESC LIMIT 30`).all(userId);
  return posts.map(p => postPayload(p, viewerId));
}

app.post('/api/auth/register', (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const displayName = String(req.body.displayName || username).trim();
  const password = String(req.body.password || '');
  if (!/^[A-Za-z0-9_.]{3,24}$/.test(username)) return res.status(400).json({ error: 'Username must be 3–24 characters (letters, numbers, underscore or dot).' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!validText(displayName, 40)) return res.status(400).json({ error: 'Display name must be 1–40 characters.' });
  if (password.length < 8 || password.length > 100) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    const result = db.prepare('INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)')
      .run(username, email, bcrypt.hashSync(password, 12), displayName);
    req.session.userId = Number(result.lastInsertRowid);
    const user = db.prepare('SELECT id, username, email, display_name, bio, avatar_url, created_at FROM users WHERE id = ?').get(req.session.userId);
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (String(error.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'That username or email is already registered.' });
    console.error(error); res.status(500).json({ error: 'Could not create your account.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const identity = String(req.body.identity || '').trim();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT id, username, email, password_hash, display_name, bio, avatar_url, created_at FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE').get(identity, identity);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Incorrect username/email or password.' });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not start your session.' });
    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  });
});
app.post('/api/auth/logout', (req, res) => req.session.destroy(() => { res.clearCookie('codealpha.sid'); res.json({ ok: true }); }));
app.get('/api/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.get('/api/feed', requireAuth, (req, res) => {
  const posts = db.prepare(`SELECT p.id, p.content, p.created_at, u.id AS user_id, u.username, u.display_name, u.avatar_url
    FROM posts p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC, p.id DESC LIMIT 50`).all();
  res.json({ posts: posts.map(p => postPayload(p, req.user.id)) });
});
app.post('/api/posts', requireAuth, (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!validText(content, 2000)) return res.status(400).json({ error: 'A post must contain 1–2,000 characters.' });
  const result = db.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)').run(req.user.id, content);
  const post = db.prepare(`SELECT p.id, p.content, p.created_at, u.id AS user_id, u.username, u.display_name, u.avatar_url
    FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?`).get(result.lastInsertRowid);
  res.status(201).json({ post: postPayload(post, req.user.id) });
});
app.post('/api/posts/:id/comments', requireAuth, (req, res) => {
  const postId = Number(req.params.id), content = String(req.body.content || '').trim();
  if (!Number.isInteger(postId) || !db.prepare('SELECT id FROM posts WHERE id = ?').get(postId)) return res.status(404).json({ error: 'Post not found.' });
  if (!validText(content, 1000)) return res.status(400).json({ error: 'A comment must contain 1–1,000 characters.' });
  const result = db.prepare('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)').run(postId, req.user.id, content);
  res.status(201).json({ comment: { id: Number(result.lastInsertRowid), content, user: publicUser(req.user) } });
});
app.post('/api/posts/:id/like', requireAuth, (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isInteger(postId) || !db.prepare('SELECT id FROM posts WHERE id = ?').get(postId)) return res.status(404).json({ error: 'Post not found.' });
  const existing = db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(postId, req.user.id);
  if (existing) db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(postId, req.user.id);
  else db.prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?)').run(postId, req.user.id);
  res.json({ liked: !existing, likeCount: db.prepare('SELECT COUNT(*) AS count FROM likes WHERE post_id = ?').get(postId).count });
});

app.put('/api/profile', requireAuth, (req, res) => {
  const displayName = String(req.body.displayName || '').trim();
  const bio = String(req.body.bio || '').trim();
  const avatarUrl = String(req.body.avatarUrl || '').trim();
  if (!validText(displayName, 40)) return res.status(400).json({ error: 'Display name must be 1–40 characters.' });
  if (bio.length > 280) return res.status(400).json({ error: 'Bio must be 280 characters or fewer.' });
  if (avatarUrl && (!/^https:\/\//i.test(avatarUrl) || avatarUrl.length > 500)) return res.status(400).json({ error: 'Avatar URL must be an HTTPS URL under 500 characters.' });
  db.prepare('UPDATE users SET display_name = ?, bio = ?, avatar_url = ? WHERE id = ?').run(displayName, bio, avatarUrl, req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT id, username, email, display_name, bio, avatar_url, created_at FROM users WHERE id = ?').get(req.user.id)) });
});
app.get('/api/users/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 50);
  if (!q) return res.json({ users: [] });
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const rows = db.prepare(`SELECT id, username, display_name, bio, avatar_url,
    (SELECT COUNT(*) FROM follows WHERE following_id = users.id) AS followers_count,
    EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND following_id = users.id) AS followed_by_me
    FROM users WHERE id <> ? AND (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\') ORDER BY username LIMIT 20`).all(req.user.id, req.user.id, pattern, pattern);
  res.json({ users: rows.map(u => ({ id: u.id, username: u.username, displayName: u.display_name, bio: u.bio, avatarUrl: u.avatar_url, followersCount: u.followers_count, followedByMe: Boolean(u.followed_by_me) })) });
});
app.get('/api/users/:username', requireAuth, (req, res) => {
  const user = db.prepare(`SELECT id, username, display_name, bio, avatar_url, created_at,
    (SELECT COUNT(*) FROM posts WHERE user_id = users.id) AS posts_count,
    (SELECT COUNT(*) FROM follows WHERE following_id = users.id) AS followers_count,
    (SELECT COUNT(*) FROM follows WHERE follower_id = users.id) AS following_count,
    EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND following_id = users.id) AS followed_by_me
    FROM users WHERE username = ? COLLATE NOCASE`).get(req.user.id, req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ profile: { id: user.id, username: user.username, displayName: user.display_name, bio: user.bio, avatarUrl: user.avatar_url, createdAt: user.created_at, postsCount: user.posts_count, followersCount: user.followers_count, followingCount: user.following_count, followedByMe: Boolean(user.followed_by_me), isMe: user.id === req.user.id }, posts: getUserPosts(user.id, req.user.id) });
});
app.post('/api/users/:id/follow', requireAuth, (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || !db.prepare('SELECT id FROM users WHERE id = ?').get(targetId)) return res.status(404).json({ error: 'User not found.' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'You cannot follow yourself.' });
  const existing = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, targetId);
  if (existing) db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.user.id, targetId);
  else db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, targetId);
  res.json({ following: !existing, followersCount: db.prepare('SELECT COUNT(*) AS count FROM follows WHERE following_id = ?').get(targetId).count });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});
app.listen(PORT, () => console.log(`CodeAlpha Social Media running at http://localhost:${PORT}`));
