const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3456;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// 确保上传目录存在
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}

// 数据库初始化
const db = new sqlite3.Database('database.sqlite');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS families (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    event_time TEXT,
    media_type TEXT DEFAULT 'text',
    media_path TEXT,
    status TEXT DEFAULT 'active',
    color TEXT DEFAULT '#FF8FAB',
    recurring TEXT DEFAULT 'none',
    parent_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES families(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS daily_themes (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    date TEXT NOT NULL,
    theme_data TEXT,
    FOREIGN KEY (family_id) REFERENCES families(id)
  )`);
});

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.body.mediaType || 'files';
    const dir = `uploads/${type}`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = uuidv4() + path.extname(file.originalname);
    cb(null, unique);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ========== API 路由 ==========

// 创建家庭
app.post('/api/family/create', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: '需要家庭名称和密码' });
  
  const id = uuidv4();
  db.run('INSERT INTO families (id, name, password) VALUES (?, ?, ?)', 
    [id, name, password], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, name, message: '家庭创建成功' });
  });
});

// 登录家庭
app.post('/api/family/login', (req, res) => {
  const { name, password } = req.body;
  db.get('SELECT * FROM families WHERE name = ? AND password = ?', [name, password], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: '家庭名称或密码错误' });
    res.json({ id: row.id, name: row.name });
  });
});

// 获取家庭事件（按月）
app.get('/api/events/:familyId', (req, res) => {
  const { familyId } = req.params;
  const { month } = req.query; // YYYY-MM格式
  let sql = 'SELECT * FROM events WHERE family_id = ?';
  let params = [familyId];
  if (month) {
    sql += ' AND date LIKE ?';
    params.push(`${month}%`);
  }
  sql += ' ORDER BY date, event_time';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 获取某天事件
app.get('/api/events/day/:familyId/:date', (req, res) => {
  const { familyId, date } = req.params;
  db.all('SELECT * FROM events WHERE family_id = ? AND date = ? ORDER BY event_time', 
    [familyId, date], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 创建事件
app.post('/api/events', (req, res) => {
  const { family_id, date, title, description, event_time, media_type, media_path, color, recurring } = req.body;
  if (!family_id || !date || !title) {
    return res.status(400).json({ error: '缺少必要字段' });
  }
  
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  if (date < today) {
    return res.status(403).json({ error: '不能修改过去日期的事件' });
  }
  
  const parentId = uuidv4();
  const rec = recurring || 'none';
  const eventColor = color || '#FF8FAB';
  const eventsToCreate = [];
  
  // 生成重复事件（最多生成一年）
  if (rec === 'daily') {
    for (let i = 0; i < 90; i++) {
      const d = new Date(date); d.setDate(d.getDate() + i);
      eventsToCreate.push(d.toISOString().split('T')[0]);
    }
  } else if (rec === 'weekly') {
    for (let i = 0; i < 52; i++) {
      const d = new Date(date); d.setDate(d.getDate() + i * 7);
      eventsToCreate.push(d.toISOString().split('T')[0]);
    }
  } else if (rec === 'monthly') {
    for (let i = 0; i < 12; i++) {
      const d = new Date(date); d.setMonth(d.getMonth() + i);
      eventsToCreate.push(d.toISOString().split('T')[0]);
    }
  } else {
    eventsToCreate.push(date);
  }
  
  const stmt = db.prepare(`INSERT INTO events (id, family_id, date, title, description, event_time, media_type, media_path, color, recurring, parent_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  
  let created = 0;
  eventsToCreate.forEach(d => {
    const id = uuidv4();
    stmt.run([id, family_id, d, title, description || '', event_time || '', media_type || 'text', media_path || '', eventColor, rec, parentId]);
    created++;
  });
  stmt.finalize();
  
  res.json({ id: parentId, message: `事件创建成功，共${created}个` });
});

// 更新事件（完成/编辑）
app.put('/api/events/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, event_time, status, media_type, media_path } = req.body;
  
  db.get('SELECT * FROM events WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '事件不存在' });
    
    const now = new Date();
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    if (row.date < today) {
      // 过去日期只允许切换查看，不允许修改内容
      if (status !== undefined) {
        db.run('UPDATE events SET status = ? WHERE id = ?', [status, id], function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: '状态更新成功' });
        });
        return;
      }
      return res.status(403).json({ error: '不能修改过去日期的事件内容' });
    }
    
    const fields = [];
    const values = [];
    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (event_time !== undefined) { fields.push('event_time = ?'); values.push(event_time); }
    if (status !== undefined) { fields.push('status = ?'); values.push(status); }
    if (media_type !== undefined) { fields.push('media_type = ?'); values.push(media_type); }
    if (media_path !== undefined) { fields.push('media_path = ?'); values.push(media_path); }
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    
    db.run(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`, values, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: '事件更新成功' });
    });
  });
});

// 删除事件
app.delete('/api/events/:id', (req, res) => {
  const { id } = req.params;
  const { all } = req.query; // 是否删除整个重复系列
  
  db.get('SELECT * FROM events WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '事件不存在' });
    
    const now = new Date();
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    if (row.date < today) {
      return res.status(403).json({ error: '不能删除过去日期的事件' });
    }
    
    if (all === 'true' && row.parent_id) {
      // 删除整个系列
      db.all('SELECT * FROM events WHERE parent_id = ?', [row.parent_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run('DELETE FROM events WHERE parent_id = ?', [row.parent_id], function(err) {
          if (err) return res.status(500).json({ error: err.message });
          // 删除关联文件（只删一次）
          if (row.media_path && fs.existsSync(row.media_path)) {
            fs.unlinkSync(row.media_path);
          }
          res.json({ message: '重复事件系列已删除' });
        });
      });
    } else {
      db.run('DELETE FROM events WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (row.media_path && fs.existsSync(row.media_path)) {
          fs.unlinkSync(row.media_path);
        }
        res.json({ message: '事件删除成功' });
      });
    }
  });
});

// 文件上传
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有上传文件' });
  res.json({ path: req.file.path, url: `/${req.file.path}` });
});

// 获取每日主题
app.get('/api/theme/:familyId/:date', (req, res) => {
  const { familyId, date } = req.params;
  db.get('SELECT * FROM daily_themes WHERE family_id = ? AND date = ?', [familyId, date], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { theme_data: null });
  });
});

// 设置每日主题
app.post('/api/theme', (req, res) => {
  const { family_id, date, theme_data } = req.body;
  const id = uuidv4();
  db.run(`INSERT OR REPLACE INTO daily_themes (id, family_id, date, theme_data) VALUES (?, ?, ?, ?)`,
    [id, family_id, date, theme_data], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: '主题设置成功' });
  });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`家庭日历服务器运行在 http://0.0.0.0:${PORT}`);
  console.log(`在浏览器中打开 http://localhost:${PORT} 开始使用`);
});
