(function() {
  'use strict';

  // 1. HERO CAROUSEL & CTA
  const slidesWrap = document.getElementById('hero-slides');
  const slides     = slidesWrap ? slidesWrap.querySelectorAll('.hero__slide') : [];
  if(slides.length > 0) {
    const dotsWrap   = document.getElementById('carousel-dots');
    const prevBtn    = document.getElementById('carousel-prev');
    const nextBtn    = document.getElementById('carousel-next');
    const ctaBtn     = document.getElementById('hero-cta-btn');
    let current = 0;
    let timer;

    if (ctaBtn) ctaBtn.addEventListener('click', () => document.getElementById('about').scrollIntoView({ behavior: 'smooth' }));

    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'hero__dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `第 ${i+1} 張`);
      dot.setAttribute('aria-selected', String(i === 0));
      dot.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(dot);
    });

    function goTo(idx) {
      slides[current].removeAttribute('aria-current');
      current = (idx + slides.length) % slides.length;
      slidesWrap.style.transform = `translateX(-${current * 100}%)`;
      dotsWrap.querySelectorAll('.hero__dot').forEach((d, i) => {
        d.classList.toggle('active', i === current);
        d.setAttribute('aria-selected', String(i === current));
      });
      slides[current].setAttribute('aria-current', 'true');
      restartTimer();
    }

    function restartTimer() {
      clearInterval(timer);
      timer = setInterval(() => goTo(current + 1), 5000);
    }

    if(prevBtn) prevBtn.addEventListener('click', () => goTo(current - 1));
    if(nextBtn) nextBtn.addEventListener('click', () => goTo(current + 1));
    
    slidesWrap.addEventListener('mouseenter', () => clearInterval(timer));
    slidesWrap.addEventListener('mouseleave', restartTimer);
    slidesWrap.setAttribute('tabindex', '0');
    slidesWrap.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft')  goTo(current - 1);
      if (e.key === 'ArrowRight') goTo(current + 1);
    });
    goTo(0);
  }

// 2. NEWS SECTION — 從 Google Sheet 公開 CSV 抓荒野活動資料
  var newsList = document.getElementById('news-list');
  if (newsList) {
    // ★ 將下方的 ID 替換為你的 Google Sheet「發布到網路」的連結 ID
    var SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR3vh68XSygvjgeGyOjZNAdcMFtxti62hWa0JEdBMWhyd33Eov0OUHICg27uf7Vxvq35RvYWZEZqVaf/pub?output=csv';

    function parseEventCSV(csvText) {
      csvText = csvText.replace(/^\uFEFF/, '').trim();
      if (!csvText) return [];
      var rows = [];
      var currentRow = [];
      var cell = '';
      var inQuote = false;
      for (var i = 0; i < csvText.length; i++) {
        var ch = csvText[i], nx = csvText[i + 1];
        if (ch === '"') {
          if (inQuote && nx === '"') { cell += '"'; i++; }
          else { inQuote = !inQuote; }
        } else if (ch === ',' && !inQuote) {
          currentRow.push(cell); cell = '';
        } else if ((ch === '\r' || ch === '\n') && !inQuote) {
          if (ch === '\r' && nx === '\n') i++;
          currentRow.push(cell); rows.push(currentRow);
          currentRow = []; cell = '';
        } else { cell += ch; }
      }
      if (cell || currentRow.length > 0) { currentRow.push(cell); rows.push(currentRow); }
      if (rows.length < 2) return [];
      var headers = rows[0].map(function(h) { return h.trim(); });
      var data = [];
      for (var r = 1; r < rows.length; r++) {
        if (rows[r].join('').trim() === '') continue;
        var obj = {};
        headers.forEach(function(h, idx) { obj[h] = rows[r][idx] ? rows[r][idx].trim() : ''; });
        data.push(obj);
      }
      return data;
    }

    fetch(SHEET_CSV_URL)
      .then(function(res) { return res.text(); })
      .then(function(csv) {
        var events = parseEventCSV(csv);
        events = events.slice(0, 3);
        newsList.style.opacity = '0';
        setTimeout(function() {
          if (events.length === 0) {
            newsList.innerHTML = '<li class="news-item"><p class="news-item__title">目前沒有活動消息</p></li>';
          } else {
            newsList.innerHTML = events.map(function(evt) {
              var title  = evt['活動名稱'] || '';
              var date   = evt['日期'] || '';
              var type   = evt['類型'] || '';
              var branch = evt['分會'] || '';
              var status = evt['狀態'] || '';
              var link   = evt['連結'] || '#';
              var desc   = [type].filter(function(s) { return s; }).join(' · ');
              return '<li class="news-item">' +
                '<a href="' + link + '" target="_blank" style="display:block;text-decoration:none;color:inherit;" aria-label="' + title + '">' +
                  '<p class="news-item__title">' + title +
                    ' <br><br><span class="news-item__meta" style="font-weight:400;"><b>｜時間：</b>' + date + '</span>' +
                  '</p>' +
                  '<p class="news-item__desc"><b>｜類型：</b>' + desc + '</p>' +
                '</a></li>';
            }).join('');
          }
          newsList.style.transition = 'opacity 0.4s';
          newsList.style.opacity = '1';
        }, 200);
      })
      .catch(function() {
        newsList.innerHTML = '<li class="news-item"><p class="news-item__title">活動資料載入失敗，請稍後再試</p></li>';
      });
  }


  // 3. MAP BUTTON BINDING (修復 inline onclick)
  const mapBtn = document.getElementById('map-btn');
  if (mapBtn) {
    mapBtn.addEventListener('click', () => {
      location.href = 'about.html#about-map';
    });
  }

  // 4. SPECIES FLIP CARD (Mobile Delegation)
  const speciesGrid = document.getElementById('species-grid');
  if (speciesGrid) {
    speciesGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.species-card');
      if (!card) return;
      const isFlipped = card.classList.contains('is-flipped');
      speciesGrid.querySelectorAll('.species-card').forEach(c => c.classList.remove('is-flipped'));
      if (!isFlipped) card.classList.add('is-flipped');
    });
  }
})();