/* ======================================================================
   VNS Logistics — Parallax & Scroll Animations
   Adds depth, motion, and immersive scrolling effects.
   ====================================================================== */

(function () {
  'use strict';

  /* ---------- Smooth Reveal on Scroll ---------- */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  /* ---------- Parallax Scroll ---------- */
  const parallaxElements = [];

  function registerParallax(selector, speed, direction = 'y') {
    document.querySelectorAll(selector).forEach(el => {
      parallaxElements.push({ el, speed, direction });
    });
  }

  // Register elements for parallax motion
  registerParallax('.hero-visual', 0.15, 'y');
  registerParallax('.hero-copy', -0.05, 'y');
  registerParallax('.route-map', 0.08, 'y');
  registerParallax('.dashboard-card', -0.12, 'y');
  registerParallax('.truck-card', 0.1, 'y');
  registerParallax('.status-card', -0.08, 'y');
  registerParallax('.monitor-card', 0.1, 'y');

  // Parallax image dividers
  document.querySelectorAll('.parallax-image-divider img').forEach(img => {
    parallaxElements.push({ el: img, speed: -0.2, direction: 'y' });
  });

  /* ---------- Counter Animation ---------- */
  function animateCounters() {
    document.querySelectorAll('.fleet-stats strong').forEach(el => {
      if (el.dataset.counted) return;
      const text = el.textContent.trim();
      const match = text.match(/^(\d+)/);
      if (!match) return;
      const target = parseInt(match[1], 10);
      const suffix = text.replace(match[1], '');
      el.dataset.counted = 'true';
      let current = 0;
      const step = Math.max(1, Math.ceil(target / 60));
      const timer = setInterval(() => {
        current = Math.min(current + step, target);
        el.textContent = current + suffix;
        if (current >= target) clearInterval(timer);
      }, 20);
    });
  }

  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounters();
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  const fleetSection = document.getElementById('fleet');
  if (fleetSection) counterObserver.observe(fleetSection);

  /* ---------- Sticky Header Shrink ---------- */
  const header = document.querySelector('.site-header');

  /* ---------- Main Scroll Handler ---------- */
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const scrollY = window.scrollY;

      // Parallax transforms
      parallaxElements.forEach(({ el, speed }) => {
        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const viewCenter = window.innerHeight / 2;
        const offset = (center - viewCenter) * speed;
        el.style.transform = `translate3d(0, ${offset}px, 0)`;
      });

      // Header shrink
      if (header) {
        header.classList.toggle('header-scrolled', scrollY > 80);
      }

      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Page Load Animation ---------- */
  window.addEventListener('load', () => {
    document.body.classList.add('page-loaded');
  });
})();
