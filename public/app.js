// ===== 配置 =====
const API_BASE = window.location.origin;
let currentFamily = null;
let currentMonth = new Date();
let selectedDate = null;
let currentMediaType = 'text';
let currentMediaPath = '';
let currentColor = '#FF8FAB';
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let eventsCache = {};
let remindedEvents = {}; // 记录已提醒的事件，避免重复提醒
let reminderInterval = null;

// 可爱emoji集合
const cuteEmojis = ['🐰','🌸','🎀','🌟','☁️','🍓','🧸','🎈','💖','✨','🌈','🍰','🎵','🦊','🐱','🐶'];
const dayEmojis = ['🌅','🌄','🌞','🌻','🌤️','⭐','🌙'];

// 每日可爱主题色
function getTodayStr() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

const dailyThemes = [
  {bg: 'linear-gradient(135deg, #FFC2D1 0%, #FFB3C6 100%)', emoji: '🌸'},
  {bg: 'linear-gradient(135deg, #BDE0FE 0%, #A2D2FF 100%)', emoji: '☁️'},
  {bg: 'linear-gradient(135deg, #CDB4DB 0%, #E0BBE4 100%)', emoji: '🔮'},
  {bg: 'linear-gradient(135deg, #FFDAC1 0%, #FFD6A5 100%)', emoji: '🌞'},
  {bg: 'linear-gradient(135deg, #C1FBA4 0%, #B9FBC0 100%)', emoji: '🌿'},
  {bg: 'linear-gradient(135deg, #A0C4FF 0%, #9BF6FF 100%)', emoji: '💧'},
  {bg: 'linear-gradient(135deg, #FDFFB6 0%, #FFF0A5 100%)', emoji: '⭐'}
];

function getDailyTheme(dateStr) {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1]-1, parts[2]);
  const idx = (d.getFullYear() * 365 + d.getMonth() * 31 + d.getDate()) % dailyThemes.length;
  return dailyThemes[idx];
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  initBackground();
  const saved = localStorage.getItem('familySession');
  if (saved) {
    try {
      currentFamily = JSON.parse(saved);
      showCalendar();
    } catch(e) { localStorage.removeItem('familySession'); }
  }
});

function initBackground() {
  const container = document.getElementById('bgDecoration');
  const items = [
    {type:'cloud',x:10,y:15},{type:'cloud',x:70,y:25},{type:'cloud',x:40,y:60},
    {type:'star',x:20,y:40},{type:'star',x:80,y:10},{type:'star',x:60,y:70},{type:'star',x:30,y:80},
    {type:'heart',x:85,y:50},{type:'heart',x:15,y:75}
  ];
  items.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = item.type;
    el.style.left = item.x + '%';
    el.style.top = item.y + '%';
    el.style.animationDelay = (i * 0.7) + 's';
    el.textContent = item.type === 'cloud' ? '☁️' : item.type === 'star' ? '⭐' : '💕';
    container.appendChild(el);
  });
}

// ===== 页面路由 =====
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}

// ===== 登录/注册 =====
function toggleCreate() {
  const login = document.getElementById('loginForm');
  const create = document.getElementById('createForm');
  if (login.style.display === 'none') {
    login.style.display = 'block';
    create.style.display = 'none';
  } else {
    login.style.display = 'none';
    create.style.display = 'block';
  }
}

async function login() {
  const name = document.getElementById('loginName').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!name || !password) return showToast('请填写家庭名称和密码');
  try {
    const res = await fetch(`${API_BASE}/api/family/login`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({name, password})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    currentFamily = data;
    localStorage.setItem('familySession', JSON.stringify(currentFamily));
    showToast('欢迎回家！🏠');
    showCalendar();
  } catch(e) { showToast(e.message); }
}

async function createFamily() {
  const name = document.getElementById('createName').value.trim();
  const password = document.getElementById('createPassword').value;
  if (!name || !password) return showToast('请填写完整信息');
  if (password.length < 4) return showToast('密码至少4位');
  try {
    const res = await fetch(`${API_BASE}/api/family/create`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({name, password})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    currentFamily = data;
    localStorage.setItem('familySession', JSON.stringify(currentFamily));
    showToast('家庭创建成功！🎉');
    showCalendar();
  } catch(e) { showToast(e.message); }
}

function logout() {
  stopReminderChecker();
  currentFamily = null;
  localStorage.removeItem('familySession');
  document.getElementById('loginName').value = '';
  document.getElementById('loginPassword').value = '';
  showPage('pageLogin');
}

// ===== 日历 =====
function showCalendar() {
  if (!currentFamily) return showPage('pageLogin');
  document.getElementById('familyBadge').textContent = '🏠 ' + currentFamily.name;
  renderCalendar();
  showPage('pageCalendar');
  // 启动提醒检查和通知权限
  startReminderChecker();
  requestNotificationPermission();
}

function changeMonth(delta) {
  currentMonth.setMonth(currentMonth.getMonth() + delta);
  renderCalendar();
}

function goToToday() {
  currentMonth = new Date();
  renderCalendar();
  const today = getTodayStr();
  setTimeout(() => showDay(today), 300);
}

async function renderCalendar() {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  document.getElementById('monthTitle').textContent = `${year}年${month+1}月`;

  // 获取当月事件
  const monthStr = `${year}-${String(month+1).padStart(2,'0')}`;
  try {
    const res = await fetch(`${API_BASE}/api/events/${currentFamily.id}?month=${monthStr}`);
    const events = await res.json();
    eventsCache = {};
    events.forEach(e => {
      if (!eventsCache[e.date]) eventsCache[e.date] = [];
      eventsCache[e.date].push(e);
    });
  } catch(e) { console.error(e); }

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';
  const weekdays = ['日','一','二','三','四','五','六'];
  weekdays.forEach(d => {
    const el = document.createElement('div');
    el.className = 'weekday';
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const today = getTodayStr();

  for (let i = 0; i < firstDay; i++) {
    grid.appendChild(document.createElement('div'));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    cell.textContent = d;
    if (dateStr === today) cell.classList.add('today');
    if (dateStr < today) cell.classList.add('past');
    if (eventsCache[dateStr] && eventsCache[dateStr].length > 0) {
      cell.classList.add('has-events');
      const dots = document.createElement('div');
      dots.className = 'event-dots';
      const activeCount = eventsCache[dateStr].filter(e => e.status === 'active').length;
      for (let k = 0; k < Math.min(activeCount, 3); k++) {
        const dot = document.createElement('div');
        dot.className = 'event-dot';
        dots.appendChild(dot);
      }
      cell.appendChild(dots);
    }
    cell.onclick = () => showDay(dateStr);
    grid.appendChild(cell);
  }
}

// ===== 日详情 =====
async function showDay(dateStr) {
  selectedDate = dateStr;
  const parts = dateStr.split('-').map(Number);
  const dateObj = new Date(parts[0], parts[1]-1, parts[2]);
  const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  const today = getTodayStr();

  document.getElementById('dayFamilyBadge').textContent = '🏠 ' + currentFamily.name;
  document.getElementById('dayTitle').textContent = `${parts[1]}月${parts[2]}日`;

  // 从服务器获取最新事件
  let events = [];
  try {
    const res = await fetch(`${API_BASE}/api/events/day/${currentFamily.id}/${dateStr}`);
    events = await res.json();
    eventsCache[dateStr] = events;
  } catch(e) { events = eventsCache[dateStr] || []; }

  const activeCount = events.filter(e => e.status === 'active').length;
  const isPast = dateStr < today;

  document.getElementById('daySubtitle').textContent =
    weekdays[dateObj.getDay()] + (events.length > 0 ? ` · ${activeCount}件待办` : ' · 无安排');

  // 每日主题
  const theme = getDailyTheme(dateStr);
  document.getElementById('dayHero').style.background = theme.bg;
  const heroEmojis = isPast ? ['📖','🌙','✨'] : [theme.emoji, '🌸','🌞','🎀','🌟','🍓','🧸'];
  document.getElementById('heroEmoji').textContent = heroEmojis[Math.floor(Math.random()*heroEmojis.length)];

  // 过去日期隐藏添加按钮
  document.getElementById('dayFab').style.display = isPast ? 'none' : 'flex';

  renderEventList(events, isPast);
  showPage('pageDay');
}

function renderEventList(events, isPast) {
  const list = document.getElementById('eventList');
  list.innerHTML = '';

  if (events.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="emoji">🌈</div>
        <p>今天还没有安排哦~</p>
        ${!isPast ? '<p style="margin-top:8px; font-size:0.85rem;">点击右下角 + 添加新事件</p>' : ''}
      </div>`;
    return;
  }

  // 排序：先按状态（未完成在前），再按时间
  const sorted = [...events].sort((a,b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return (a.event_time || '').localeCompare(b.event_time || '');
  });

  sorted.forEach((event, idx) => {
    const card = document.createElement('div');
    card.className = 'event-card' + (event.status === 'completed' ? ' completed' : '') + (isPast ? ' past-card' : '');
    card.style.animationDelay = (idx * 0.08) + 's';
    const borderColor = event.color || '#FF8FAB';
    card.style.borderLeft = `5px solid ${borderColor}`;

    let mediaHtml = '';
    if (event.media_type === 'image' && event.media_path) {
      mediaHtml = `<div class="event-media"><img src="${API_BASE}${event.media_path}" alt="图片" loading="lazy"></div>`;
    } else if (event.media_type === 'video' && event.media_path) {
      mediaHtml = `<div class="event-media"><video src="${API_BASE}${event.media_path}" controls></video></div>`;
    } else if (event.media_type === 'audio' && event.media_path) {
      mediaHtml = `<div class="event-media"><audio src="${API_BASE}${event.media_path}" controls style="width:100%"></audio></div>`;
    }

    const timeStr = event.event_time ? event.event_time.slice(0,5) : '';
    const recLabel = event.recurring && event.recurring !== 'none' 
      ? {daily:'每天',weekly:'每周',monthly:'每月'}[event.recurring] 
      : '';
    const actions = [];
    if (!isPast) {
      actions.push(`<button class="btn btn-success btn-small" onclick="toggleEventStatus('${event.id}', '${event.status === 'active' ? 'completed' : 'active'}')">${event.status === 'active' ? '✅ 完成' : '↩️ 恢复'}</button>`);
      if (event.recurring && event.recurring !== 'none') {
        actions.push(`<button class="btn btn-secondary btn-small" onclick="deleteEvent('${event.id}', true)">🗑️ 删全部</button>`);
        actions.push(`<button class="btn btn-secondary btn-small" onclick="deleteEvent('${event.id}', false)">🗑️ 删这天</button>`);
      } else {
        actions.push(`<button class="btn btn-secondary btn-small" onclick="deleteEvent('${event.id}')">🗑️ 删除</button>`);
      }
    } else {
      actions.push(`<span style="font-size:0.8rem; color:var(--text-light);">📌 历史事件</span>`);
    }

    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        ${timeStr ? `<span class="event-time">⏰ ${timeStr}</span>` : ''}
        ${recLabel ? `<span style="font-size:0.75rem;background:${borderColor}22;color:${borderColor};padding:3px 8px;border-radius:8px;font-weight:700;">🔁 ${recLabel}</span>` : ''}
      </div>
      <div class="event-title">${escapeHtml(event.title)}</div>
      ${event.description ? `<div class="event-desc">${escapeHtml(event.description)}</div>` : ''}
      ${mediaHtml}
      <div class="event-actions">${actions.join('')}</div>
    `;
    list.appendChild(card);
  });
}

function backToDay() {
  if (selectedDate) showDay(selectedDate);
  else showCalendar();
}

// ===== 添加事件 =====
function showAddEvent() {
  if (!selectedDate) return;
  const today = getTodayStr();
  if (selectedDate < today) return showToast('不能给过去日期添加事件');

  document.getElementById('eventTitle').value = '';
  document.getElementById('eventTime').value = '';
  document.getElementById('eventDesc').value = '';
  document.getElementById('eventRecurring').value = 'none';
  const textTab = document.querySelector('.media-tab');
  if (textTab) setMediaType(textTab, 'text');
  else setMediaType(null, 'text');
  currentMediaPath = '';
  currentColor = '#FF8FAB';
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  document.querySelector('.color-dot[data-color="#FF8FAB"]').classList.add('active');
  document.getElementById('mediaPreview').style.display = 'none';
  document.getElementById('mediaPreview').innerHTML = '';
  showPage('pageAddEvent');
}

function pickColor(dot) {
  currentColor = dot.dataset.color;
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  dot.classList.add('active');
}

function setMediaType(btn, type) {
  currentMediaType = type;
  document.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

  document.getElementById('uploadControls').style.display = (type === 'image' || type === 'video') ? 'block' : 'none';
  document.getElementById('recordControls').style.display = type === 'audio' ? 'block' : 'none';
  document.getElementById('mediaPreview').style.display = 'none';
  document.getElementById('mediaPreview').innerHTML = '';
  currentMediaPath = '';

  const fileInput = document.getElementById('fileInput');
  if (type === 'image') fileInput.accept = 'image/*';
  else if (type === 'video') fileInput.accept = 'video/*';
  else fileInput.accept = '';
}

// 文件上传
const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  showToast('正在上传...');
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mediaType', currentMediaType);

  try {
    const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    currentMediaPath = data.path;
    const preview = document.getElementById('mediaPreview');
    preview.style.display = 'flex';
    if (currentMediaType === 'image') {
      preview.innerHTML = `<img src="${API_BASE}${data.url}" alt="预览">`;
    } else if (currentMediaType === 'video') {
      preview.innerHTML = `<video src="${API_BASE}${data.url}" controls></video>`;
    }
    showToast('上传成功！');
  } catch(err) {
    showToast('上传失败：' + err.message);
  }
});

// 录音
async function toggleRecord() {
  const btn = document.getElementById('recordBtn');
  const status = document.getElementById('recordStatus');

  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      recordedChunks = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const file = new File([blob], `record_${Date.now()}.webm`, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', file);
        formData.append('mediaType', 'audio');
        showToast('正在保存录音...');
        try {
          const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          currentMediaPath = data.path;
          const preview = document.getElementById('mediaPreview');
          preview.style.display = 'flex';
          preview.innerHTML = `<audio src="${API_BASE}${data.url}" controls style="width:100%"></audio>`;
          showToast('录音保存成功！');
        } catch(err) { showToast('保存失败：' + err.message); }
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      isRecording = true;
      btn.classList.add('recording');
      btn.textContent = '⏹️';
      status.textContent = '录音中... 点击停止';
    } catch(err) { showToast('无法访问麦克风：' + err.message); }
  } else {
    mediaRecorder.stop();
    isRecording = false;
    btn.classList.remove('recording');
    btn.textContent = '🎙️';
    status.textContent = '点击开始录音';
  }
}

async function saveEvent() {
  const title = document.getElementById('eventTitle').value.trim();
  const time = document.getElementById('eventTime').value;
  const desc = document.getElementById('eventDesc').value.trim();
  const recurring = document.getElementById('eventRecurring').value;

  if (!title) return showToast('请填写事件标题');
  if (!selectedDate) return;

  const today = getTodayStr();
  if (selectedDate < today) return showToast('不能修改过去日期');

  try {
    const res = await fetch(`${API_BASE}/api/events`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        family_id: currentFamily.id,
        date: selectedDate,
        title,
        description: desc,
        event_time: time,
        media_type: currentMediaType,
        media_path: currentMediaPath,
        color: currentColor,
        recurring
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('事件添加成功！🎉');
    // 清除缓存，强制重新加载
    eventsCache = {};
    showDay(selectedDate);
    // 同时刷新日历视图的数据
    renderCalendar();
  } catch(e) { showToast(e.message); }
}

async function toggleEventStatus(id, status) {
  try {
    const res = await fetch(`${API_BASE}/api/events/${id}`, {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // 更新本地缓存
    Object.values(eventsCache).forEach(list => {
      const ev = list.find(e => e.id === id);
      if (ev) ev.status = status;
    });

    showToast(status === 'completed' ? '太棒了！完成一项✨' : '已恢复为待办');
    if (selectedDate) showDay(selectedDate);
    else renderCalendar();
  } catch(e) { showToast(e.message); }
}

async function deleteEvent(id, deleteAll) {
  const msg = deleteAll === true ? '确定要删除整个重复事件系列吗？' : 
              deleteAll === false ? '只删除这一天的事件？' : 
              '确定要删除这个事件吗？';
  if (!confirm(msg)) return;
  try {
    const url = deleteAll === true ? `${API_BASE}/api/events/${id}?all=true` : `${API_BASE}/api/events/${id}`;
    const res = await fetch(url, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // 更新本地缓存
    eventsCache = {};

    showToast('事件已删除');
    if (selectedDate) showDay(selectedDate);
    else renderCalendar();
  } catch(e) { showToast(e.message); }
}

// ===== 动漫角色提醒系统 =====
function startReminderChecker() {
  if (reminderInterval) clearInterval(reminderInterval);
  checkReminders(); // 立即检查一次
  reminderInterval = setInterval(checkReminders, 30000); // 每30秒检查
}

function stopReminderChecker() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}

async function checkReminders() {
  if (!currentFamily) return;

  const today = getTodayStr();
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  try {
    const res = await fetch(`${API_BASE}/api/events/day/${currentFamily.id}/${today}`);
    const events = await res.json();

    events.forEach(event => {
      // 只提醒活跃的、有时间的、未完成的事件
      if (event.status !== 'active') return;
      if (!event.event_time || event.event_time === '00:00') return;

      const eventTime = event.event_time.slice(0, 5); // HH:MM
      const eventId = event.id;

      // 计算时间差（分钟）
      const [h1, m1] = currentTime.split(':').map(Number);
      const [h2, m2] = eventTime.split(':').map(Number);
      const diffMin = (h1 * 60 + m1) - (h2 * 60 + m2);

      // 在事件时间的前后1分钟内触发提醒
      if (diffMin >= -1 && diffMin <= 1) {
        // 检查是否已经提醒过（防止重复）
        const reminderKey = `${today}_${eventTime}_${event.title}`;
        if (!remindedEvents[reminderKey]) {
          remindedEvents[reminderKey] = true;
          showAnimeReminder(event);
        }
      }
    });

    // 清理过期的提醒记录（每天重置）
    if (!remindedEvents._date || remindedEvents._date !== today) {
      remindedEvents = { _date: today };
    }
  } catch (e) {
    console.error('检查提醒失败:', e);
  }
}

function showAnimeReminder(event) {
  const reminder = document.getElementById('animeReminder');
  const titleEl = document.getElementById('animeEventTitle');
  const timeEl = document.getElementById('animeEventTime');

  if (!reminder) return;

  // 设置事件信息
  titleEl.textContent = event.title;
  const timeStr = event.event_time ? event.event_time.slice(0, 5) : '';
  timeEl.textContent = '🕐 ' + timeStr;

  // 移除旧状态
  reminder.classList.remove('hiding');

  // 显示动漫角色
  setTimeout(() => {
    reminder.classList.add('show');
    // 播放可爱音效（可选）
    playReminderSound();
  }, 100);

  // 15秒后自动隐藏
  clearTimeout(reminder._autoHide);
  reminder._autoHide = setTimeout(() => {
    dismissAnimeReminder();
  }, 15000);

  // 尝试发送浏览器通知（当页面不在前台时）
  if (document.hidden && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification('⏰ 萌家日历提醒', {
        body: `${event.title}\n时间：${timeStr}`,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🐰</text></svg>',
        tag: `reminder-${event.id}`,
        requireInteraction: false
      });
    }
  }
}

function dismissAnimeReminder() {
  const reminder = document.getElementById('animeReminder');
  if (!reminder) return;

  clearTimeout(reminder._autoHide);
  reminder.classList.add('hiding');
  reminder.classList.remove('show');

  // 等动画结束后重置
  setTimeout(() => {
    reminder.classList.remove('hiding');
  }, 700);
}

function playReminderSound() {
  // 使用 Web Audio API 播放简单的可爱提示音
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 - 可爱的三连音
    const duration = 0.12;
    const gap = 0.08;

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * (duration + gap));
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * (duration + gap) + duration);
      osc.start(ctx.currentTime + i * (duration + gap));
      osc.stop(ctx.currentTime + i * (duration + gap) + duration);
    });
  } catch(e) { /* 忽略音频错误 */ }
}

// 请求浏览器通知权限
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// ===== 工具 =====
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
