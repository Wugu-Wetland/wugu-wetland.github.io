// ============================================================
// ADMIN-FRAME.JS — 頁面預覽內的編輯功能
// 標示可編輯欄位、遮擋不可編輯區塊、停用原有按鈕與選單、圖片與地圖標記編輯
// ============================================================

(function () {
  'use strict';

  var CMS = window.WuguCMS;
  var win, doc, fields, hooks, chip;
  var last = {};          // 每個欄位最後一次記錄到歷史的值
  var timers = {};
  var ALLOWED_CONTROLS = '.hero__nav-btn, .hero__dot'; // 不會離開頁面的輪播控制，保留可用
  var LOCKED_AREAS = [
    { sel: '.navbar', label: '頁首與選單不開放編輯' },
    { sel: '.nav-drawer', label: '選單不開放編輯' },
    { sel: '.footer', label: '頁尾不開放編輯' },
    { sel: '#news-list', label: '最新消息由活動資料表自動產生' }
  ];
  var LOCKED_BUTTONS = '.btn, button, .back-to-top, [role="button"]';
  var FA_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';

  var G = '64,89,53';
  var FRAME_CSS = [
    // 可編輯文字
    '[data-cms-edit="text"]{outline:1.5px dashed rgba(' + G + ',.38);outline-offset:4px;border-radius:3px;cursor:text;min-height:1em;caret-color:#405935;' +
      'transition:outline-color .15s,background-color .15s,box-shadow .15s}',
    '[data-cms-edit="text"]:hover{outline:1.5px solid rgba(' + G + ',.75);background-color:rgba(122,158,110,.10)}',
    '[data-cms-edit="text"]:focus{outline:2px solid #405935;background-color:rgba(255,255,255,.9);box-shadow:0 0 0 8px rgba(' + G + ',.14)}',
    '[data-cms-edit="text"]:empty::before{content:"點擊輸入文字…";opacity:.4;font-style:italic}',
    '[data-cms-edit="text"]::selection,[data-cms-edit="text"] *::selection{background:rgba(122,158,110,.35)}',
    // 可更換圖片
    '[data-cms-edit="img"]{outline:2px dashed rgba(255,255,255,.85);outline-offset:-10px;cursor:pointer;transition:filter .2s,outline-color .2s}',
    '[data-cms-edit="img"]:hover{filter:brightness(.78);outline:2px solid #fff}',
    '[data-cms-marker]{outline:2px dashed #405935;outline-offset:4px;border-radius:50%;cursor:pointer;animation:cms-pulse 2.4s ease-in-out infinite}',
    '@keyframes cms-pulse{50%{outline-offset:7px;outline-color:rgba(' + G + ',.45)}}',
    // 已修改但尚未儲存
    '[data-cms-changed][data-cms-edit="text"]{outline:1.5px solid #d97706 !important;background-color:rgba(217,119,6,.07)}',
    '[data-cms-changed][data-cms-edit="text"]:focus{box-shadow:0 0 0 8px rgba(217,119,6,.15)}',
    '[data-cms-changed][data-cms-edit="img"],[data-cms-changed][data-cms-marker]{outline:3px solid #d97706 !important}',
    // 不可編輯區塊：灰階＋斜紋遮罩
    '[data-cms-locked]{filter:grayscale(.75);cursor:not-allowed !important;user-select:none}',
    '[data-cms-locked]::after{content:"";position:absolute;inset:0;z-index:50;cursor:not-allowed;' +
      'background:repeating-linear-gradient(135deg,rgba(110,116,108,.20) 0 9px,rgba(110,116,108,.08) 9px 18px)}',
    '[data-cms-locked-btn]{filter:grayscale(1);opacity:.45;cursor:not-allowed !important;transform:none !important;box-shadow:none !important}',
    '[data-cms-locked] *,[data-cms-locked-btn] *{cursor:not-allowed !important}',
    // 其他
    '.species-card:focus-within .card-inner{transform:rotateY(180deg)}',
    '.reveal{opacity:1 !important;transform:none !important}',
    '.cms-chip{position:fixed;z-index:99999;pointer-events:none;display:flex;align-items:center;gap:6px;background:#2e4027;color:#fff;' +
      'font:600 12.5px/1 "Noto Sans TC",system-ui,sans-serif;letter-spacing:.02em;padding:7px 11px;border-radius:999px;' +
      'box-shadow:0 6px 18px rgba(0,0,0,.22);opacity:0;transform:translateY(4px);transition:opacity .12s,transform .12s;white-space:nowrap}',
    '.cms-chip.is-show{opacity:1;transform:none}',
    '.cms-chip.is-locked{background:#5f655c}',
    '.cms-chip.is-changed{background:#b45309}'
  ].join('\n');

  function setup(w, f, h) {
    win = w; doc = w.document; fields = f; hooks = h;
    last = {}; timers = {};

    var fa = doc.createElement('link');
    fa.rel = 'stylesheet';
    fa.href = FA_CSS;
    doc.head.appendChild(fa);
    var style = doc.createElement('style');
    style.textContent = FRAME_CSS;
    doc.head.appendChild(style);

    // 展開所有摺疊內容，讓隱藏的文字也能編輯
    Array.prototype.forEach.call(doc.querySelectorAll('details'), function (d) { d.open = true; });

    win.open = function () { return null; };
    chip = doc.createElement('div');
    chip.className = 'cms-chip';
    doc.body.appendChild(chip);
    win.addEventListener('scroll', hideChip, { passive: true });

    lockAreas();
    blockInteractions();

    fields.forEach(function (fd) {
      last[fd.key] = hooks.current(fd.key);
      if (fd.type === 'text') bindText(fd);
      else if (fd.type === 'img') bindImage(fd);
      else if (fd.attr === 'data-title') bindMarker(fd);
    });
  }

  // ---------- 不可編輯區塊 ----------
  function lockAreas() {
    LOCKED_AREAS.forEach(function (a) {
      Array.prototype.forEach.call(doc.querySelectorAll(a.sel), function (el) {
        if (el.closest('[data-cms-locked]')) return;
        if (win.getComputedStyle(el).position === 'static') el.style.position = 'relative';
        el.setAttribute('data-cms-locked', '');
        hoverChip(el, 'fa-lock', a.label, 'is-locked');
      });
    });
    Array.prototype.forEach.call(doc.querySelectorAll(LOCKED_BUTTONS), function (el) {
      if (el.closest(ALLOWED_CONTROLS) || el.closest('[data-cms-locked]')) return;
      el.setAttribute('data-cms-locked-btn', '');
      el.setAttribute('tabindex', '-1');
      hoverChip(el, 'fa-lock', '按鈕不開放編輯', 'is-locked');
    });
  }

  // ---------- 停用原網站的按鈕、連結與選單 ----------
  function blockInteractions() {
    win.addEventListener('click', function (e) {
      var t = e.target;
      if (!t.closest) return;
      var marker = t.closest('[data-cms-marker]');
      if (marker) { stop(e); return openMarker(marker); }
      if (t.closest(ALLOWED_CONTROLS)) return;
      var img = t.closest('[data-cms-edit="img"]');
      if (img) { stop(e); return openImage(img); }
      var inText = t.closest('[data-cms-edit="text"]');
      if (t.closest('a, button, summary, label, [role="button"], [onclick]')) e.preventDefault();
      if (!inText || t.closest('summary')) e.preventDefault();
      e.stopPropagation(); // 阻止原網站的點擊行為（例如翻牌、跳頁）
    }, true);

    ['auxclick', 'submit', 'dragstart', 'drop'].forEach(function (type) {
      win.addEventListener(type, stop, true);
    });

    win.addEventListener('keydown', function (e) {
      var action = WuguAdminUI.shortcutOf(e);
      if (action) { stop(e); return hooks.shortcut(action); }
      var t = e.target;
      var editing = t.closest && t.closest('[data-cms-edit="text"]');
      if (!editing && (e.key === 'Enter' || e.key === ' ') && t.closest && t.closest('a, button, summary, [role="button"]')) {
        if (!t.closest(ALLOWED_CONTROLS)) stop(e);
      }
    }, true);

    // 由瀏覽器選單「編輯 → 還原／重做」觸發時，也改用後台的返回／重做
    win.addEventListener('beforeinput', function (e) {
      if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
        stop(e);
        hooks.shortcut(e.inputType === 'historyUndo' ? 'undo' : 'redo');
      }
    }, true);
  }

  function stop(e) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }

  // ---------- 提示標籤 ----------
  function showChip(el, icon, text, tone) {
    var r = el.getBoundingClientRect();
    chip.className = 'cms-chip' + (tone ? ' ' + tone : '');
    chip.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>';
    chip.appendChild(doc.createTextNode(text));
    var top = r.top - 34;
    if (top < 72) top = Math.min(r.top + 8, win.innerHeight - 40); // 頁首下方空間不足時改放在元素內
    chip.style.left = Math.max(8, Math.min(r.left, win.innerWidth - 240)) + 'px';
    chip.style.top = Math.max(8, top) + 'px';
    chip.classList.add('is-show');
  }
  function hideChip() { if (chip) chip.classList.remove('is-show'); }
  function hoverChip(el, icon, text, tone, test) {
    el.addEventListener('mouseenter', function () {
      if (test && !test()) return;
      if (typeof text === 'function') { var r = text(); showChip(el, r[0], r[1], r[2]); }
      else showChip(el, icon, text, tone);
    });
    el.addEventListener('mouseleave', hideChip);
  }
  function changedChip(el, icon, text) {
    return function () {
      return el.hasAttribute('data-cms-changed') ? ['fa-pen', '已修改・尚未儲存', 'is-changed'] : [icon, text, ''];
    };
  }

  // ---------- 文字欄位 ----------
  function bindText(fd) {
    var el = fd.el;
    el.setAttribute('data-cms-edit', 'text');
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
    hoverChip(el, null, changedChip(el, 'fa-pen', '點擊編輯文字'), null, function () { return doc.activeElement !== el; });

    el.addEventListener('focus', hideChip);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.isComposing) { // 段落內換行，不新增區塊
        e.preventDefault();
        if (!doc.execCommand('insertLineBreak')) doc.execCommand('insertHTML', false, '<br>');
      } else if (e.key === ' ' && el.tagName === 'SUMMARY') {
        e.preventDefault(); // 避免空白鍵收合摺疊內容
        doc.execCommand('insertText', false, ' ');
      }
    });
    el.addEventListener('keyup', function (e) { if (e.key === ' ' && el.tagName === 'SUMMARY') e.preventDefault(); });
    el.addEventListener('paste', function (e) { // 只貼上純文字，避免帶入外部格式
      e.preventDefault();
      var text = (e.clipboardData || win.clipboardData).getData('text/plain');
      doc.execCommand('insertText', false, text);
    });
    el.addEventListener('input', function () {
      clearTimeout(timers[fd.key]);
      timers[fd.key] = setTimeout(function () { commitText(fd); }, 400);
    });
    el.addEventListener('blur', function () { commitText(fd); });
  }

  function commitText(fd) {
    clearTimeout(timers[fd.key]);
    delete timers[fd.key];
    var value = CMS.sanitize(fd.el.innerHTML).replace(/^(\s|&nbsp;|<br>)+$/, '');
    if (value === last[fd.key]) return;
    var before = last[fd.key];
    last[fd.key] = value;
    hooks.commit(fd.key, before, value);
  }

  function flush() {
    Object.keys(timers).forEach(function (key) {
      var fd = fields.filter(function (f) { return f.key === key; })[0];
      if (fd) commitText(fd);
    });
  }

  // ---------- 圖片欄位 ----------
  function bindImage(fd) {
    fd.el.setAttribute('data-cms-edit', 'img');
    hoverChip(fd.el, null, changedChip(fd.el, 'fa-image', '點擊更換圖片'));
  }

  function bindMarker(fd) {
    fd.el.setAttribute('data-cms-marker', '');
    hoverChip(fd.el, null, changedChip(fd.el, 'fa-location-dot', '編輯地圖標記'));
  }

  function fieldOf(el, type) {
    return fields.filter(function (f) { return f.el === el && f.type === type; })[0];
  }

  var DRIVE_NOTE = '可貼上 Google 雲端硬碟的「共用連結」，系統會自動轉換。請確認檔案的共用設定為「知道連結的任何人」。' +
                   '網站內建圖片請輸入 images/檔名.webp。';

  // 用 type="text"：網站內建圖片是相對路徑，type="url" 會被瀏覽器判定格式錯誤
  function imageFieldsHTML(id, url) {
    return '<label for="' + id + '">圖片網址</label>' +
      '<input id="' + id + '" type="text" inputmode="url" autocomplete="off" spellcheck="false" value="' + WuguAdminUI.esc(url) + '" placeholder="https://drive.google.com/file/d/…/view?usp=sharing">' +
      '<p class="adm-dialog__note">' + DRIVE_NOTE + '</p>' +
      '<div class="adm-dialog__preview"><img id="' + id + '-preview" alt=""></div>' +
      '<p class="adm-dialog__note" id="' + id + '-msg"></p>';
  }

  function bindPreview(body, id) {
    var input = body.querySelector('#' + id);
    var img = body.querySelector('#' + id + '-preview');
    var msg = body.querySelector('#' + id + '-msg');
    function note(text, tone) { msg.className = 'adm-dialog__note' + (tone ? ' ' + tone : ''); msg.textContent = text; }
    function update() {
      var url = input.value.trim();
      note('');
      if (/drive\.google\.com\/drive\/folders\//.test(url)) {
        note('這是資料夾連結，請改用單一圖片檔案的共用連結。', 'is-warn');
        img.removeAttribute('src');
        return;
      }
      var src = CMS.safeImageUrl(CMS.imageUrl(url));
      if (!src) {
        img.removeAttribute('src');
        if (url) note('圖片網址需以 https:// 開頭，或為 images/ 內的檔案。', 'is-warn');
        return;
      }
      img.onload = function () { note(CMS.driveId(url) ? '✓ 已辨識為雲端硬碟圖片' : '✓ 圖片可正常顯示', 'is-ok'); };
      img.onerror = function () { note('無法載入圖片。若為雲端硬碟檔案，請確認已開啟「知道連結的任何人皆可檢視」。', 'is-warn'); };
      img.src = src;
    }
    input.addEventListener('input', update);
    update();
  }

  function validUrl(url) {
    if (!url) return true;
    return !!CMS.safeImageUrl(CMS.imageUrl(url.trim()));
  }

  function openImage(el) {
    var fd = fieldOf(el, 'img');
    if (!fd) return;
    hideChip();
    var altKey = fd.key + '@alt';
    var altField = fields.filter(function (f) { return f.key === altKey; })[0];
    var body = imageFieldsHTML('adm-img', hooks.current(fd.key)) +
      '<label for="adm-img-alt">替代文字（圖片說明，供無障礙與搜尋引擎使用）</label>' +
      '<input id="adm-img-alt" type="text" value="' + WuguAdminUI.esc(hooks.current(altKey)) + '">';
    WuguAdminUI.dialog('更換圖片', body, [
      { label: '還原為預設圖片', value: 'reset', left: true, icon: 'fa-arrow-rotate-left' },
      { label: '取消', value: '' },
      { label: '套用', value: 'ok', primary: true, icon: 'fa-check' }
    ], function (b) { bindPreview(b, 'adm-img'); }, 'fa-image').then(function (v) {
      if (!v) return;
      var url = v === 'reset' ? fd.defaultValue : document.getElementById('adm-img').value.trim();
      var alt = v === 'reset' ? (altField ? altField.defaultValue : '') : document.getElementById('adm-img-alt').value.trim();
      if (!url || !validUrl(url)) return WuguAdminUI.toast('圖片網址需以 https:// 開頭，或為 images/ 內的檔案', true);
      hooks.apply([
        { key: fd.key, before: hooks.current(fd.key), after: url },
        { key: altKey, before: hooks.current(altKey), after: alt }
      ]);
    });
  }

  // ---------- 地圖標記（標題、說明、圖片） ----------
  function openMarker(el) {
    var t = fields.filter(function (f) { return f.el === el && f.attr === 'data-title'; })[0];
    if (!t) return;
    hideChip();
    var base = t.key.replace(/@title$/, '');
    var keys = { title: base + '@title', desc: base + '@desc', image: base + '@image' };
    var body = '<label for="adm-mk-title">標記名稱</label>' +
      '<input id="adm-mk-title" type="text" value="' + WuguAdminUI.esc(hooks.current(keys.title)) + '">' +
      '<label for="adm-mk-desc">說明內容</label>' +
      '<textarea id="adm-mk-desc">' + WuguAdminUI.esc(hooks.current(keys.desc)) + '</textarea>' +
      imageFieldsHTML('adm-mk-img', hooks.current(keys.image));
    WuguAdminUI.dialog('編輯地圖標記', body, [
      { label: '取消', value: '' },
      { label: '套用', value: 'ok', primary: true, icon: 'fa-check' }
    ], function (b) { bindPreview(b, 'adm-mk-img'); }, 'fa-location-dot').then(function (v) {
      if (v !== 'ok') return;
      var img = document.getElementById('adm-mk-img').value.trim();
      if (!validUrl(img)) return WuguAdminUI.toast('圖片網址需以 https:// 開頭，或為 images/ 內的檔案', true);
      hooks.apply([
        { key: keys.title, before: hooks.current(keys.title), after: document.getElementById('adm-mk-title').value.trim() },
        { key: keys.desc, before: hooks.current(keys.desc), after: document.getElementById('adm-mk-desc').value.trim() },
        { key: keys.image, before: hooks.current(keys.image), after: img }
      ]);
    });
  }

  window.WuguAdminFrame = {
    setup: setup,
    flush: function () { if (fields) flush(); },
    syncLast: function (key, value) { last[key] = value; }
  };
})();
