let started = false;

function splitLines(h: HTMLElement) {
  const raw = h.dataset.html || h.innerHTML;
  const lines = raw.split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean);
  h.innerHTML = lines.map((l) => `<span class="line"><span class="line-in">${l}</span></span>`).join('');
}

export function splitHeadlines(): void {
  document.querySelectorAll<HTMLElement>('.beat [data-split="lines"]').forEach(splitLines);
}

export function refreshCopy(): void {
  splitHeadlines();
  collectManifestos();
  lightWords();
}

type Manifesto = { section: HTMLElement; words: HTMLElement[] };
let manifestos: Manifesto[] = [];

function wrapWords(node: Node) {
  [...node.childNodes].forEach((child) => {
    if (child.nodeType === 3) {
      const frag = document.createDocumentFragment();
      (child.textContent || '').split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const w = document.createElement('span'); w.className = 'w'; w.textContent = part; frag.appendChild(w);
      });
      (child as Text).replaceWith(frag);
    } else if (child.nodeType === 1) wrapWords(child);
  });
}

function collectManifestos() {
  manifestos = [...document.querySelectorAll<HTMLElement>('[data-words]')].map((el) => {
    const raw = el.dataset.html;
    if (raw) el.innerHTML = raw;
    wrapWords(el);
    return { section: (el.closest('section') || el) as HTMLElement, words: [...el.querySelectorAll<HTMLElement>('.w')] };
  });
}

function lightWords() {
  const h = innerHeight;
  manifestos.forEach((m) => {
    const r = m.section.getBoundingClientRect();
    if (r.bottom < 0 || r.top > h) return;
    const p = Math.min(1, Math.max(0, (h * 0.8 - r.top) / (r.height + h * 0.45)));
    const n = m.words.length;
    m.words.forEach((w, i) => w.style.setProperty('--lit', p * (n + 1) > i + 1 ? '1' : '0'));
  });
}

export function initScrub(): void {
  if (started) return;
  started = true;
  const TOUCH = matchMedia('(pointer: coarse)').matches;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LERP = TOUCH ? 0.03 : 0.02;
  const FADE = 0.10;
  const STAGGER = 0.035;
  const NEAR = '120% 0px';
  const FAR = '260% 0px';
  const EPS = 1 / 60;
  const CREEP = TOUCH ? 0.012 : 0.010;

  const chapterEls = [...document.querySelectorAll<HTMLElement>('.chapter')];
  if (!chapterEls.length) return;
  if (REDUCED) { chapterEls.forEach((el) => el.classList.add('is-static')); return; }
  if (TOUCH) chapterEls.forEach((el) => el.classList.add('is-touch'));

  splitHeadlines();

  const chapters: any[] = chapterEls.map((el) => ({
    el,
    stage: el.querySelector('.stage') as HTMLElement,
    beats: [...el.querySelectorAll<HTMLElement>('.beat')].map((b) => ({
      el: b,
      from: parseFloat(b.dataset.from || '0') || 0,
      to: b.dataset.to ? parseFloat(b.dataset.to) : 1,
      parts: [...b.children].filter((c) => !c.classList.contains('chips')) as HTMLElement[],
      chips: [...b.querySelectorAll<HTMLElement>('.chips li')],
    })),
    src: el.dataset.video,
    tIn: parseFloat(el.dataset.in || '0') || 0,
    tOut: parseFloat(el.dataset.out || '0') || 0,
    video: null as HTMLVideoElement | null,
    current: 0,
    rolling: false,
  }));

  const afterLCP = new Promise<void>((res) => {
    if (document.readyState === 'complete') res(); else addEventListener('load', () => res(), { once: true });
  }).then(() => new Promise<void>((res) => {
    if ('requestIdleCallback' in window) (window as any).requestIdleCallback(() => res(), { timeout: 1500 });
    else setTimeout(res, 300);
  }));

  function detach(c: any) {
    if (!c || !c.video) return;
    c.stage.classList.remove('is-live');
    c.video.removeAttribute('src');
    c.video.load();
    c.video.remove();
    c.video = null;
  }

  function warmUp(c: any, v: HTMLVideoElement) {
    const roll = () => {
      if (c.video !== v || c.rolling || v.readyState >= 2) return;
      c.rolling = true; v.loop = true;
      v.play().catch(() => { c.el.classList.add('is-static'); detach(c); });
    };
    const p = v.play();
    if (p && p.then) p.then(() => { if (!c.rolling) v.pause(); }).catch(roll);
    setTimeout(roll, 4000);
  }

  async function attach(c: any) {
    if (!c || c.video) return;
    await afterLCP;
    if (c.video || !c.el.isConnected) return;
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    (v as any).disablePictureInPicture = true; v.tabIndex = -1;
    v.setAttribute('aria-hidden', 'true');
    v.src = c.src;
    v.addEventListener('loadeddata', () => { c.stage.classList.add('is-live'); }, { once: true });
    v.addEventListener('error', () => { c.el.classList.add('is-static'); detach(c); }, { once: true });
    c.stage.insertBefore(v, c.stage.querySelector('.veil'));
    c.video = v;
    if (TOUCH) warmUp(c, v);
  }

  const find = (t: Element) => chapters.find((c) => c.el === t);
  const near = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) attach(find(e.target)); }), { rootMargin: NEAR });
  const far = new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting) detach(find(e.target)); }), { rootMargin: FAR });
  chapters.forEach((c) => { near.observe(c.el); far.observe(c.el); });

  function applyVideo(v: HTMLVideoElement | null, t: number) {
    if (!v || !Number.isFinite(v.duration) || v.seeking) return;
    if (Math.abs(v.currentTime - t) < EPS) return;
    v.currentTime = t;
  }

  const progressOf = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const travel = r.height - innerHeight;
    return travel <= 0 ? 0 : Math.min(1, Math.max(0, -r.top / travel));
  };
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const ease = (x: number) => 1 - (1 - x) ** 3;

  function setState(el: HTMLElement, o: number, leaving: boolean) {
    el.style.setProperty('--o', o.toFixed(3));
    el.style.setProperty('--o-inv', (1 - o).toFixed(3));
    el.style.setProperty('--dir', leaving ? '1' : '-1');
  }
  function drive(el: HTMLElement, local: number, i: number, n: number, first: boolean, last: boolean) {
    const tIn = first ? 1 : clamp01((local - i * STAGGER) / FADE);
    const tOut = last ? 1 : clamp01((1 - local - (n - 1 - i) * STAGGER) / FADE);
    setState(el, ease(Math.min(tIn, tOut)), tOut < 1);
  }

  function applyBeats(c: any) {
    c.beats.forEach((b: any) => {
      const span = b.to - b.from;
      const local = span > 0 ? (c.current - b.from) / span : 0;
      const inside = local >= 0 && local <= 1;
      const first = b.from <= 0; const last = b.to >= 1;
      const held = (local < 0 && first) || (local > 1 && last);
      const lines = [...(b.el as HTMLElement).querySelectorAll<HTMLElement>('.line-in')];
      b.el.style.setProperty('--local', clamp01(local).toFixed(3));
      if (!inside) {
        [...b.parts, ...lines, ...b.chips].forEach((el: HTMLElement) => setState(el, held ? 1 : 0, local > 1));
      } else {
        b.parts.forEach((el: HTMLElement, i: number) => drive(el, local, i, b.parts.length, first, last));
        lines.forEach((el: HTMLElement, i: number) => drive(el, local, i * 0.8, lines.length * 0.8, first, last));
        b.chips.forEach((el: HTMLElement, i: number) => drive(el, local, 2 + i, 2 + b.chips.length, first, last));
      }
      const edge = inside ? Math.min(first ? 1 : clamp01(local / FADE), last ? 1 : clamp01((1 - local) / FADE)) : 0;
      b.el.classList.toggle('is-on', held || edge > 0.5);
      b.el.classList.toggle('is-leaving', inside && !last && 1 - local < FADE + STAGGER * 4);
    });
  }

  document.querySelectorAll<HTMLAnchorElement>('a[data-progress]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const c = chapters[0];
      const p = parseFloat(a.dataset.progress || '0') || 0;
      const top = c.el.getBoundingClientRect().top + scrollY;
      const travel = c.el.offsetHeight - innerHeight;
      e.preventDefault();
      scrollTo({ top: top + travel * Math.min(p + 0.02, 1), behavior: 'smooth' });
    });
  });

  function glide(c: any, span: number) {
    const gap = progressOf(c.el) - c.current;
    let step = gap * LERP;
    if (span > 0) {
      const rest = Math.abs(gap) * span;
      const floor = CREEP / span;
      if (rest < EPS) step = gap;
      else if (Math.abs(step) < floor) step = Math.sign(gap) * Math.min(floor, Math.abs(gap));
    }
    c.current += step;
  }

  let raf = 0;
  function tick() {
    chapters.forEach((c) => {
      const out = c.video && !c.rolling ? (c.tOut || c.video.duration || 0) : 0;
      const span = Math.max(0, out - c.tIn);
      glide(c, span);
      const r = c.el.getBoundingClientRect();
      if (!(r.top < innerHeight * 0.5 && r.bottom > innerHeight * 0.5)) return;
      applyBeats(c);
      c.el.style.setProperty('--t', clamp01(c.current).toFixed(4));
      if (span > 0) applyVideo(c.video, c.tIn + c.current * span);
    });
    raf = requestAnimationFrame(tick);
  }
  const inView = new Set<Element>();
  const run = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) inView.add(e.target); else inView.delete(e.target); });
    if (inView.size && !raf) raf = requestAnimationFrame(tick);
    if (!inView.size && raf) { cancelAnimationFrame(raf); raf = 0; }
  });
  chapters.forEach((c) => run.observe(c.el));

  if (matchMedia('(pointer: fine)').matches) {
    const root = document.documentElement;
    const MLERP = 0.08;
    let tx = 0; let ty = 0; let mx = 0; let my = 0; let mraf = 0;
    const settle = () => {
      mx += (tx - mx) * MLERP; my += (ty - my) * MLERP;
      root.style.setProperty('--mx', mx.toFixed(3));
      root.style.setProperty('--my', my.toFixed(3));
      mraf = Math.abs(tx - mx) + Math.abs(ty - my) > 0.002 ? requestAnimationFrame(settle) : 0;
    };
    const aim = (x: number, y: number) => { tx = x; ty = y; if (!mraf) mraf = requestAnimationFrame(settle); };
    addEventListener('pointermove', (e) => aim((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1), { passive: true });
    document.addEventListener('mouseleave', () => aim(0, 0));
  }
}

let revealIO: IntersectionObserver | null = null;

/**
 * Reveals [data-reveal] blocks currently on screen.
 * Safe to call again after a route change: every new element is picked up
 * once, and elements already revealed keep their state.
 */
export function initReveal(): void {
  const targets = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];
  if (!targets.length) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }
  if (!revealIO) {
    revealIO = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      revealIO?.unobserve(entry.target);
    }), { rootMargin: '0px 0px -12% 0px' });
  }
  targets.forEach((el) => {
    if (el.classList.contains('is-in') || el.dataset.revealBound === '1') return;
    el.dataset.revealBound = '1';
    const sibs = el.parentElement ? [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal')) : [];
    el.style.setProperty('--i', String(Math.max(0, sibs.indexOf(el))));
    revealIO?.observe(el);
  });
}

let panelsStarted = false;
export function initPanels(): void {
  if (panelsStarted) return;
  panelsStarted = true;
  const nav = document.querySelector('.nav');
  if (nav) {
    const f = () => nav.classList.toggle('is-solid', scrollY > 24);
    addEventListener('scroll', f, { passive: true }); f();
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  initReveal();

  const layers = [...document.querySelectorAll<HTMLElement>('[data-parallax]')];
  let raf = 0;
  const paint = () => {
    raf = 0;
    const h = innerHeight;
    layers.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -h || r.top > 2 * h) return;
      const centre = (r.top + r.height / 2 - h / 2) / h;
      let speed = parseFloat(el.dataset.parallax || '0.32');
      if (el.classList.contains('panel-bg') && innerWidth < 780) speed = Math.min(speed, 0.22);
      el.style.setProperty('--py', `${(centre * -speed * h).toFixed(1)}px`);
    });
  };

  const soften = (el: any) => {
    const nw = el.naturalWidth || el.videoWidth; const nh = el.naturalHeight || el.videoHeight;
    if (!nw || !nh) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const factor = Math.max(r.width / nw, r.height / nh);
    const px = factor <= 1.15 ? 0 : Math.min(1.6, Math.max(0.4, (factor - 1) * 1.2));
    el.style.setProperty('--soften', `${px.toFixed(2)}px`);
  };
  const SOFT = '.stage video, .plate, .panel-bg';
  const softenAll = () => document.querySelectorAll(SOFT).forEach(soften);
  const onLoad = (e: Event) => { const t = e.target as Element; if (t && t.matches && t.matches(SOFT)) soften(t); };
  document.addEventListener('load', onLoad, true);
  document.addEventListener('loadedmetadata', onLoad, true);
  addEventListener('resize', softenAll);
  softenAll();

  collectManifestos();
  addEventListener('scroll', () => requestAnimationFrame(lightWords), { passive: true });
  lightWords();
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(paint); }, { passive: true });
  addEventListener('resize', paint);
  paint();
}