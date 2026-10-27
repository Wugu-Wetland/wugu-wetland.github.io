// ============================================================
// CMS.JS — 五股濕地生態園區 內容同步（前台＋後台共用）
// 放置位置：每個頁面 <script src="script/shared.js"> 之前
// ============================================================

(function () {
  'use strict';

  // ★ 部署 Apps Script 後，將「網頁應用程式網址」貼在這裡
  var API_URL = 'https://script.google.com/macros/s/AKfycbxNiQJcE7jwZHtb8ro3AwQKin5uyCFlATTBoLA4YMzMGTECdQdJ_3V9OGcUHtkwyEW29g/exec';
  // ★ 若使用 Google 登入，貼上 OAuth 用戶端 ID；留空則使用密碼登入
  var GOOGLE_CLIENT_ID = '495369392584-6jh2dmiidhmq5trrptvtp0nufjo03pmh.apps.googleusercontent.com';

  var CACHE_KEY = 'wuguCMS:content';
  var PAGE_FILES = { index: 'index.html', about: 'about.html', environment: 'environment.html', species: 'species.html' };

  var isAdminFrame = window.name === 'wugu-cms-admin';
  var isAdminShell = document.documentElement.getAttribute('data-cms') === 'admin';

  // 1. 判斷目前頁面
  function detectPage() {
    var forced = document.documentElement.getAttribute('data-cms-page');
    if (forced) return forced;
    var path = location.pathname.replace(/\/+$/, '').split('/').pop().replace(/\.html$/, '');
    return PAGE_FILES[path] ? path : 'index';
  }

  // 2. 掃描可編輯欄位（頁首、選單、頁尾、按鈕除外）
  var EXCLUDE = 'header, footer, nav, script, style, noscript, template, button, select, textarea, iframe, svg, ' +
                '.btn, #news-list, [role="dialog"], .back-to-top, .skeleton, [data-cms-ignore]';
  var TEXT_TAGS = 'h1, h2, h3, h4, h5, h6, p, li, summary, figcaption, blockquote, dt, dd, th, td';
  var DECOR = '[class*="wave"], [class*="curve"]'; // 波浪等裝飾圖樣，不開放編輯
  var SLIDES = '#hero-slides';                     // 首頁橫幅，以整組清單管理

  function isExcluded(el) { return !!el.closest(EXCLUDE); }

  function anchorOf(el) {
    var a = el.parentElement;
    while (a && a !== document.body) { if (a.id) return a.id; a = a.parentElement; }
    return 'body';
  }

  function scan() {
    var fields = [];
    var counters = {};
    function nextKey(el, kind) {
      if (el.id) return el.id;
      var base = anchorOf(el) + '/' + kind;
      counters[base] = (counters[base] || 0);
      return base + '-' + (counters[base]++);
    }
    // 依文件順序一次走訪，確保前後台產生相同的 key
    var all = document.body.querySelectorAll(TEXT_TAGS + ', img, [data-title]');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (isExcluded(el)) continue;
      if (el.closest(DECOR) || el.closest(SLIDES)) {
        if (el.tagName === 'IMG') nextKey(el, 'img'); // 保留序號，避免其他欄位名稱位移
        continue;
      }
      if (el.hasAttribute('data-title')) {
        var mk = nextKey(el, 'marker');
        fields.push({ key: mk + '@title', type: 'attr', attr: 'data-title', el: el });
        fields.push({ key: mk + '@desc', type: 'attr', attr: 'data-desc', el: el });
        fields.push({ key: mk + '@image', type: 'attr', attr: 'data-image', el: el });
      } else if (el.tagName === 'IMG') {
        if (el.closest('[data-title]')) continue; // 地圖標記內的圖示
        var ik = nextKey(el, 'img');
        fields.push({ key: ik, type: 'img', el: el });
        fields.push({ key: ik + '@alt', type: 'attr', attr: 'alt', el: el });
      } else {
        // 只取「最內層」文字區塊，且內部不得含按鈕等排除元素
        if (el.querySelector(TEXT_TAGS) || el.querySelector(EXCLUDE)) continue;
        fields.push({ key: nextKey(el, el.tagName.toLowerCase()), type: 'text', el: el });
      }
    }
    var slidesWrap = document.querySelector(SLIDES);
    if (slidesWrap && !isExcluded(slidesWrap)) fields.push({ key: 'hero@slides', type: 'slides', el: slidesWrap });
    fields.forEach(function (f) { f.defaultValue = read(f); });
    return fields;
  }

  function read(f) {
    if (f.type === 'slides') return JSON.stringify(readSlides(f.el));
    if (f.type === 'text') return f.el.innerHTML.trim();
    if (f.type === 'img') return f.el.getAttribute('src') || '';
    return f.el.getAttribute(f.attr) || '';
  }

  // 3. HTML 白名單過濾（僅保留粗體、斜體、換行、連結等）
  var ALLOWED = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, BR: 1, SPAN: 1, A: 1, SUB: 1, SUP: 1, SMALL: 1, MARK: 1 };
  function sanitize(html) {
    var doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
    (function clean(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) return;
        if (n.nodeType !== 1 || !ALLOWED[n.tagName]) {
          if (n.nodeType === 1 && !/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED)$/.test(n.tagName)) {
            clean(n);
            while (n.firstChild) node.insertBefore(n.firstChild, n);
          }
          node.removeChild(n);
          return;
        }
        Array.prototype.slice.call(n.attributes).forEach(function (at) {
          var name = at.name.toLowerCase();
          var keep = name === 'class' || (n.tagName === 'A' && (name === 'href' || name === 'target' || name === 'rel'));
          if (name === 'href' && !/^(https?:|mailto:|tel:|#|\/|[\w\-]+(\.html)?([#?].*)?$)/i.test(at.value.trim())) keep = false;
          if (!keep) n.removeAttribute(at.name);
        });
        if (n.tagName === 'A' && n.getAttribute('target') === '_blank') n.setAttribute('rel', 'noopener noreferrer');
        clean(n);
      });
    })(doc.body);
    return doc.body.innerHTML;
  }

  // 4. Google 雲端硬碟共用連結 → 可直接顯示的圖片網址
  function driveId(url) {
    if (!url) return null;
    var m = url.match(/drive\.google\.com\/file\/d\/([\w-]{10,})/) ||
            url.match(/drive\.google\.com\/(?:open|uc|thumbnail)\?(?:.*&)?id=([\w-]{10,})/) ||
            url.match(/lh3\.googleusercontent\.com\/d\/([\w-]{10,})/);
    return m ? m[1] : null;
  }
  function imageUrl(url) {
    var id = driveId(url);
    return id ? 'https://lh3.googleusercontent.com/d/' + id + '=w1920' : url;
  }
  function safeImageUrl(url) {
    url = (url || '').trim();
    return /^(https:\/\/|images\/|\/images\/)/i.test(url) ? url : '';
  }

  // 5. 首頁橫幅：資料為 JSON 清單 [{ src, alt }]
  function readSlides(wrap) {
    return Array.prototype.map.call(wrap.querySelectorAll('.hero__slide img'), function (img) {
      return { src: img.getAttribute('src') || '', alt: img.getAttribute('alt') || '' };
    });
  }
  function parseSlides(value) {
    try { var list = JSON.parse(value); return Array.isArray(list) ? list : null; } catch (e) { return null; }
  }
  function escAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function slidesHTML(list) {
    return list.filter(function (s) { return s && safeImageUrl(imageUrl(s.src)); }).map(function (s, i) {
      var id = driveId(s.src);
      return '<div class="hero__slide" role="tabpanel" aria-label="輪播圖片 ' + (i + 1) + '">' +
        '<img src="' + escAttr(safeImageUrl(imageUrl(s.src))) + '" alt="' + escAttr(s.alt || '輪播圖片 ' + (i + 1)) + '"' +
        (i ? ' loading="lazy"' : '') + (id ? ' data-drive-id="' + id + '"' : '') + '>' +
        '<div class="hero__overlay"></div></div>';
    }).join('');
  }
  function bindDriveFallback(root) {
    Array.prototype.forEach.call(root.querySelectorAll('img[data-drive-id]'), function (img) {
      img.onerror = function () {
        this.onerror = null;
        this.src = 'https://drive.google.com/thumbnail?id=' + this.getAttribute('data-drive-id') + '&sz=w1920';
      };
    });
  }
  // 舊版資料（逐張圖片欄位）轉為清單
  function legacySlides(f, values) {
    var list = parseSlides(f.defaultValue) || [], changed = false;
    values = values || {};
    list.forEach(function (s, i) {
      var k = 'hero-slides/img-' + i;
      if (values[k]) { s.src = values[k]; changed = true; }
      if (values[k + '@alt']) { s.alt = values[k + '@alt']; changed = true; }
    });
    return changed ? JSON.stringify(list) : null;
  }
  function currentSlide() {
    if (api.carousel) return api.carousel.current();
    var dots = document.querySelectorAll('#carousel-dots .hero__dot');
    for (var i = 0; i < dots.length; i++) if (dots[i].classList.contains('active')) return i;
    return 0;
  }

  // 橫幅數量改變時重新建立輪播（替換元素以移除原本的事件與計時器）
  function initCarousel(html, idx) {
    var old = document.getElementById('hero-slides');
    if (!old) return null;
    var wrap = old.cloneNode(false);
    wrap.innerHTML = html == null ? old.innerHTML : html;
    old.parentNode.replaceChild(wrap, old);
    bindDriveFallback(wrap);
    function swap(id, deep) {
      var o = document.getElementById(id);
      if (!o) return null;
      var n = o.cloneNode(deep);
      o.parentNode.replaceChild(n, o);
      return n;
    }
    var dotsWrap = swap('carousel-dots', false);
    var prev = swap('carousel-prev', true);
    var next = swap('carousel-next', true);
    var slides = wrap.querySelectorAll('.hero__slide');
    var n = slides.length, current = 0, timer = null;
    if (api.carousel) api.carousel.stop();
    var autoplay = api.autoplay !== false;

    function restart() {
      clearInterval(timer);
      if (autoplay && n > 1) timer = setInterval(function () { goTo(current + 1); }, 5000);
    }
    function goTo(i) {
      if (!n) return;
      if (slides[current]) slides[current].removeAttribute('aria-current');
      current = (i + n) % n;
      wrap.style.transform = 'translateX(-' + current * 100 + '%)';
      if (dotsWrap) Array.prototype.forEach.call(dotsWrap.children, function (d, j) {
        d.classList.toggle('active', j === current);
        d.setAttribute('aria-selected', String(j === current));
      });
      slides[current].setAttribute('aria-current', 'true');
      restart();
      if (api.onSlide) api.onSlide(current, n);
    }
    if (dotsWrap) Array.prototype.forEach.call(slides, function (_, i) {
      var dot = document.createElement('button');
      dot.className = 'hero__dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', '第 ' + (i + 1) + ' 張');
      dot.addEventListener('click', function () { goTo(i); });
      dotsWrap.appendChild(dot);
    });
    if (prev) prev.addEventListener('click', function () { goTo(current - 1); });
    if (next) next.addEventListener('click', function () { goTo(current + 1); });
    wrap.addEventListener('mouseenter', function () { clearInterval(timer); });
    wrap.addEventListener('mouseleave', restart);
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') goTo(current - 1);
      if (e.key === 'ArrowRight') goTo(current + 1);
    });
    api.carousel = {
      goTo: goTo, count: n,
      current: function () { return current; },
      stop: function () { clearInterval(timer); autoplay = false; }
    };
    goTo(Math.max(0, Math.min(idx || 0, n - 1)));
    return wrap;
  }

  function writeSlides(f, value) {
    if (f.rendered === undefined) f.rendered = f.defaultValue;
    if (value === f.rendered) return;
    var list = parseSlides(value);
    var html = list && slidesHTML(list);
    if (!html) return;
    f.rendered = value;
    if (document.readyState === 'loading') { // 頁面腳本尚未執行，直接替換即可
      f.el.innerHTML = html;
      bindDriveFallback(f.el);
    } else {
      var idx = api.nextSlide != null ? api.nextSlide : currentSlide();
      api.nextSlide = null;
      f.el = initCarousel(html, idx) || f.el;
    }
  }

  // 6. 將資料套用到畫面（只更新有變動的欄位，避免重繪）
  function write(f, value) {
    if (value == null) value = f.defaultValue;
    if (f.type === 'slides') return writeSlides(f, value);
    if (f.type === 'text') {
      var html = value === f.defaultValue ? value : sanitize(value); // 原始 HTML 不需再過濾
      if (f.el.innerHTML.trim() !== html) f.el.innerHTML = html;
    } else if (f.type === 'img') {
      var src = safeImageUrl(imageUrl(value)) || f.defaultValue;
      if (f.el.getAttribute('src') !== src) {
        var id = driveId(value);
        f.el.onerror = id ? function () {
          this.onerror = null; // 主要網址失敗時改用縮圖服務
          this.src = 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1920';
        } : null;
        f.el.removeAttribute('srcset');
        f.el.setAttribute('src', src);
      }
    } else {
      var v = f.attr === 'data-image' ? (value ? safeImageUrl(imageUrl(value)) : '') : String(value);
      if (f.el.getAttribute(f.attr) !== v) f.el.setAttribute(f.attr, v);
      if (f.attr === 'data-title') f.el.setAttribute('title', v);
    }
  }
  function apply(fields, values) {
    values = values || {};
    fields.forEach(function (f) {
      var has = Object.prototype.hasOwnProperty.call(values, f.key);
      var v = has ? values[f.key] : null;
      if (!has && f.type === 'slides') v = legacySlides(f, values);
      write(f, v);
    });
  }

  // 7. 讀取資料庫
  function fetchContent() {
    return fetch(API_URL + '?action=content&t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || '讀取失敗');
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
        return data;
      });
  }
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
  }

  var api = {
    API_URL: API_URL, GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID, PAGE_FILES: PAGE_FILES,
    scan: scan, read: read, write: write, apply: apply, sanitize: sanitize,
    imageUrl: imageUrl, driveId: driveId, safeImageUrl: safeImageUrl,
    fetchContent: fetchContent, readCache: readCache, page: null, fields: [],
    parseSlides: parseSlides, legacySlides: legacySlides, initCarousel: initCarousel, currentSlide: currentSlide,
    carousel: null, autoplay: true, nextSlide: null, onSlide: null
  };
  window.WuguCMS = api;

  if (isAdminShell) return; // 後台外殼只需要共用函式

  api.page = detectPage();
  api.fields = scan();

  if (isAdminFrame) {
    // 後台預覽：交由後台套用資料與草稿；橫幅不自動輪播
    api.autoplay = false;
    if (window.parent !== window && window.parent.WuguCMSAdmin) window.parent.WuguCMSAdmin.onFrameReady(window);
    return;
  }

  // 前台：先套用瀏覽器快取（瞬間呈現），再向資料庫取得最新內容
  var cached = readCache();
  if (cached && cached.pages) {
    apply(api.fields, cached.pages[api.page]);
  } else {
    // 首次造訪：暫時隱藏文字欄位（保留版面），最多 1.5 秒
    api.fields.forEach(function (f) { if (f.type === 'text') f.el.style.visibility = 'hidden'; });
  }
  function reveal() { api.fields.forEach(function (f) { if (f.type === 'text') f.el.style.visibility = ''; }); }
  var revealTimer = setTimeout(reveal, 1500);

  fetchContent()
    .then(function (data) { apply(api.fields, data.pages[api.page]); })
    .catch(function () { /* 讀取失敗時保留快取或原始內容 */ })
    .then(function () { clearTimeout(revealTimer); reveal(); });
})();
