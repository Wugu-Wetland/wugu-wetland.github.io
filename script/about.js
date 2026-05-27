(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const mapContainer = document.getElementById('about-map-container');
    if (!mapContainer) return;
    mapContainer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
      }
    });
  });
})();