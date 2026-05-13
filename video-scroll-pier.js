(function () {
  'use strict';

  const section = document.getElementById('video-scroll-pier');
  const video = document.getElementById('pier-video');
  if (!video) return;
  if (!section || section.offsetParent === null || getComputedStyle(section).display === 'none') return;
  if (!window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  // Keep paused — we control time manually via scroll
  video.pause();

  let requestedTime = 0;
  let lastAppliedTime = -1;
  let frameRequest = null;

  function applyRequestedTime() {
    frameRequest = null;
    if (!video.duration || isNaN(video.duration)) return;
    if (Math.abs(requestedTime - lastAppliedTime) < 0.04) return;
    lastAppliedTime = requestedTime;
    video.currentTime = requestedTime;
  }

  function scheduleVideoTime(time) {
    requestedTime = time;
    if (frameRequest !== null) return;
    frameRequest = requestAnimationFrame(applyRequestedTime);
  }

  function setup() {
    const duration = video.duration;
    if (!duration || isNaN(duration)) return;

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#video-scroll-pier',
        start: 'top top',
        end: 'bottom bottom',
        pin: '#video-scroll-pier .video-scroll-sticky',
        scrub: 0.5,
        onUpdate: function (self) {
          scheduleVideoTime(self.progress * duration);
        }
      }
    });

    const texts = document.querySelectorAll('#video-scroll-pier .video-text');
    texts.forEach(function (text) {
      tl.fromTo(text, { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 1 })
        .to(text, { opacity: 0, x: 60, duration: 1 }, '+=1.5');
    });
  }

  if (video.readyState >= 1) {
    setup();
  } else {
    video.addEventListener('loadedmetadata', setup, { once: true });
  }
})();
