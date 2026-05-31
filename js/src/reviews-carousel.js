const INTERVAL_MS = 10000;
const TRANSITION_MS = 600;
const VISIBLE = 2;

function init() {
  const viewport = document.querySelector(".google-reviews-viewport");
  const track = viewport?.querySelector(".google-reviews-track");
  if (!viewport || !track) return;

  const originals = Array.from(track.children);
  if (originals.length <= VISIBLE) return;

  // Clone the first VISIBLE cards to the end so the wrap is seamless.
  originals.slice(0, VISIBLE).forEach((card) => {
    const clone = card.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    track.appendChild(clone);
  });

  const total = originals.length;
  let index = 0;
  let timer;

  const cardWidth = () => originals[0].getBoundingClientRect().width;
  const gap = () => parseFloat(getComputedStyle(track).columnGap) || 0;

  const applyTransform = (animated) => {
    track.style.transition = animated ? `transform ${TRANSITION_MS}ms ease` : "none";
    track.style.transform = `translateX(-${index * (cardWidth() + gap())}px)`;
  };

  const advance = () => {
    index++;
    applyTransform(true);
    if (index === total) {
      setTimeout(() => {
        index = 0;
        applyTransform(false);
      }, TRANSITION_MS);
    }
  };

  const start = () => {
    stop();
    timer = setInterval(advance, INTERVAL_MS);
  };
  const stop = () => timer && clearInterval(timer);

  applyTransform(false);
  start();

  viewport.addEventListener("mouseenter", stop);
  viewport.addEventListener("mouseleave", start);
  window.addEventListener("resize", () => applyTransform(false));
  document.addEventListener("visibilitychange", () =>
    document.hidden ? stop() : start()
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
