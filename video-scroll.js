/* ======================================================================
   VNS Logistics — Canvas Scroll Animation (Optimized)
   Draws pre-extracted frames to a canvas, bound to scroll position.
   Uses GSAP ScrollTrigger only — no Lenis (conflicts with parallax.js).
   ====================================================================== */

(function () {
  'use strict';

  gsap.registerPlugin(ScrollTrigger);

  const FRAME_COUNT = 96;
  const canvas = document.getElementById('scroll-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const frames = [];
  let loadedCount = 0;
  let currentFrame = -1;

  function framePath(i) {
    return `frames/frame_${String(i).padStart(4, '0')}.webp`;
  }

  function drawFrame(index) {
    if (index === currentFrame) return;
    const img = frames[index];
    if (!img || !img.complete) return;
    currentFrame = index;

    // Use 1x resolution for performance
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    // Cover-fit
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  function preloadFrames() {
    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.src = framePath(i);
      img.onload = () => {
        loadedCount++;
        if (loadedCount === 1) drawFrame(0);
        if (loadedCount === FRAME_COUNT) setupScroll();
      };
      frames.push(img);
    }
  }

  function setupScroll() {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '.video-scroll-section',
        start: 'top top',
        end: 'bottom bottom',
        pin: '.video-scroll-sticky',
        scrub: 0.5,
        onUpdate: (self) => {
          const idx = Math.min(FRAME_COUNT - 1, Math.floor(self.progress * FRAME_COUNT));
          drawFrame(idx);
        }
      }
    });

    // Text overlays sequentially
    const texts = document.querySelectorAll('.video-text');
    texts.forEach((text, i) => {
      // Fade in and slide right
      tl.fromTo(text, 
        { opacity: 0, x: -60 }, 
        { opacity: 1, x: 0, duration: 1 }
      )
      // Hold for a moment, then fade out and slide right
      .to(text, 
        { opacity: 0, x: 60, duration: 1 }, 
        "+=1.5"
      );
    });
  }

  window.addEventListener('resize', () => { currentFrame = -1; drawFrame(Math.max(0, currentFrame)); });
  preloadFrames();
})();
