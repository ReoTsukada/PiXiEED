/*
 * PiXiEED v2 — lightweight motion engine.
 * Presentation only: adds/removes CSS classes and CSS custom properties
 * on elements that opt in via markup (.pxv2-reveal, .pxv2-mode-card).
 * Never touches data, forms, auth, or any element outside those classes.
 * Fully inert under prefers-reduced-motion.
 */
(function () {
  'use strict';

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_e) {}

  // ---- scroll reveal --------------------------------------------------
  var revealEls = document.querySelectorAll('.pxv2-reveal');
  if (revealEls.length) {
    if (reduceMotion || typeof IntersectionObserver !== 'function') {
      for (var i = 0; i < revealEls.length; i++) revealEls[i].classList.add('is-in');
    } else {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-in');
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.14, rootMargin: '0px 0px -8% 0px' }
      );
      revealEls.forEach(function (el) { io.observe(el); });
    }
  }

  // ---- pointer tilt on mode cards --------------------------------------
  var canTilt = false;
  try {
    canTilt = !reduceMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch (_e) {}

  if (canTilt) {
    document.querySelectorAll('.pxv2-mode-card').forEach(function (card) {
      var raf = null;
      var onMove = function (event) {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = null;
          var rect = card.getBoundingClientRect();
          var px = (event.clientX - rect.left) / rect.width - 0.5;
          var py = (event.clientY - rect.top) / rect.height - 0.5;
          card.style.setProperty('--pxv2-ry', (px * 7).toFixed(2) + 'deg');
          card.style.setProperty('--pxv2-rx', (py * -7).toFixed(2) + 'deg');
        });
      };
      var reset = function () {
        card.style.setProperty('--pxv2-ry', '0deg');
        card.style.setProperty('--pxv2-rx', '0deg');
      };
      card.addEventListener('pointermove', onMove);
      card.addEventListener('pointerleave', reset);
    });
  }
})();
