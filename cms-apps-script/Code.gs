/**
 * 五股濕地生態園區｜網站後台 API（Google Apps Script）
 * 綁定於試算表「後台測試｜五股濕地生態園區官方網站」
 *
 * 指令碼屬性（專案設定 → 指令碼屬性）：
 *   ADMIN_EMAILS      允許登入的 Google 帳號，以逗號分隔（Google 登入用）
 *   GOOGLE_CLIENT_ID  OAuth 用戶端 ID（Google 登入用）
 *   PASSWORD_HASH / PASSWORD_SALT / PASSWORD_ITER  由 setAdminPassword() 自動產生（密碼登入用）
 */

var CONFIG = {
  SHEET_NAME: '網站後台',
  FIRST_DATA_ROW: 5,          // 第 3、4 列為中英文標題
  LOG_SHEET_NAME: '修改紀錄',  // 留空字串則不記錄
  PAGES: ['index', 'about', 'environment', 'species'],
  CACHE_KEY: 'cms-content-v1',
  SESSION_SECONDS: 6 * 60 * 60,
  MAX_FAILS: 5,
  LOCK_SECONDS: 15 * 60,
  TIMEZONE: 'Asia/Taipei'
};

// ---------- 入口 ----------
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'content';
  if (action === 'content') return json_(getContent_());
  return json_({ ok: false, error: '未知的操作' });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: '格式錯誤' }); }
  try {
    switch (body.action) {
      case 'login':   return json_(login_(body));
      case 'verify':  return json_(withSession_(body, function (s) { return { ok: true, email: s.email }; }));
      case 'save':    return json_(withSession_(body, function (s) { return save_(body, s); }));
      case 'logout':  CacheService.getScriptCache().remove('sess:' + body.token); return json_({ ok: true });
    }
    return json_({ ok: false, error: '未知的操作' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- 讀取內容（含快取，儲存時清除） ----------
function getContent_() {
  var cache = CacheService.getScriptCache();
  var meta = cache.get(CONFIG.CACHE_KEY + ':n');
  if (meta) {
    var keys = [];
    for (var i = 0; i < Number(meta); i++) keys.push(CONFIG.CACHE_KEY + ':' + i);
    var parts = cache.getAll(keys);
    if (Object.keys(parts).length === keys.length) {
      return JSON.parse(keys.map(function (k) { return parts[k]; }).join(''));
    }
  }
  var data = buildContent_();
  var text = JSON.stringify(data);
  var size = 90000, chunks = {};
  var n = Math.ceil(text.length / size) || 1;
  for (var j = 0; j < n; j++) chunks[CONFIG.CACHE_KEY + ':' + j] = text.substr(j * size, size);
  chunks[CONFIG.CACHE_KEY + ':n'] = String(n);
  cache.putAll(chunks, 21600);
  return data;
}

function buildContent_() {
  var pages = {};
  CONFIG.PAGES.forEach(function (p) { pages[p] = {}; });
  var updated = '';
  readRows_().forEach(function (r) {
    if (!pages[r.page] || !r.key) return;
    pages[r.page][r.key] = r.content;
    if (r.date > updated) updated = r.date;
  });
  return { ok: true, updated: updated, pages: pages };
}

function sheet_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) throw new Error('找不到工作表：' + CONFIG.SHEET_NAME);
  return sh;
}

function readRows_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < CONFIG.FIRST_DATA_ROW) return [];
  var values = sh.getRange(CONFIG.FIRST_DATA_ROW, 1, last - CONFIG.FIRST_DATA_ROW + 1, 5).getDisplayValues();
  return values.map(function (v, i) {
    return { row: CONFIG.FIRST_DATA_ROW + i, id: v[0], page: v[1], key: v[2], content: v[3], date: v[4] };
  }).filter(function (r) { return r.id; });
}

// ---------- 儲存 ----------
function save_(body, session) {
  var page = body.page;
  var changes = body.changes;
  if (CONFIG.PAGES.indexOf(page) < 0) throw new Error('頁面不正確');
  if (!Array.isArray(changes) || !changes.length) throw new Error('沒有需要儲存的變更');
  if (changes.length > 500) throw new Error('單次變更過多');
  changes.forEach(function (c) {
    if (typeof c.key !== 'string' || !/^[\w\-\/@]{1,200}$/.test(c.key)) throw new Error('欄位名稱不正確：' + c.key);
    if (typeof c.content !== 'string' || c.content.length > 20000) throw new Error('欄位內容過長：' + c.key);
  });

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = sheet_();
    var now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    var rows = readRows_();
    var byId = {};
    rows.forEach(function (r) { byId[r.id] = r; });

    var start = CONFIG.FIRST_DATA_ROW;
    var end = Math.max(sh.getLastRow(), start - 1);
    var block = end >= start ? sh.getRange(start, 1, end - start + 1, 5).getDisplayValues() : [];
    var appended = [];

    changes.forEach(function (c) {
      var id = page + ':' + c.key;
      var line = [id, page, c.key, c.content, now];
      if (byId[id]) block[byId[id].row - start] = line;
      else appended.push(line);
    });

    var all = block.concat(appended);
    if (all.length) {
      var range = sh.getRange(start, 1, all.length, 5);
      range.setNumberFormat('@'); // 以純文字儲存，避免被當成公式或日期
      range.setValues(all);
    }
    log_(session.email, page, changes, now);
    clearContentCache_();
  } finally {
    lock.releaseLock();
  }
  return getContent_();
}

function log_(email, page, changes, now) {
  if (!CONFIG.LOG_SHEET_NAME) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.LOG_SHEET_NAME);
    sh.appendRow(['時間', '帳號', '頁面', '欄位名稱', '新內容']);
  }
  var rows = changes.map(function (c) { return [now, email, page, c.key, c.content]; });
  var range = sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5);
  range.setNumberFormat('@');
  range.setValues(rows);
}

function clearContentCache_() {
  var cache = CacheService.getScriptCache();
  var keys = [CONFIG.CACHE_KEY + ':n'];
  for (var i = 0; i < 20; i++) keys.push(CONFIG.CACHE_KEY + ':' + i);
  cache.removeAll(keys);
}

// ---------- 登入 ----------
function login_(body) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('login-fails') || 0);
  if (fails >= CONFIG.MAX_FAILS) throw new Error('嘗試次數過多，請 15 分鐘後再試');

  var email = null;
  if (body.idToken) email = verifyGoogle_(body.idToken);
  else if (body.password) email = verifyPassword_(body.password) ? 'password-admin' : null;

  if (!email) {
    cache.put('login-fails', String(fails + 1), CONFIG.LOCK_SECONDS);
    Utilities.sleep(800);
    throw new Error('登入失敗：帳號未授權或密碼錯誤');
  }
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('sess:' + token, JSON.stringify({ email: email }), CONFIG.SESSION_SECONDS);
  return { ok: true, token: token, email: email };
}

function withSession_(body, fn) {
  var raw = body.token && CacheService.getScriptCache().get('sess:' + body.token);
  if (!raw) return { ok: false, error: '登入已逾時，請重新登入', auth: false };
  return fn(JSON.parse(raw));
}

function verifyGoogle_(idToken) {
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('GOOGLE_CLIENT_ID');
  var allowed = (props.getProperty('ADMIN_EMAILS') || '').toLowerCase().split(',').map(function (s) { return s.trim(); });
  if (!clientId) return null;
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  var info = JSON.parse(res.getContentText());
  var email = String(info.email || '').toLowerCase();
  var validIssuer = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  if (info.aud !== clientId || !validIssuer || String(info.email_verified) !== 'true') return null;
  if (Number(info.exp) * 1000 < Date.now()) return null;
  return allowed.indexOf(email) >= 0 ? email : null;
}

// ---------- 密碼（PBKDF2-HMAC-SHA256） ----------
function pbkdf2_(password, saltBytes, iterations) {
  var pw = Utilities.newBlob(password).getBytes();
  var block = saltBytes.concat([0, 0, 0, 1]);
  var u = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, block, pw);
  var t = u.slice();
  for (var i = 1; i < iterations; i++) {
    u = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, u, pw);
    for (var j = 0; j < t.length; j++) t[j] ^= u[j];
  }
  return Utilities.base64Encode(t);
}

function verifyPassword_(password) {
  var props = PropertiesService.getScriptProperties();
  var hash = props.getProperty('PASSWORD_HASH');
  var salt = props.getProperty('PASSWORD_SALT');
  if (!hash || !salt) return false;
  var test = pbkdf2_(String(password), Utilities.base64Decode(salt), Number(props.getProperty('PASSWORD_ITER') || 3000));
  var diff = test.length ^ hash.length;
  for (var i = 0; i < Math.min(test.length, hash.length); i++) diff |= test.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

/**
 * 設定密碼：先在「指令碼屬性」新增 NEW_PASSWORD = 你的密碼，
 * 再於編輯器中執行此函式。執行後 NEW_PASSWORD 會自動刪除，只留下雜湊值。
 */
function setAdminPassword() {
  var props = PropertiesService.getScriptProperties();
  var pw = props.getProperty('NEW_PASSWORD');
  if (!pw || pw.length < 10) throw new Error('請先設定 NEW_PASSWORD（至少 10 個字元）');
  var salt = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now());
  var iter = 3000;
  props.setProperties({
    PASSWORD_HASH: pbkdf2_(pw, salt, iter),
    PASSWORD_SALT: Utilities.base64Encode(salt),
    PASSWORD_ITER: String(iter)
  });
  props.deleteProperty('NEW_PASSWORD');
  Logger.log('密碼已設定完成');
}
