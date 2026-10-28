/**
 * 五股濕地生態園區｜最新消息同步（Google Apps Script）
 * 從荒野保護協會「活動報名」頁抓取五股相關活動，寫入「最新消息」工作表。
 * 前台首頁透過該工作表「發布到網路」的 CSV 讀取，欄位名稱請勿更改。
 *
 * 使用方式：
 *   1. 將此檔加入「前台 CSV 所屬試算表」的 Apps Script 專案（可與 Code.gs 同專案）
 *   2. 執行 syncSowEvents() 一次並完成授權，確認工作表有資料
 *   3. 執行 installNewsTrigger() 建立每小時自動同步
 */

var NEWS_CONFIG = {
  SPREADSHEET_ID: '',            // 留空 = 此指令碼綁定的試算表；若前台 CSV 來自其他試算表，請填入其 ID
  SHEET_NAME: '最新消息',
  BASE: 'https://www.sow.org.tw',
  LIST_PATH: '/events',
  QUERY: {                        // 新版活動頁的篩選參數（2026/10 改版後）
    title: '五股',
    custom_37: 'All',             // 分會
    event_type: 'All',
    is_monetary: 'All',
    signup_status: 'All'
  },
  MAX_PAGES: 5,
  HEADERS: ['活動ID', '類型', '日期', '活動名稱', '分會', '狀態', '收費', '會員限定', '連結', '更新時間'],
  TYPES: ['講座', '志工培訓/召募', '課程研習', '倡議活動', '自然體驗', '棲地工作', '工作假期', '環境行動', '其他'],
  TIMEZONE: 'Asia/Taipei'
};

// ---------- 主程式 ----------
function syncSowEvents() {
  var events = fetchSowEvents_();
  var now = Utilities.formatDate(new Date(), NEWS_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  var today = Utilities.formatDate(new Date(), NEWS_CONFIG.TIMEZONE, 'yyyy-MM-dd');

  // 尚未結束的活動依日期由近到遠，已結束的排在後面（由新到舊）
  var upcoming = events.filter(function (e) { return (e.end || e.start) >= today; })
    .sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
  var past = events.filter(function (e) { return (e.end || e.start) < today; })
    .sort(function (a, b) { return a.start < b.start ? 1 : a.start > b.start ? -1 : 0; });

  var rows = upcoming.concat(past).map(function (e) {
    return [e.id, e.type, e.date, e.title, e.branch, e.status, e.fee, e.memberOnly, e.link, now];
  });
  var changed = writeNewsSheet_(rows);
  Logger.log((changed ? '同步完成' : '內容無變動，未寫入') + '：共 ' + rows.length + ' 筆活動（尚未結束 ' + upcoming.length + ' 筆）');
  return rows.length;
}

/** 建立每小時自動同步（重複執行不會產生多個觸發條件） */
function installNewsTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncSowEvents') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncSowEvents').timeBased().everyHours(1).create();
  Logger.log('已建立每小時同步');
}

// ---------- 抓取與解析 ----------
function fetchSowEvents_() {
  var all = [], seen = {};
  for (var page = 0; page < NEWS_CONFIG.MAX_PAGES; page++) {
    var html = fetchHtml_(listUrl_(page));
    var list = parseEventList_(html);
    var added = 0;
    list.forEach(function (e) {
      if (seen[e.id]) return;
      seen[e.id] = true;
      all.push(e);
      added++;
    });
    if (page === 0 && !list.length && !/(查無|沒有|找不到|no results)/i.test(stripTags_(html))) {
      // 頁面有內容卻解析不到活動：多半是網站版型又改了，保留舊資料並回報錯誤
      throw new Error('活動頁解析失敗，可能是荒野官網版型變更：' + listUrl_(0));
    }
    if (!added || !hasNextPage_(html, page)) break;
  }
  all.forEach(function (e) { if (!e.fee) e.fee = detectFee_(e.link); });
  return all;
}

function listUrl_(page) {
  var q = NEWS_CONFIG.QUERY, parts = [];
  for (var k in q) parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(q[k]));
  if (page) parts.push('page=' + page);
  return NEWS_CONFIG.BASE + NEWS_CONFIG.LIST_PATH + '?' + parts.join('&');
}

function fetchHtml_(url) {
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (WuguWetland site sync)', 'Accept-Language': 'zh-TW,zh;q=0.9' }
  });
  var code = res.getResponseCode();
  if (code !== 200) throw new Error('無法讀取 ' + url + '（HTTP ' + code + '）');
  return res.getContentText('UTF-8');
}

function hasNextPage_(html, page) {
  return new RegExp('[?&;]page=' + (page + 1) + '\\b').test(html);
}

/**
 * 不依賴 CSS class：以活動連結（/civicrm/event/info?...id=）切分每個活動區塊，
 * 再依文字內容辨識類型、日期、分會與狀態，網站小幅改版也能繼續運作。
 */
function parseEventList_(html) {
  var main = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '');
  var re = /<a\b[^>]*href="([^"]*civicrm\/event\/info[^"]*?[?&;]id=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  var hits = [], m;
  while ((m = re.exec(main))) hits.push({ id: m[2], text: cleanText_(m[3]), start: m.index, end: re.lastIndex });

  // 合併同一活動的多個連結（圖片＋標題）
  var blocks = [];
  hits.forEach(function (h) {
    var b = blocks[blocks.length - 1];
    if (b && b.id === h.id) { if (!b.title && h.text) b.title = h.text; b.end = h.end; }
    else blocks.push({ id: h.id, title: h.text, start: h.start, end: h.end });
  });

  return blocks.map(function (b, i) {
    var stop = i + 1 < blocks.length ? blocks[i + 1].start : Math.min(main.length, b.end + 3000);
    var lines = toLines_(main.slice(b.end, stop));
    return buildEvent_(b.id, b.title, lines);
  }).filter(function (e) { return e.title; });
}

function buildEvent_(id, title, lines) {
  var e = { id: id, title: title, type: '', date: '', start: '', end: '', branch: '', status: '', fee: '', memberOnly: '',
            link: NEWS_CONFIG.BASE + '/civicrm/event/info?reset=1&id=' + id };
  var STATUS = /^(招募中|報名中|開放報名中|尚未開放報名|即將開放報名|報名截止|已截止|額滿|已額滿|候補中|活動結束|已結束|取消|已取消)$/;
  lines.forEach(function (line) {
    var d = line.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[^\d]{1,5}(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2}))?/);
    if (d && !e.start) {
      e.start = ymd_(d[1], d[2], d[3]);
      e.end = d[4] ? ymd_(d[4], d[5], d[6]) : e.start;
      e.date = e.end && e.end !== e.start ? e.start + ' ~ ' + e.end : e.start;
    } else if (!e.type && NEWS_CONFIG.TYPES.indexOf(line) >= 0) e.type = line;
    else if (!e.branch && /^.{1,8}(分會|總會|籌備處)$/.test(line)) e.branch = line;
    else if (!e.status && STATUS.test(line)) e.status = line;
    else if (!e.fee && /^(免費|付費)$/.test(line)) e.fee = line;
    else if (/會員限定|限會員/.test(line)) e.memberOnly = '是';
  });
  if (!e.memberOnly) e.memberOnly = '否';
  return e;
}

// 列表頁未標示費用時，從活動內頁的「活動費用」判斷
function detectFee_(url) {
  try {
    var text = stripTags_(fetchHtml_(url));
    var m = text.match(/活動費用[】:：\s]*([^\n。]{0,40})/);
    if (!m) return '';
    return /免費|不收費|0\s*元/.test(m[1]) ? '免費' : '付費';
  } catch (err) {
    return '';
  }
}

// ---------- 工具 ----------
function ymd_(y, m, d) { return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2); }

function decode_(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); });
}
function stripTags_(html) {
  return decode_(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(p|div|li|h\d|span|a|td|tr)>/gi, '\n').replace(/<[^>]+>/g, ''));
}
function cleanText_(html) { return decode_(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(); }
function toLines_(html) {
  return stripTags_(html).split('\n').map(function (s) { return s.replace(/\s+/g, ' ').trim(); }).filter(String);
}

function writeNewsSheet_(rows) {
  var ss = NEWS_CONFIG.SPREADSHEET_ID ? SpreadsheetApp.openById(NEWS_CONFIG.SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(NEWS_CONFIG.SHEET_NAME) || ss.insertSheet(NEWS_CONFIG.SHEET_NAME);
  var width = NEWS_CONFIG.HEADERS.length;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var last = sh.getLastRow();
    var old = last > 1 ? sh.getRange(2, 1, last - 1, width).getDisplayValues() : [];
    // 內容（不含更新時間）沒有變動就不寫入，避免發布的 CSV 頻繁變動
    var sig = function (list) { return JSON.stringify(list.map(function (r) { return r.slice(0, width - 1); })); };
    if (sig(old) === sig(rows)) return false;

    sh.getRange(1, 1, 1, width).setValues([NEWS_CONFIG.HEADERS]);
    // 先覆寫新資料、再清除多餘的舊列；不可先清空，否則發布的 CSV 可能抓到空白狀態
    if (rows.length) {
      var range = sh.getRange(2, 1, rows.length, width);
      range.setNumberFormat('@'); // 以純文字儲存，避免日期被自動轉換格式
      range.setValues(rows);
    }
    if (old.length > rows.length) sh.getRange(rows.length + 2, 1, old.length - rows.length, width).clearContent();
    SpreadsheetApp.flush();
    return true;
  } finally {
    lock.releaseLock();
  }
}
