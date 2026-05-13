/* ======================================================================
   VNS Logistics — Canvas Scroll Animation (Smooth rAF Loop)
   Draws pre-extracted frames to a canvas, bound to scroll position.
   Uses GSAP ScrollTrigger for progress; rAF loop for smooth interpolation.
   ====================================================================== */

(function () {
  'use strict';

  const FRAME_COUNT = 160;
  const section = document.getElementById('video-scroll');
  const canvas = document.getElementById('scroll-canvas');
  if (!canvas) return;
  if (!section || section.offsetParent === null || getComputedStyle(section).display === 'none') return;
  if (!window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  const ctx = canvas.getContext('2d');
  const frames = [];
  let loadedCount = 0;
  let scrollReady = false;

  let targetFrame = 0;
  let currentFrame = 0;
  let lastDrawnFrame = -1;

  function framePath(i) {
    return `frames/frame_${String(i).padStart(4, '0')}.png`;
  }

  function drawFrame(index) {
    const img = frames[index];
    if (!img || !img.complete) return;

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;

    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    lastDrawnFrame = index;
  }

  function animate() {
    currentFrame += (targetFrame - currentFrame) * 0.12;
    const frameIndex = Math.round(currentFrame);
    if (frameIndex !== lastDrawnFrame && frames[frameIndex] && frames[frameIndex].complete) {
      drawFrame(frameIndex);
    }
    requestAnimationFrame(animate);
  }

  function preloadFrames() {
    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.src = framePath(i);
      img.onload = function () {
        loadedCount++;
        if (loadedCount === 1) drawFrame(0);
        if (!scrollReady && loadedCount >= Math.min(12, FRAME_COUNT)) setupScroll();
      };
      frames.push(img);
    }
  }

  function setupScroll() {
    scrollReady = true;
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#video-scroll',
        start: 'top top',
        end: 'bottom bottom',
        pin: '#video-scroll .video-scroll-sticky',
        scrub: 0.5,
        onUpdate: function (self) {
          targetFrame = Math.round(self.progress * (FRAME_COUNT - 1));
        }
      }
    });

    const texts = document.querySelectorAll('#video-scroll .video-text');
    texts.forEach(function (text) {
      tl.fromTo(text,
        { opacity: 0, x: -60 },
        { opacity: 1, x: 0, duration: 1 }
      )
      .to(text,
        { opacity: 0, x: 60, duration: 1 },
        '+=1.5'
      );
    });
  }

  window.addEventListener('resize', function () {
    lastDrawnFrame = -1;
    var idx = Math.max(0, Math.min(Math.round(currentFrame), FRAME_COUNT - 1));
    drawFrame(idx);
  });

  animate();
  preloadFrames();
})();
