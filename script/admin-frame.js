// ============================================================
// ADMIN-FRAME.JS — 頁面預覽內的編輯功能
// 標示可編輯欄位、遮擋不可編輯區塊、停用原有按鈕與選單、
// 圖片／地圖標記／首頁橫幅編輯、翻翻卡翻面按鈕
// ============================================================

(function () {
  'use strict';

  var CMS = window.WuguCMS;
  var win, doc, fields, hooks, chip, slidesField, heroBar;
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
  var STRIPES = 'repeating-linear-gradient(135deg,rgba(96,104,94,.17) 0 8px,rgba(96,104,94,.07) 8px 16px)';
  var UI_FONT = '600 12.5px/1 "Noto Sans TC",system-ui,sans-serif';
  var FRAME_CSS = [
    // 文字：平時不顯示框線；滑鼠移入區塊時淡淡提示，移到欄位或編輯中才明確標示
    '[data-cms-edit="text"]{border-radius:4px;cursor:text;outline:1px dashed transparent;outline-offset:4px;caret-color:#405935;' +
      'transition:outline-color .2s,background-color .2s,box-shadow .2s}',
    '[data-cms-zone]:hover [data-cms-edit="text"],html.cms-show-all [data-cms-edit="text"]{outline-color:rgba(' + G + ',.28)}',
    '[data-cms-edit="text"]:hover{outline:1px solid rgba(' + G + ',.6);background-color:rgba(122,158,110,.08)}',
    '[data-cms-edit="text"]:focus{outline:2px solid #405935;box-shadow:0 0 0 7px rgba(' + G + ',.12)}',
    '[data-cms-edit="text"]:empty::before{content:"點擊輸入文字…";opacity:.4}',
    '[data-cms-edit="text"]::selection,[data-cms-edit="text"] *::selection{background:rgba(122,158,110,.35)}',
    // 已修改但尚未儲存：橘色實線框（與可編輯虛線框位置相同，且常駐顯示）
    '[data-cms-changed][data-cms-edit="text"]{outline:1px solid #d97706 !important}',
    '[data-cms-changed][data-cms-edit="text"]:focus{outline-width:2px !important;box-shadow:0 0 0 7px rgba(217,119,6,.12)}',
    // 圖片與地圖標記
    '[data-cms-edit="img"],#hero-slides{cursor:pointer;transition:filter .2s}',
    '[data-cms-edit="img"]:hover,#hero-slides:hover{filter:brightness(.88)}',
    'html.cms-show-all [data-cms-edit="img"]{outline:2px dashed rgba(255,255,255,.9);outline-offset:-8px}',
    '[data-cms-changed][data-cms-edit="img"]{outline:3px solid #d97706 !important;outline-offset:-3px}',
    '[data-cms-marker]{cursor:pointer;border-radius:50%;outline:2px solid transparent;outline-offset:3px;transition:outline-color .2s}',
    '[data-cms-marker]:hover,html.cms-show-all [data-cms-marker]{outline-color:#405935}',
    '[data-cms-changed][data-cms-marker]{outline:3px solid #d97706}',
    // 不可編輯區塊：斜紋遮罩
    '[data-cms-locked],[data-cms-locked] *{cursor:not-allowed !important}',
    '[data-cms-locked]:not([data-cms-locked="wave"])::after{content:"";position:absolute;inset:0;z-index:50;background:' + STRIPES + '}',
    '[data-cms-locked="wave"] *{pointer-events:none}',
    '.cms-lock-mask{position:absolute;left:0;right:0;bottom:0;z-index:50;pointer-events:none;background:' + STRIPES + '}',
    '[data-cms-locked-btn]{filter:grayscale(1);opacity:.45;cursor:not-allowed !important;transform:none !important;box-shadow:none !important}',
    '[data-cms-locked-btn] *{cursor:not-allowed !important}',
    '[data-cms-decor]{cursor:default}',
    // 翻翻卡：停用滑過翻面，改用按鈕
    '.species-card{position:relative}',
    '.species-card:hover .card-inner,.species-card:focus .card-inner,.species-card:focus-within .card-inner,.species-card.is-flipped .card-inner{transform:none !important}',
    '.species-card.cms-flipped .card-inner{transform:rotateY(180deg) !important}',
    // 後台控制按鈕
    '.cms-ui-btn{appearance:none;display:inline-flex;align-items:center;gap:6px;border:0;border-radius:999px;padding:8px 12px;' +
      'background:rgba(255,255,255,.96);color:#2e4027;font:' + UI_FONT + ';box-shadow:0 4px 14px rgba(0,0,0,.18);cursor:pointer;' +
      'transition:background .15s,color .15s,transform .1s;white-space:nowrap}',
    '.cms-ui-btn:hover{background:#fff;color:#405935}',
    '.cms-ui-btn:active{transform:translateY(1px)}',
    '.cms-ui-btn:disabled{opacity:.4;cursor:not-allowed}',
    '.cms-ui-btn--danger:hover{color:#b91c1c}',
    '.cms-ui-btn--icon{padding:8px 10px}',
    '.cms-flip-btn{position:absolute;top:10px;right:10px;z-index:20}',
    '.cms-corner-btn{position:absolute;top:14px;right:14px;z-index:5}',
    '.cms-hero-bar{position:absolute;left:16px;top:16px;z-index:30;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px;' +
      'border-radius:999px;background:rgba(46,64,39,.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}',
    '.cms-hero-bar__count{display:flex;align-items:center;gap:7px;padding:0 8px 0 10px;color:#fff;font:' + UI_FONT + '}',
    '.cms-hero-bar__dot{display:none;width:7px;height:7px;border-radius:50%;background:#f59e0b}',
    '[data-cms-changed] ~ .cms-hero-bar .cms-hero-bar__dot{display:inline-block}',
    // 其他
    '.reveal{opacity:1 !important;transform:none !important}',
    '.cms-chip{position:fixed;z-index:99999;pointer-events:none;display:flex;align-items:center;gap:6px;background:#2e4027;color:#fff;' +
      'font:' + UI_FONT + ';letter-spacing:.02em;padding:7px 11px;border-radius:999px;' +
      'box-shadow:0 6px 18px rgba(0,0,0,.22);opacity:0;transform:translateY(4px);transition:opacity .12s,transform .12s;white-space:nowrap}',
    '.cms-chip.is-show{opacity:1;transform:none}',
    '.cms-chip.is-locked{background:#5f655c}',
    '.cms-chip.is-changed{background:#b45309}'
  ].join('\n');

  function setup(w, f, h) {
    win = w; doc = w.document; fields = f; hooks = h;
    last = {}; timers = {}; slidesField = null; heroBar = null;

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

    fixStacking();
    lockAreas();
    blockInteractions();

    fields.forEach(function (fd) {
      last[fd.key] = hooks.current(fd.key);
      if (fd.type === 'text') bindText(fd);
      else if (fd.type === 'img') bindImage(fd);
      else if (fd.type === 'slides') slidesField = fd;
      else if (fd.attr === 'data-title') bindMarker(fd);
    });
    Array.prototype.forEach.call(doc.querySelectorAll('[class*="wave"] img, [class*="curve"] img'), function (img) {
      img.setAttribute('data-cms-decor', '');
    });

    markZones();
    addFlipButtons();
    addCornerButtons();
    buildHeroBar();
    setShowAll(hooks.showAll());

    // 頁面腳本執行完畢後接手橫幅輪播（停用自動播放，方便編輯）
    doc.addEventListener('DOMContentLoaded', function () {
      setTimeout(function () {
        if (!slidesField) return;
        win.WuguCMS.onSlide = updateHeroBar;
        slidesField.el = win.WuguCMS.initCarousel(null, win.WuguCMS.currentSlide()) || slidesField.el;
      }, 0);
    });
  }

  // ---------- 修正圖層：部分頁面的主內容為負 z-index，滑鼠點不到 ----------
  function fixStacking() {
    var seen = [], fixed = false;
    fields.forEach(function (fd) {
      for (var a = fd.el.parentElement; a && a !== doc.body; a = a.parentElement) {
        if (seen.indexOf(a) >= 0) break;
        seen.push(a);
        if (parseInt(win.getComputedStyle(a).zIndex, 10) < 0) { a.style.zIndex = '0'; fixed = true; }
      }
    });
    // 讓頁尾波浪維持疊在內容上方，與前台呈現相同
    if (fixed) Array.prototype.forEach.call(doc.querySelectorAll('footer'), function (ft) {
      if (win.getComputedStyle(ft).position === 'static') ft.style.position = 'relative';
      ft.style.zIndex = '1';
    });
  }

  // ---------- 不可編輯區塊 ----------
  function lockAreas() {
    LOCKED_AREAS.forEach(function (a) {
      Array.prototype.forEach.call(doc.querySelectorAll(a.sel), function (el) {
        if (el.closest('[data-cms-locked]')) return;
        if (win.getComputedStyle(el).position === 'static') el.style.position = 'relative';
        var wave = el.querySelector(':scope > svg');
        el.setAttribute('data-cms-locked', wave ? 'wave' : '');
        if (wave) addWaveMask(el, wave);
        hoverChip(el, 'fa-lock', a.label, 'is-locked');
      });
    });
    Array.prototype.forEach.call(doc.querySelectorAll(LOCKED_BUTTONS), function (el) {
      if (el.closest(ALLOWED_CONTROLS) || el.closest('[data-cms-locked]') || el.closest('[data-cms-ui]')) return;
      el.setAttribute('data-cms-locked-btn', '');
      el.setAttribute('tabindex', '-1');
      hoverChip(el, 'fa-lock', '按鈕不開放編輯', 'is-locked');
    });
  }

  // 頁尾遮罩上緣依照波浪形狀裁切
  function addWaveMask(footer, svg) {
    var path = svg.querySelector('path');
    var mask = doc.createElement('div');
    mask.className = 'cms-lock-mask';
    mask.setAttribute('data-cms-ui', '');
    footer.appendChild(mask);
    var shape = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (svg.getAttribute('viewBox') || '0 0 1440 200') +
      '" preserveAspectRatio="none"><path d="' + (path ? path.getAttribute('d') : '') + '"/></svg>';
    var image = 'url("data:image/svg+xml,' + encodeURIComponent(shape) + '"), linear-gradient(#000,#000)';
    function layout() {
      var h = svg.getBoundingClientRect().height;
      var top = Math.max(0, h - 1); // 原波浪向下位移 1px 與頁尾重疊
      var size = '100% ' + h + 'px, 100% calc(100% - ' + top + 'px)';
      var pos = '0 0, 0 ' + top + 'px';
      mask.style.top = -top + 'px';
      mask.style.webkitMaskImage = mask.style.maskImage = image;
      mask.style.webkitMaskSize = mask.style.maskSize = size;
      mask.style.webkitMaskPosition = mask.style.maskPosition = pos;
      mask.style.webkitMaskRepeat = mask.style.maskRepeat = 'no-repeat';
    }
    layout();
    win.addEventListener('resize', layout);
    win.addEventListener('load', layout);
  }

  // ---------- 停用原網站的按鈕、連結與選單 ----------
  function blockInteractions() {
    win.addEventListener('click', function (e) {
      var t = e.target;
      if (!t.closest) return;
      var ui = t.closest('[data-cms-ui]');
      if (ui) {
        stop(e);
        var btn = t.closest('[data-cms-ui-action]');
        if (btn && !btn.disabled) uiAction(btn);
        return;
      }
      var marker = t.closest('[data-cms-marker]');
      if (marker) { stop(e); return openMarker(marker); }
      if (t.closest(ALLOWED_CONTROLS)) return;
      if (slidesField && t.closest('#hero-slides')) { stop(e); return slideAction('slide-edit'); }
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
        if (!t.closest(ALLOWED_CONTROLS) && !t.closest('[data-cms-ui]')) stop(e);
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

  function uiAction(btn) {
    var action = btn.getAttribute('data-cms-ui-action');
    if (action === 'flip') return flipCard(btn);
    if (action === 'img') {
      var fd = fields.filter(function (f) { return f.key === btn.getAttribute('data-cms-key'); })[0];
      return fd && openImage(fd.el);
    }
    if (action.indexOf('slide-') === 0) return slideAction(action);
  }

  function uiButton(action, icon, label, cls) {
    var b = doc.createElement('button');
    b.type = 'button';
    b.className = 'cms-ui-btn' + (cls ? ' ' + cls : '') + (label ? '' : ' cms-ui-btn--icon');
    b.setAttribute('data-cms-ui', '');
    b.setAttribute('data-cms-ui-action', action);
    b.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>' + (label ? '<span>' + label + '</span>' : '');
    return b;
  }

  // ---------- 編輯範圍提示 ----------
  function markZones() {
    fields.forEach(function (fd) {
      if (fd.type !== 'text') return;
      var zone = fd.el.closest('section, article');
      if (zone) zone.setAttribute('data-cms-zone', '');
    });
  }
  function setShowAll(on) { doc.documentElement.classList.toggle('cms-show-all', !!on); }

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
  function hoverChip(el, icon, text, tone) {
    el.addEventListener('mouseenter', function () {
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

  // ---------- 翻翻卡 ----------
  function addFlipButtons() {
    Array.prototype.forEach.call(doc.querySelectorAll('.species-card'), function (card) {
      card.appendChild(uiButton('flip', 'fa-rotate', '翻到背面', 'cms-flip-btn'));
    });
  }
  function flipCard(btn) {
    var card = btn.closest('.species-card');
    if (doc.activeElement && card.contains(doc.activeElement)) doc.activeElement.blur();
    var flipped = card.classList.toggle('cms-flipped');
    btn.querySelector('span').textContent = flipped ? '翻回正面' : '翻到背面';
  }

  // ---------- 圖片欄位 ----------
  function bindImage(fd) {
    fd.el.setAttribute('data-cms-edit', 'img');
    hoverChip(fd.el, null, changedChip(fd.el, 'fa-image', '點擊更換圖片'));
  }

  // 被文字蓋住、無法點擊的背景圖片，於區塊角落提供按鈕
  function addCornerButtons() {
    fields.forEach(function (fd) {
      if (fd.type !== 'img' || win.getComputedStyle(fd.el).pointerEvents !== 'none') return;
      var host = fd.el.closest('section');
      if (!host) return;
      if (win.getComputedStyle(host).position === 'static') host.style.position = 'relative';
      var b = uiButton('img', 'fa-image', '更換背景圖片', 'cms-corner-btn');
      b.setAttribute('data-cms-key', fd.key);
      host.appendChild(b);
    });
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
  function altFieldHTML(value) {
    return '<label for="adm-img-alt">替代文字（圖片說明，供無障礙與搜尋引擎使用）</label>' +
      '<input id="adm-img-alt" type="text" value="' + WuguAdminUI.esc(value) + '">';
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
  var URL_ERROR = '圖片網址需以 https:// 開頭，或為 images/ 內的檔案';

  // 圖片對話框：回傳 { action, url, alt }
  function imageDialog(title, icon, url, alt, buttons) {
    return WuguAdminUI.dialog(title, imageFieldsHTML('adm-img', url) + altFieldHTML(alt), buttons,
      function (b) { bindPreview(b, 'adm-img'); }, icon).then(function (v) {
      return {
        action: v,
        url: document.getElementById('adm-img').value.trim(),
        alt: document.getElementById('adm-img-alt').value.trim()
      };
    });
  }

  function openImage(el) {
    var fd = fieldOf(el, 'img');
    if (!fd) return;
    hideChip();
    var altKey = fd.key + '@alt';
    var altField = fields.filter(function (f) { return f.key === altKey; })[0];
    imageDialog('更換圖片', 'fa-image', hooks.current(fd.key), hooks.current(altKey), [
      { label: '還原為預設圖片', value: 'reset', left: true, icon: 'fa-arrow-rotate-left' },
      { label: '取消', value: '' },
      { label: '套用', value: 'ok', primary: true, icon: 'fa-check' }
    ]).then(function (r) {
      if (!r.action) return;
      var url = r.action === 'reset' ? fd.defaultValue : r.url;
      var alt = r.action === 'reset' ? (altField ? altField.defaultValue : '') : r.alt;
      if (!url || !validUrl(url)) return WuguAdminUI.toast(URL_ERROR, true);
      hooks.apply([
        { key: fd.key, before: hooks.current(fd.key), after: url },
        { key: altKey, before: hooks.current(altKey), after: alt }
      ]);
    });
  }

  // ---------- 首頁橫幅（更換、新增、排序、刪除） ----------
  function buildHeroBar() {
    var hero = slidesField && doc.getElementById('hero');
    if (!hero) return;
    if (win.getComputedStyle(hero).position === 'static') hero.style.position = 'relative';
    heroBar = doc.createElement('div');
    heroBar.className = 'cms-hero-bar';
    heroBar.setAttribute('data-cms-ui', '');
    heroBar.innerHTML = '<span class="cms-hero-bar__count"><i class="fa-solid fa-images" aria-hidden="true"></i>' +
      '<span data-count></span><span class="cms-hero-bar__dot" title="橫幅已修改・尚未儲存"></span></span>';
    [
      ['slide-edit', 'fa-image', '更換圖片'],
      ['slide-add', 'fa-plus', '新增橫幅'],
      ['slide-left', 'fa-arrow-left', '', '往前移'],
      ['slide-right', 'fa-arrow-right', '', '往後移'],
      ['slide-delete', 'fa-trash-can', '刪除', '', 'cms-ui-btn--danger']
    ].forEach(function (d) {
      var b = uiButton(d[0], d[1], d[2], d[4]);
      if (d[3]) { b.title = d[3]; b.setAttribute('aria-label', d[3]); }
      heroBar.appendChild(b);
    });
    hero.appendChild(heroBar);
    var list = slideList();
    updateHeroBar(0, list.length);
  }

  function updateHeroBar(cur, n) {
    if (!heroBar) return;
    heroBar.querySelector('[data-count]').textContent = '橫幅 ' + (cur + 1) + ' / ' + n;
    heroBar.querySelector('[data-cms-ui-action="slide-left"]').disabled = cur <= 0;
    heroBar.querySelector('[data-cms-ui-action="slide-right"]').disabled = cur >= n - 1;
    heroBar.querySelector('[data-cms-ui-action="slide-delete"]').disabled = n <= 1;
  }

  function slideList() { return win.WuguCMS.parseSlides(hooks.current(slidesField.key)) || []; }
  function slideIndex() { return win.WuguCMS.currentSlide(); }
  function commitSlides(list, idx) {
    win.WuguCMS.nextSlide = idx;
    hooks.apply([{ key: slidesField.key, before: hooks.current(slidesField.key), after: JSON.stringify(list) }]);
  }

  function slideAction(action) {
    var list = slideList(), cur = Math.min(slideIndex(), list.length - 1), s = list[cur] || { src: '', alt: '' };
    hideChip();
    if (action === 'slide-edit') {
      imageDialog('更換橫幅圖片（第 ' + (cur + 1) + ' 張）', 'fa-image', s.src, s.alt, [
        { label: '取消', value: '' },
        { label: '套用', value: 'ok', primary: true, icon: 'fa-check' }
      ]).then(function (r) {
        if (r.action !== 'ok') return;
        if (!r.url || !validUrl(r.url)) return WuguAdminUI.toast(URL_ERROR, true);
        list[cur] = { src: r.url, alt: r.alt };
        commitSlides(list, cur);
      });
    } else if (action === 'slide-add') {
      imageDialog('新增橫幅', 'fa-plus', '', '', [
        { label: '取消', value: '' },
        { label: '新增', value: 'ok', primary: true, icon: 'fa-plus' }
      ]).then(function (r) {
        if (r.action !== 'ok') return;
        if (!r.url || !validUrl(r.url)) return WuguAdminUI.toast(URL_ERROR, true);
        list.splice(cur + 1, 0, { src: r.url, alt: r.alt });
        commitSlides(list, cur + 1);
        WuguAdminUI.toast('已新增橫幅（第 ' + (cur + 2) + ' 張）');
      });
    } else if (action === 'slide-delete') {
      if (list.length <= 1) return WuguAdminUI.toast('至少需保留一張橫幅', true);
      WuguAdminUI.dialog('刪除第 ' + (cur + 1) + ' 張橫幅？',
        '<div class="adm-dialog__preview"><img src="' + WuguAdminUI.esc(CMS.safeImageUrl(CMS.imageUrl(s.src))) + '" alt=""></div>' +
        '<p class="adm-dialog__note">刪除後仍可按「返回」復原；儲存後才會同步至網站。</p>', [
          { label: '取消', value: '' },
          { label: '刪除', value: 'delete', primary: true, icon: 'fa-trash-can' }
        ], null, 'fa-trash-can').then(function (v) {
        if (v !== 'delete') return;
        list.splice(cur, 1);
        commitSlides(list, Math.min(cur, list.length - 1));
      });
    } else if (action === 'slide-left' || action === 'slide-right') {
      var to = cur + (action === 'slide-left' ? -1 : 1);
      if (to < 0 || to >= list.length) return;
      list.splice(to, 0, list.splice(cur, 1)[0]);
      commitSlides(list, to);
    }
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
      if (!validUrl(img)) return WuguAdminUI.toast(URL_ERROR, true);
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
    syncLast: function (key, value) { last[key] = value; },
    setShowAll: function (on) { if (doc) setShowAll(on); }
  };
})();
