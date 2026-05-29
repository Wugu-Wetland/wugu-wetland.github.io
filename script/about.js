(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const mapContainer = document.getElementById('about-map-container');
    const markers = document.querySelectorAll('.about-map__marker');
    const backdrop = document.getElementById('map-info-backdrop');
    const infoCard = document.getElementById('map-info-card');
    const titleEl = document.getElementById('map-info-title');
    const descEl = document.getElementById('map-info-desc');
    const closeBtn = document.getElementById('map-info-close');
    
    // ✨ 新增：取得圖片容器與圖片本身的 DOM
    const imgWrap = document.getElementById('map-info-img-wrap');
    const imgEl = document.getElementById('map-info-img');

    if (!mapContainer || !infoCard) return;

    function openInfoCard(marker) {
      // 1. 取得資料
      const title = marker.getAttribute('data-title') || '尚未設定標題';
      const desc = marker.getAttribute('data-desc') || '尚未設定內容。';
      const imgSrc = marker.getAttribute('data-image'); // ✨ 取得圖片路徑

      // 2. 抽換文字
      titleEl.textContent = title;
      descEl.textContent = desc;

      // 3. ✨ 抽換圖片與顯示邏輯
      if (imgSrc) {
        // 如果有圖片路徑，就替換 src，並顯示圖片區塊
        imgEl.src = imgSrc;
        imgEl.alt = title; // 無障礙優化：把標題設為圖片的替代文字
        imgWrap.style.display = 'block';
      } else {
        // 如果沒有圖片，就清空 src 並隱藏圖片區塊，只顯示文字
        imgEl.src = '';
        imgWrap.style.display = 'none';
      }

      // 4. 觸發顯示動畫
      backdrop.classList.add('is-active');
      infoCard.classList.add('is-active');
      infoCard.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      setTimeout(() => closeBtn.focus(), 100);
    }

    function closeInfoCard() {
      backdrop.classList.remove('is-active');
      infoCard.classList.remove('is-active');
      infoCard.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      mapContainer.focus();
    }

    markers.forEach(marker => {
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        openInfoCard(marker);
      });
      marker.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          openInfoCard(marker);
        }
      });
    });

    backdrop.addEventListener('click', closeInfoCard);
    closeBtn.addEventListener('click', closeInfoCard);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && infoCard.classList.contains('is-active')) {
        closeInfoCard();
      }
    });

  });
})();