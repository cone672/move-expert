const INTERVAL_MS = 4000;

function setupSlider(slider) {
  const slides = Array.from(slider.querySelectorAll(".image-slider-slide"));
  const dotsWrap = slider.querySelector(".image-slider-dots");
  if (slides.length <= 1) return;

  const dots = slides.map((_, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "image-slider-dot";
    dot.setAttribute("aria-label", `Slika ${i + 1}`);
    dot.addEventListener("click", () => goTo(i));
    dotsWrap.appendChild(dot);
    return dot;
  });

  let index = 0;
  let timer;

  function show(i) {
    slides.forEach((slide, n) => slide.classList.toggle("is-active", n === i));
    dots.forEach((dot, n) => dot.classList.toggle("is-active", n === i));
  }

  function goTo(i) {
    index = i;
    show(index);
    restart();
  }

  function advance() {
    index = (index + 1) % slides.length;
    show(index);
  }

  function restart() {
    clearInterval(timer);
    timer = setInterval(advance, INTERVAL_MS);
  }

  show(index);
  restart();

  slider.addEventListener("mouseenter", () => clearInterval(timer));
  slider.addEventListener("mouseleave", restart);
}

function init() {
  document.querySelectorAll(".image-slider").forEach(setupSlider);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
