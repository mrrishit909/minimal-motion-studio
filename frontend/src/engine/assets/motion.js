// Motion (Web Animations API), values from the tokens CSS. The page is complete without it:
// animations start from hidden with fill "backwards"; CSS never hides anything.
(() => {
  // Studio preview (about:srcdoc, blob:): "#id" would resolve against the studio, so scroll here.
  if (/^(about|blob):$/.test(location.protocol)) {
    document.addEventListener("click", (e) => {
      const a = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
      const target = a && document.getElementById((a.getAttribute("href") ?? "").slice(1));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView();
      target.focus({ preventScroll: true });
    });
  }
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const read = (/** @type {string} */ n) => css.getPropertyValue(n).trim();
  const ms = (/** @type {string} */ n) => parseFloat(read(n)) || 0;
  const dur = ms("--m-duration");
  if (read("--m-preset") === "still" || !dur || root.dataset.motion === "reduce" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches || !root.animate) return;
  const fast = ms("--m-fast");
  const dist = ms("--m-distance");
  const stagger = ms("--m-stagger");
  let easing = read("--m-easing");
  try { new KeyframeEffect(null, null, { easing }); } catch { easing = "ease-out"; }

  /** @param {Element[]} els */
  const rise = (els) => els.forEach((el, i) => el.animate(
    [{ opacity: 0, transform: `translateY(${dist}px)` }, { opacity: 1, transform: "none" }],
    { duration: dur, easing, delay: Math.min(i, 8) * stagger, fill: "backwards" }));
  const parts = (/** @type {Element | null} */ el) => (el ? [...el.querySelectorAll("[data-m]")] : []);

  // Entry: header, hero, then any section already on screen. Other sections rise once, on first view.
  const header = document.querySelector("body > header");
  const later = [...document.querySelectorAll("[data-reveal]")];
  const now = later.filter((s) => s.getBoundingClientRect().top < innerHeight);
  rise([...(header ? [header] : []), ...parts(document.querySelector(".hero")), ...now.flatMap(parts)]);
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { io.unobserve(e.target); rise(parts(e.target)); }
  }));
  later.filter((s) => !now.includes(s)).forEach((s) => io.observe(s));
  // Anchor jumps land on finished content.
  document.addEventListener("click", (e) => {
    if (e.target instanceof Element && e.target.closest('a[href^="#"]')) io.disconnect();
  });

  // Questions: state is set at once (Enter/Space arrive as a click); height and opacity follow;
  // a new toggle cancels the running one and starts where it was.
  for (const d of document.querySelectorAll("details")) {
    const summary = d.querySelector("summary");
    const body = summary && summary.nextElementSibling;
    if (!summary || !body) continue;
    /** @type {Animation[]} */
    let running = [];
    summary.addEventListener("click", (e) => {
      e.preventDefault();
      const from = d.offsetHeight;
      const fade = d.open || d.classList.contains("is-closing") ? getComputedStyle(body).opacity : "0";
      running.forEach((a) => a.cancel());
      const open = !d.open;
      d.open = open;
      d.classList.remove("is-closing");
      const to = d.offsetHeight;
      if (!open) d.classList.add("is-closing");
      const timing = { duration: open ? Math.round(dur * 0.6) : fast, easing };
      running = [
        d.animate([{ height: `${from}px`, overflow: "hidden" }, { height: `${to}px`, overflow: "hidden" }], timing),
        body.animate([{ opacity: fade }, { opacity: open ? 1 : 0 }], timing),
      ];
      const done = () => d.classList.remove("is-closing");
      running[0]?.finished.then(done, () => {});
    });
  }
})();
