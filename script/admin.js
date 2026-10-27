// ============================================================
// ADMIN.JS — 網站後台主程式（登入、工具列、草稿、儲存）
// ============================================================

(function () {
  'use strict';

  var CMS = window.WuguCMS;
  var PAGE_LABELS = { index: '首頁', about: '關於五股濕地', environment: '生態環境', species: '物種介紹' };
  var TOKEN_KEY = 'wuguCMS:token';
  var DRAFT_PREFIX = 'wuguCMS:draft:';
  var $ = function (id) { return document.getElementById(id); };

  var S = {
    token: sessionStorage.getItem(TOKEN_KEY),
    content: null,     // 資料庫中已發布的內容
    page: null,
    fields: [],
    byKey: {},
    draft: {},         // 尚未儲存的變更 { key: value }
    history: [], hpos: 0,
    saving: false
  };

  // ---------- 共用工具 ----------
  function api(action, payload) {
    payload = payload || {};
    payload.action = action;
    if (S.token) payload.token = S.token;
    return fetch(CMS.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 避免 CORS 預檢
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }

  var toastTimer;
  function toast(msg, isError) {
    var t = $('adm-toast');
    t.innerHTML = '<i class="fa-solid ' + (isError ? 'fa-circle-exclamation' : 'fa-circle-check') + '" aria-hidden="true"></i>';
    t.appendChild(document.createTextNode(msg));
    t.classList.toggle('is-error', !!isError);
    t.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-show'); }, isError ? 5000 : 2600);
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // 依實體按鍵判斷快捷鍵（使用注音等輸入法時 e.key 可能不是英文字母）
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var MOD = IS_MAC ? '⌘' : 'Ctrl+';
  function shortcutOf(e) {
    if (!(IS_MAC ? e.metaKey : e.ctrlKey) || e.altKey || e.isComposing) return null;
    var code = e.code || ('Key' + String(e.key || '').toUpperCase());
    if (code === 'KeyZ') return e.shiftKey ? 'redo' : 'undo';
    if (code === 'KeyY' && !e.shiftKey) return 'redo';
    if (code === 'KeyS' && !e.shiftKey) return 'save';
    return null;
  }

  // 對話框：buttons = [{ label, value, primary, danger, left, icon }]，回傳按下的 value（Esc 為空字串）
  function dialog(title, bodyHTML, buttons, onOpen, icon) {
    var d = $('adm-dialog');
    $('adm-dialog-title').innerHTML = (icon ? '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>' : '') + esc(title);
    $('adm-dialog-body').innerHTML = bodyHTML;
    $('adm-dialog-actions').innerHTML = buttons.map(function (b) {
      var cls = 'adm-btn' + (b.primary ? ' adm-btn--primary' : '') + (b.danger ? ' adm-btn--danger' : '') + (b.left ? ' adm-btn--left' : '');
      return '<button type="submit" formnovalidate class="' + cls + '" value="' + esc(b.value) + '">' +
        (b.icon ? '<i class="fa-solid ' + b.icon + '" aria-hidden="true"></i>' : '') + esc(b.label) + '</button>';
    }).join('');
    d.returnValue = '';
    d.showModal();
    if (onOpen) onOpen($('adm-dialog-body'));
    return new Promise(function (resolve) {
      d.addEventListener('close', function () { resolve(d.returnValue); }, { once: true });
    });
  }
  window.WuguAdminUI = { dialog: dialog, toast: toast, esc: esc, shortcutOf: shortcutOf };

  // 按鈕提示加上快捷鍵
  Array.prototype.forEach.call(document.querySelectorAll('[data-shortcut]'), function (b) {
    b.title = b.textContent.trim() + '（' + MOD + b.getAttribute('data-shortcut').replace('⇧', IS_MAC ? '⇧' : 'Shift+') + '）';
  });

  // ---------- 登入 ----------
  function showLogin(message) {
    $('adm-login').hidden = false;
    $('adm-login-error').textContent = message || '';
    if (CMS.GOOGLE_CLIENT_ID) {
      if (location.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
        return googleError('目前網址為 ' + location.protocol + '//，Google 登入需要 https://。請改用 https:// 開啟此頁，或至 GitHub Pages 設定勾選 Enforce HTTPS。');
      }
      if (window.google && google.accounts) return renderGoogle();
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = renderGoogle;
      s.onerror = function () { googleError('無法載入 Google 登入元件，請確認網路連線，或關閉會阻擋 accounts.google.com 的擴充功能。'); };
      document.head.appendChild(s);
    } else {
      $('adm-password-form').hidden = false;
      $('adm-password').focus();
    }
  }

  function renderGoogle() {
    google.accounts.id.initialize({
      client_id: CMS.GOOGLE_CLIENT_ID,
      callback: function (res) { doLogin({ idToken: res.credential }); }
    });
    google.accounts.id.renderButton($('adm-google-btn'), { theme: 'outline', size: 'large', text: 'signin_with', locale: 'zh-TW' });
    // 來源未授權時 Google 不會回報錯誤，按鈕只會是一片空白；逾時仍未出現就提示原因
    setTimeout(function () {
      var frame = $('adm-google-btn').querySelector('iframe');
      if (!frame || frame.getBoundingClientRect().height < 10) {
        googleError('Google 登入按鈕未能顯示。請到 Google Cloud Console 的 OAuth 用戶端，' +
          '在「已授權的 JavaScript 來源」加入「' + location.origin + '」（設定後可能需等待數分鐘生效）。');
      }
    }, 4000);
  }

  function googleError(msg) {
    $('adm-login-error').textContent = msg;
  }

  $('adm-password-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = $('adm-password');
    doLogin({ password: pw.value });
    pw.value = '';
  });

  function doLogin(cred) {
    $('adm-login-error').textContent = '登入中…';
    S.token = null;
    api('login', cred).then(function (res) {
      if (!res.ok) throw new Error(res.error);
      S.token = res.token;
      sessionStorage.setItem(TOKEN_KEY, res.token);
      $('adm-login').hidden = true;
      if (!S.page) start(); else toast('已重新登入，可以繼續儲存');
    }).catch(function (err) {
      $('adm-login-error').textContent = err.message || '登入失敗';
    });
  }

  $('adm-logout').addEventListener('click', function () {
    api('logout').catch(function () {});
    sessionStorage.removeItem(TOKEN_KEY);
    location.reload(); // 草稿仍保留在瀏覽器中
  });

  // ---------- 啟動 ----------
  function init() {
    if (!S.token) return showLogin();
    api('verify').then(function (res) {
      if (res.ok) start();
      else { sessionStorage.removeItem(TOKEN_KEY); S.token = null; showLogin(res.error); }
    }).catch(function () { showLogin('無法連線至後台伺服器，請確認網路或 API 網址設定'); });
  }

  function start() {
    $('adm-stage').hidden = false;
    $('adm-toolbar').hidden = false;
    var sel = $('adm-page');
    sel.innerHTML = Object.keys(CMS.PAGE_FILES).map(function (p) {
      return '<option value="' + p + '">' + PAGE_LABELS[p] + '</option>';
    }).join('');

    CMS.fetchContent().then(function (data) {
      S.content = data;
      // 若有尚未儲存的草稿，優先開啟該頁
      var withDraft = Object.keys(CMS.PAGE_FILES).filter(function (p) { return Object.keys(loadDraft(p)).length; })[0];
      loadPage(withDraft || sessionStorage.getItem('wuguCMS:page') || 'index', !!withDraft);
    }).catch(function (err) { toast('讀取資料庫失敗：' + err.message, true); });
  }

  // ---------- 載入頁面（只呈現樣貌，網址維持 /management） ----------
  function loadPage(page, restoredDraft) {
    S.page = page;
    S.fields = []; S.byKey = {};
    S.history = []; S.hpos = 0;
    S.draft = loadDraft(page);
    S.restoredDraft = restoredDraft && Object.keys(S.draft).length > 0;
    sessionStorage.setItem('wuguCMS:page', page);
    $('adm-page').value = page;
    $('adm-loading').classList.remove('is-hidden');
    updateStatus();

    fetch(CMS.PAGE_FILES[page] + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        // 移除 Google Analytics，避免後台操作被計入流量
        Array.prototype.forEach.call(doc.querySelectorAll('script'), function (s) {
          if ((s.src || '').indexOf('googletagmanager') >= 0 || /gtag\(/.test(s.textContent)) s.remove();
        });
        var base = doc.createElement('base');
        base.href = new URL('./', location.href).href;
        doc.head.insertBefore(base, doc.head.firstChild);
        doc.documentElement.setAttribute('data-cms-page', page);
        $('adm-frame').srcdoc = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
      })
      .catch(function (err) { toast('頁面載入失敗：' + err.message, true); });
  }

  // 由 iframe 內的 cms.js 呼叫（頁面腳本執行前）
  window.WuguCMSAdmin = {
    onFrameReady: function (win) {
      S.win = win;
      S.fields = win.WuguCMS.fields;
      S.byKey = {};
      S.fields.forEach(function (f) { S.byKey[f.key] = f; });
      window.WuguAdminFrame.setup(win, S.fields, frameHooks);
      // 先套用資料庫內容，再套用草稿
      S.fields.forEach(function (f) { win.WuguCMS.write(f, current(f.key)); });
      refreshMarks();
      setTimeout(function () { $('adm-loading').classList.add('is-hidden'); }, 150);
      if (S.restoredDraft) toast('已還原上次未儲存的草稿（' + Object.keys(S.draft).length + ' 項）');
      else if (!sessionStorage.getItem('wuguCMS:tip')) {
        sessionStorage.setItem('wuguCMS:tip', '1');
        toast('滑鼠移到文字上即可點擊編輯；灰色斜紋區塊不開放編輯');
      }
    }
  };

  // ---------- 值的計算 ----------
  function published(key) {
    var p = S.content && S.content.pages && S.content.pages[S.page];
    return p && Object.prototype.hasOwnProperty.call(p, key) ? p[key] : null;
  }
  function baseline(key) {
    var v = published(key);
    var f = S.byKey[key];
    if (v == null && f && f.type === 'slides') v = CMS.legacySlides(f, S.content && S.content.pages && S.content.pages[S.page]);
    if (v == null) v = f ? f.defaultValue : '';
    return f && f.type === 'text' ? CMS.sanitize(v) : v;
  }
  function current(key) {
    return Object.prototype.hasOwnProperty.call(S.draft, key) ? S.draft[key] : baseline(key);
  }

  // ---------- 草稿（即時存於瀏覽器） ----------
  function loadDraft(page) {
    try { return (JSON.parse(localStorage.getItem(DRAFT_PREFIX + page) || 'null') || {}).values || {}; } catch (e) { return {}; }
  }
  function persistDraft() {
    var keys = Object.keys(S.draft);
    if (keys.length) localStorage.setItem(DRAFT_PREFIX + S.page, JSON.stringify({ values: S.draft, at: Date.now() }));
    else localStorage.removeItem(DRAFT_PREFIX + S.page);
  }

  // 設定欄位值；writeDom=false 代表畫面已是最新（例如使用者正在輸入）
  function setValue(key, value, writeDom) {
    if (value === baseline(key)) delete S.draft[key];
    else S.draft[key] = value;
    if (writeDom && S.byKey[key] && S.win) S.win.WuguCMS.write(S.byKey[key], value);
    window.WuguAdminFrame.syncLast(key, value);
    persistDraft();
    refreshMarks();
  }

  function pushHistory(changes) {
    changes = changes.filter(function (c) { return c.before !== c.after; });
    if (!changes.length) return;
    S.history = S.history.slice(0, S.hpos);
    S.history.push(changes);
    if (S.history.length > 200) S.history.shift();
    S.hpos = S.history.length;
    updateStatus();
  }

  function undo() {
    if (S.hpos <= 0) return;
    window.WuguAdminFrame.flush();
    var entry = S.history[--S.hpos];
    entry.forEach(function (c) { setValue(c.key, c.before, true); });
    updateStatus();
  }
  function redo() {
    if (S.hpos >= S.history.length) return;
    var entry = S.history[S.hpos++];
    entry.forEach(function (c) { setValue(c.key, c.after, true); });
    updateStatus();
  }

  var frameHooks = {
    commit: function (key, before, after) { pushHistory([{ key: key, before: before, after: after }]); setValue(key, after, false); },
    apply: function (changes) {
      pushHistory(changes);
      changes.forEach(function (c) { setValue(c.key, c.after, true); });
    },
    current: current,
    baseline: baseline,
    showAll: function () { return S.showAll; },
    shortcut: function (name) { if (name === 'undo') undo(); if (name === 'redo') redo(); if (name === 'save') save(); }
  };

  function refreshMarks() {
    S.fields.forEach(function (f) {
      var changed = Object.prototype.hasOwnProperty.call(S.draft, f.key);
      if (f.type === 'attr' && f.attr !== 'alt') {
        var any = ['@title', '@desc', '@image'].some(function (s) {
          return Object.prototype.hasOwnProperty.call(S.draft, f.key.replace(/@\w+$/, s));
        });
        f.el.toggleAttribute('data-cms-changed', any);
      } else if (f.type !== 'attr') {
        var altChanged = f.type === 'img' && Object.prototype.hasOwnProperty.call(S.draft, f.key + '@alt');
        f.el.toggleAttribute('data-cms-changed', changed || altChanged);
      }
    });
    updateStatus();
  }

  function updateStatus() {
    var n = Object.keys(S.draft).length;
    var st = $('adm-status');
    var icon = S.saving ? 'fa-spinner fa-spin' : n ? 'fa-pen-to-square' : 'fa-cloud';
    var text = S.saving ? '儲存中…' : n ? n + ' 項未儲存的變更・草稿已自動保存於此瀏覽器' : '所有內容皆已同步至資料庫';
    st.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>' + esc(text);
    st.classList.toggle('is-dirty', n > 0 && !S.saving);
    st.classList.toggle('is-saving', S.saving);
    $('adm-undo').disabled = S.hpos <= 0;
    $('adm-redo').disabled = S.hpos >= S.history.length;
    $('adm-save').disabled = !n || S.saving;
    $('adm-cancel').disabled = !n || S.saving;
  }

  // ---------- 儲存 / 取消 ----------
  function save() {
    window.WuguAdminFrame.flush();
    var keys = Object.keys(S.draft);
    if (!keys.length || S.saving) return Promise.resolve(true);
    S.saving = true; updateStatus();
    var changes = keys.map(function (k) { return { key: k, content: String(S.draft[k]) }; });
    return api('save', { page: S.page, changes: changes }).then(function (res) {
      S.saving = false;
      if (res.auth === false) { showLogin(res.error); updateStatus(); return false; }
      if (!res.ok) throw new Error(res.error);
      S.content = res;
      try { localStorage.setItem('wuguCMS:content', JSON.stringify(res)); } catch (e) {}
      // 只清除剛儲存、且儲存期間未再被修改的欄位
      changes.forEach(function (c) { if (S.draft[c.key] === c.content) delete S.draft[c.key]; });
      persistDraft();
      refreshMarks();
      toast('已儲存並同步至資料庫');
      return true;
    }).catch(function (err) {
      S.saving = false; updateStatus();
      toast('儲存失敗：' + err.message + '（草稿仍保留在瀏覽器）', true);
      return false;
    });
  }

  function discard() {
    Object.keys(S.draft).forEach(function (k) {
      var f = S.byKey[k];
      delete S.draft[k];
      if (f) { S.win.WuguCMS.write(f, baseline(k)); window.WuguAdminFrame.syncLast(k, baseline(k)); }
    });
    S.history = []; S.hpos = 0;
    persistDraft();
    refreshMarks();
  }

  $('adm-save').addEventListener('click', save);
  $('adm-undo').addEventListener('click', undo);
  $('adm-redo').addEventListener('click', redo);

  // 顯示／隱藏所有可編輯範圍（記住偏好；按鈕可從 management.html 移除）
  S.showAll = localStorage.getItem('wuguCMS:showAll') === '1';
  function renderShowAll() {
    var b = $('adm-outline');
    if (b) {
      b.classList.toggle('is-active', S.showAll);
      b.setAttribute('aria-pressed', String(S.showAll));
      b.querySelector('i').className = 'fa-solid ' + (S.showAll ? 'fa-eye' : 'fa-eye-slash');
    }
    window.WuguAdminFrame.setShowAll(S.showAll);
  }
  if ($('adm-outline')) $('adm-outline').addEventListener('click', function () {
    S.showAll = !S.showAll;
    localStorage.setItem('wuguCMS:showAll', S.showAll ? '1' : '0');
    renderShowAll();
  });
  if (!$('adm-outline')) S.showAll = false;
  renderShowAll();
  $('adm-cancel').addEventListener('click', function () {
    dialog('取消所有變更？', '<p>此頁面 ' + Object.keys(S.draft).length + ' 項尚未儲存的變更將被捨棄，並恢復為資料庫中的內容。</p>', [
      { label: '返回編輯', value: '' },
      { label: '捨棄變更', value: 'discard', primary: true, icon: 'fa-trash-can' }
    ], null, 'fa-triangle-exclamation').then(function (v) { if (v === 'discard') { discard(); toast('已取消變更'); } });
  });

  // ---------- 頁面切換（一次只編輯一頁） ----------
  $('adm-page').addEventListener('change', function (e) {
    var target = e.target.value;
    e.target.value = S.page;
    if (target === S.page) return;
    window.WuguAdminFrame.flush();
    if (!Object.keys(S.draft).length) return loadPage(target);
    dialog('切換頁面前', '<p>「' + PAGE_LABELS[S.page] + '」還有 ' + Object.keys(S.draft).length + ' 項未儲存的變更。一次只能編輯一張頁面，請先處理這些變更。</p>', [
      { label: '留在此頁', value: '', left: true },
      { label: '捨棄並切換', value: 'discard', danger: true },
      { label: '儲存並切換', value: 'save', primary: true, icon: 'fa-floppy-disk' }
    ], null, 'fa-file-circle-exclamation').then(function (v) {
      if (v === 'discard') { discard(); loadPage(target); }
      if (v === 'save') save().then(function (ok) { if (ok) loadPage(target); });
    });
  });

  document.addEventListener('keydown', function (e) {
    if ($('adm-stage').hidden || $('adm-dialog').open) return; // 對話框內保留輸入框原生的復原
    var action = shortcutOf(e);
    if (!action) return;
    e.preventDefault();
    if (action === 'undo') undo();
    else if (action === 'redo') redo();
    else save();
  });

  window.addEventListener('beforeunload', function (e) {
    if (S.saving) { e.preventDefault(); e.returnValue = ''; }
  });

  init();
})();
