const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3456;
const DATA_DIR = process.env.DATA_DIR || '.';

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', port: PORT });
});

// Root
app.get('/', (req, res) => {
  res.send('Family Calendar API is running!');
});

// Static files
app.use(express.static('public'));

// Database init
const db = new sqlite3.Database(path.join(DATA_DIR, 'database.sqlite'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS families (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    family_id TEXT,
    title TEXT,
    date TEXT,
    time TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS daily_themes (
    id TEXT PRIMARY KEY,
    family_id TEXT,
    date TEXT,
    theme_data TEXT
  )`);
});

// API: create family
const { v4: uuidv4 } = require('uuid');
app.post('/api/family/create', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'Name and password required' });
  const id = uuidv4();
  db.run('INSERT INTO families (id, name, password) VALUES (?, ?, ?)', [id, name, password], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, name, message: 'Family created' });
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
