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

  // 2. NEWS SECTION Mock Data
  const newsList = document.getElementById('news-list');
  if (newsList) {
    const MOCK_DATA = {
      status: 'success',
      data: [
        { title_zh: '測試消息', date_zh: '2025/04/20', desc_zh: '文字文字文字文字...', url: '#' },
        { title_zh: '測試消息', date_zh: '2025/04/20', desc_zh: '文字文字文字文字...', url: '#' },
        { title_zh: '測試消息', date_zh: '2025/03/20', desc_zh: '文字文字文字文字...', url: '#' }
      ]
    };

    setTimeout(() => {
      newsList.style.opacity = '0';
      setTimeout(() => {
        newsList.innerHTML = MOCK_DATA.data.map(item => `
        <li class="news-item">
          <a href="${item.url}" style="display:block;text-decoration:none;color:inherit;" aria-label="${item.title_zh}">
            <p class="news-item__title">${item.title_zh} <span class="news-item__meta" style="font-weight:400;margin-left:8px;">${item.date_zh}</span></p>
            <p class="news-item__desc">${item.desc_zh}</p>
          </a>
        </li>`).join('');
        newsList.style.transition = 'opacity 0.4s';
        newsList.style.opacity = '1';
      }, 200);
    }, 800);
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