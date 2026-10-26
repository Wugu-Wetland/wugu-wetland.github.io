// ============================================================
// ADMIN-FRAME.JS — 頁面預覽內的編輯功能
// 標示可編輯欄位、停用原有按鈕與選單、圖片與地圖標記編輯
// ============================================================

(function () {
  'use strict';

  var CMS = window.WuguCMS;
  var win, doc, fields, hooks;
  var last = {};          // 每個欄位最後一次記錄到歷史的值
  var timers = {};
  var ALLOWED_CONTROLS = '.hero__nav-btn, .hero__dot'; // 不會離開頁面的輪播控制，保留可用

  var FRAME_CSS = [
    '[data-cms-edit="text"]{outline:2px dashed rgba(64,90,53,.5);outline-offset:3px;cursor:text;border-radius:2px;min-height:1em;transition:outline-color .15s,background-color .15s}',
    '[data-cms-edit="text"]:hover{outline-color:#405A35;background-color:rgba(233,240,225,.45)}',
    '[data-cms-edit="text"]:focus{outline:2px solid #405A35;background-color:rgba(255,255,255,.7)}',
    '[data-cms-edit="text"]:empty::before{content:"（空白，可點擊輸入文字）";opacity:.45}',
    '[data-cms-edit="img"]{outline:3px dashed rgba(64,90,53,.6);outline-offset:-3px;cursor:pointer}',
    '[data-cms-edit="img"]:hover{outline-color:#405A35;filter:brightness(.92)}',
    '[data-cms-marker]{outline:3px dashed #405A35;outline-offset:3px;border-radius:50%;cursor:pointer}',
    '[data-cms-changed]{outline-color:#d97706 !important;outline-style:solid !important}',
    'header a, header button, footer a, .btn, button:not(.hero__nav-btn):not(.hero__dot), .nav-drawer a{cursor:not-allowed !important}',
    '.species-card:focus-within .card-inner{transform:rotateY(180deg)}',
    '.reveal{opacity:1 !important;transform:none !important}',
    '.cms-chip{position:fixed;z-index:99999;pointer-events:none;background:#405A35;color:#fff;font:600 13px/1 system-ui,sans-serif;padding:7px 11px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.25);opacity:0;transition:opacity .12s}',
    '.cms-chip.is-show{opacity:1}'
  ].join('\n');

  function setup(w, f, h) {
    win = w; doc = w.document; fields = f; hooks = h;
    last = {}; timers = {};

    var style = doc.createElement('style');
    style.textContent = FRAME_CSS;
    doc.head.appendChild(style);

    // 展開所有摺疊內容，讓隱藏的文字也能編輯
    Array.prototype.forEach.call(doc.querySelectorAll('details'), function (d) { d.open = true; });

    win.open = function () { return null; };
    blockInteractions();

    var chip = doc.createElement('div');
    chip.className = 'cms-chip';
    doc.body.appendChild(chip);

    var markers = [];
    fields.forEach(function (fd) {
      last[fd.key] = hooks.current(fd.key);
      if (fd.type === 'text') bindText(fd);
      else if (fd.type === 'img') bindImage(fd, chip);
      else if (fd.attr === 'data-title') markers.push(fd);
    });
    markers.forEach(function (fd) {
      fd.el.setAttribute('data-cms-marker', '');
      fd.el.addEventListener('mouseenter', function () { showChip(chip, fd.el, '編輯地圖標記'); });
      fd.el.addEventListener('mouseleave', function () { chip.classList.remove('is-show'); });
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
      if (t.closest('a, button, summary, label, [role="button"], [onclick]') ) e.preventDefault();
      if (!inText || t.closest('summary')) e.preventDefault();
      e.stopPropagation(); // 阻止原網站的點擊行為（例如翻牌、跳頁）
    }, true);

    ['auxclick', 'submit', 'dragstart', 'drop'].forEach(function (type) {
      win.addEventListener(type, stop, true);
    });

    win.addEventListener('keydown', function (e) {
      var t = e.target;
      if ((e.ctrlKey || e.metaKey) && /^[zys]$/i.test(e.key)) {
        stop(e);
        var k = e.key.toLowerCase();
        hooks.shortcut(k === 's' ? 'save' : (k === 'y' || e.shiftKey) ? 'redo' : 'undo');
        return;
      }
      var editing = t.closest && t.closest('[data-cms-edit="text"]');
      if (!editing && (e.key === 'Enter' || e.key === ' ') && t.closest && t.closest('a, button, summary, [role="button"]')) {
        if (!t.closest(ALLOWED_CONTROLS)) stop(e);
      }
    }, true);
  }

  function stop(e) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }

  // ---------- 文字欄位 ----------
  function bindText(fd) {
    var el = fd.el;
    el.setAttribute('data-cms-edit', 'text');
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
    el.title = '點擊即可編輯文字';

    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { // 段落內換行，不新增區塊
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
  function bindImage(fd, chip) {
    fd.el.setAttribute('data-cms-edit', 'img');
    fd.el.addEventListener('mouseenter', function () { showChip(chip, fd.el, '點擊更換圖片'); });
    fd.el.addEventListener('mouseleave', function () { chip.classList.remove('is-show'); });
  }

  function showChip(chip, el, text) {
    var r = el.getBoundingClientRect();
    chip.textContent = text;
    chip.style.left = Math.max(8, r.left + 10) + 'px';
    chip.style.top = Math.max(72, r.top + 10) + 'px';
    chip.classList.add('is-show');
  }

  function fieldOf(el, type) {
    return fields.filter(function (f) { return f.el === el && f.type === type; })[0];
  }

  var DRIVE_NOTE = '可貼上 Google 雲端硬碟的「共用連結」，系統會自動轉換。請確認檔案的共用設定為「知道連結的任何人」。' +
                   '網站內建圖片請輸入 images/檔名.webp。';

  function imageFieldsHTML(id, url) {
    return '<label for="' + id + '">圖片網址</label>' +
      '<input id="' + id + '" type="url" value="' + WuguAdminUI.esc(url) + '" placeholder="https://drive.google.com/file/d/…/view?usp=sharing">' +
      '<p class="adm-dialog__note">' + DRIVE_NOTE + '</p>' +
      '<div class="adm-dialog__preview"><img id="' + id + '-preview" alt=""></div>' +
      '<p class="adm-dialog__note" id="' + id + '-msg"></p>';
  }

  function bindPreview(body, id) {
    var input = body.querySelector('#' + id);
    var img = body.querySelector('#' + id + '-preview');
    var msg = body.querySelector('#' + id + '-msg');
    function update() {
      var url = input.value.trim();
      msg.className = 'adm-dialog__note';
      msg.textContent = '';
      if (/drive\.google\.com\/drive\/folders\//.test(url)) {
        msg.className += ' is-warn';
        msg.textContent = '這是資料夾連結，請改用單一圖片檔案的共用連結。';
        img.removeAttribute('src');
        return;
      }
      var src = CMS.safeImageUrl(CMS.imageUrl(url));
      if (!src) { img.removeAttribute('src'); return; }
      img.onload = function () { msg.textContent = CMS.driveId(url) ? '已辨識為雲端硬碟圖片 ✓' : ''; };
      img.onerror = function () {
        msg.className += ' is-warn';
        msg.textContent = '無法載入圖片。若為雲端硬碟檔案，請確認已開啟「知道連結的任何人皆可檢視」。';
      };
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
    var altKey = fd.key + '@alt';
    var altField = fields.filter(function (f) { return f.key === altKey; })[0];
    var body = imageFieldsHTML('adm-img', hooks.current(fd.key)) +
      '<label for="adm-img-alt">替代文字（圖片說明，供無障礙與搜尋引擎使用）</label>' +
      '<input id="adm-img-alt" value="' + WuguAdminUI.esc(hooks.current(altKey)) + '">';
    WuguAdminUI.dialog('更換圖片', body, [
      { label: '還原為預設圖片', value: 'reset' },
      { label: '取消', value: '' },
      { label: '套用', value: 'ok', primary: true }
    ], function (b) { bindPreview(b, 'adm-img'); }).then(function (v) {
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
    var base = t.key.replace(/@title$/, '');
    var keys = { title: base + '@title', desc: base + '@desc', image: base + '@image' };
    var body = '<label for="adm-mk-title">標記名稱</label>' +
      '<input id="adm-mk-title" value="' + WuguAdminUI.esc(hooks.current(keys.title)) + '">' +
      '<label for="adm-mk-desc">說明內容</label>' +
      '<textarea id="adm-mk-desc">' + WuguAdminUI.esc(hooks.current(keys.desc)) + '</textarea>' +
      imageFieldsHTML('adm-mk-img', hooks.current(keys.image));
    WuguAdminUI.dialog('編輯地圖標記', body, [
      { label: '取消', value: '' },
      { label: '套用', value: 'ok', primary: true }
    ], function (b) { bindPreview(b, 'adm-mk-img'); }).then(function (v) {
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
