const btn = document.getElementById("floatTop");
if (btn) {
  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  window.addEventListener(
    "scroll",
    () => btn.classList.toggle("visible", window.scrollY > 300),
    { passive: true }
  );
}
