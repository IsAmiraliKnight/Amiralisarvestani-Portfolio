/**
 * Infinite, draggable "dome" grid of project images.
 * Each tile's four corners are pushed outward (barrel/dome distortion) and
 * bulged around the cursor (magnifier lens), then mapped onto the tile with a
 * CSS matrix3d homography — no WebGL needed.
 */

const BARREL = 0.15; // how curved the dome is
const LENS = 0.25; // strength of the magnifier under the cursor
const LENS_RADIUS = 1.5; // lens size, in tiles
const EASE = 0.1; // drag smoothing
const LENS_EASE = 0.08;
const TAP_DISTANCE = 6;
const TAP_TIME = 450;

type Pt = { x: number; y: number };
type Tile = { el: HTMLElement; col: number; row: number };

const wrap = (min: number, max: number, v: number) => {
  const r = max - min;
  return min + ((((v - min) % r) + r) % r);
};
// frame-rate independent lerp
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.pow(1 - k, dt * 60));

function homography(S: number, p0: Pt, p1: Pt, p2: Pt, p3: Pt) {
  // unit square (tl, tr, br, bl) → quad
  const dx1 = p1.x - p2.x,
    dy1 = p1.y - p2.y,
    dx2 = p3.x - p2.x,
    dy2 = p3.y - p2.y,
    sx = p0.x - p1.x + p2.x - p3.x,
    sy = p0.y - p1.y + p2.y - p3.y;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-6;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  const a = p1.x - p0.x + g * p1.x,
    b = p3.x - p0.x + h * p3.x,
    d = p1.y - p0.y + g * p1.y,
    e = p3.y - p0.y + h * p3.y;
  return `matrix3d(${a / S},${d / S},0,${g / S},${b / S},${e / S},0,${h / S},0,0,1,0,${p0.x},${p0.y},0,1)`;
}

export function initDome(stage: HTMLElement) {
  const list = stage.querySelector<HTMLElement>('[data-dome-list]')!;
  const label = stage.querySelector<HTMLElement>('[data-dome-label]');
  const sources = [...list.querySelectorAll<HTMLElement>('[data-dome-item]')];
  if (!sources.length) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const dragSpeed = finePointer ? 1.5 : 2.5;

  let tiles: Tile[] = [];
  let W = 0,
    H = 0,
    step = 0,
    gap = 0,
    size = 0,
    cols = 0,
    rows = 0;

  const pos = { tx: 0, ty: 0, x: 0, y: 0 };
  const mouse = { tx: 0, ty: 0, x: 0, y: 0, on: 0, k: 0 };
  let running = false;
  let paused = false;
  let last = 0;
  let raf = 0;

  function build() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    if (!W || !H) return;
    const perRow = Math.min(9, Math.max(3, Math.round(W / 280)));
    step = W / perRow;
    gap = Math.max(12, Math.min(24, W * 0.015));
    size = step - gap;
    cols = perRow + 3;
    rows = Math.ceil(H / step) + 3;

    const n = sources.length;
    const els: HTMLElement[] = [];
    tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (c + r * 3) % n;
        const el = els.length < n && !els.includes(sources[i]) ? sources[i] : (sources[i].cloneNode(true) as HTMLElement);
        el.style.width = el.style.height = `${size}px`;
        els.push(el);
        tiles.push({ el, col: c, row: r });
      }
    }
    list.replaceChildren(...els);
    render();
  }

  function distort(x: number, y: number): Pt {
    const hx = W / 2,
      hy = H / 2;
    const nx = x / hx,
      ny = y / hy;
    const f = 1 + BARREL * (nx * nx + ny * ny);
    let X = x * f,
      Y = y * f;
    if (mouse.k > 0.001) {
      const dx = X - mouse.x,
        dy = Y - mouse.y,
        r = LENS_RADIUS * step;
      const s = LENS * mouse.k * Math.exp(-(dx * dx + dy * dy) / (r * r));
      X += dx * s;
      Y += dy * s;
    }
    return { x: X + hx, y: Y + hy };
  }

  function render() {
    const gw = cols * step,
      gh = rows * step,
      g = gap / 2;
    // tile centers wrap around the screen center, so the grid is infinite
    for (const t of tiles) {
      const x = wrap(-gw / 2, gw / 2, t.col * step + pos.x) - step / 2,
        y = wrap(-gh / 2, gh / 2, t.row * step + pos.y) - step / 2;
      const p0 = distort(x + g, y + g),
        p1 = distort(x + step - g, y + g),
        p2 = distort(x + step - g, y + step - g),
        p3 = distort(x + g, y + step - g);
      t.el.style.transform = homography(size, p0, p1, p2, p3);
    }
  }

  function tick(now: number) {
    const dt = last ? Math.min(Math.max(0, now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    const speed = Math.abs(pos.tx - pos.x) + Math.abs(pos.ty - pos.y);
    const lensTarget = mouse.on / (1 + speed / 40);
    if (reduce) {
      pos.x = pos.tx;
      pos.y = pos.ty;
      mouse.k = 0;
    } else {
      pos.x = damp(pos.x, pos.tx, EASE, dt);
      pos.y = damp(pos.y, pos.ty, EASE, dt);
      mouse.x = damp(mouse.x, mouse.tx, 0.12, dt);
      mouse.y = damp(mouse.y, mouse.ty, 0.12, dt);
      mouse.k = damp(mouse.k, lensTarget, LENS_EASE, dt);
    }
    render();
    const settled =
      Math.abs(pos.tx - pos.x) < 0.1 &&
      Math.abs(pos.ty - pos.y) < 0.1 &&
      Math.abs(mouse.tx - mouse.x) < 0.1 &&
      Math.abs(mouse.ty - mouse.y) < 0.1 &&
      Math.abs(lensTarget - mouse.k) < 0.001;
    if (settled || paused) {
      running = false;
      last = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  const wake = () => {
    if (running || paused) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(tick);
  };

  // dragging
  let drag: { x: number; y: number; t: number; id: number; sx: number; sy: number; target: EventTarget | null } | null =
    null;

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, sx: pos.tx, sy: pos.ty, target: e.target };
    stage.dataset.status = 'dragging';
  });

  addEventListener(
    'pointermove',
    (e) => {
      if (paused) return;
      if (finePointer && e.pointerType === 'mouse') {
        const r = stage.getBoundingClientRect();
        mouse.tx = e.clientX - r.left - W / 2;
        mouse.ty = e.clientY - r.top - H / 2;
        mouse.on = 1;
        if (label) {
          const item = (e.target as HTMLElement).closest?.<HTMLElement>('[data-dome-item]');
          label.textContent = item?.dataset.title ?? '';
          label.classList.toggle('is-on', !!item && !drag);
          label.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        }
        wake();
      }
      if (drag && e.pointerId === drag.id) {
        pos.tx = drag.sx + (e.clientX - drag.x) * dragSpeed;
        pos.ty = drag.sy + (e.clientY - drag.y) * dragSpeed;
        wake();
      }
    },
    { passive: true },
  );

  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    stage.dataset.status = 'idle';
    if (e.type === 'pointercancel') return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (moved > TAP_DISTANCE || performance.now() - d.t > TAP_TIME) return;
    const item = (d.target as HTMLElement)?.closest?.<HTMLElement>('[data-dome-item]');
    if (item?.dataset.href) location.href = item.dataset.href;
  };
  addEventListener('pointerup', end, { passive: true });
  addEventListener('pointercancel', end, { passive: true });
  document.addEventListener('pointerleave', () => {
    mouse.on = 0;
    label?.classList.remove('is-on');
    wake();
  });
  stage.addEventListener('pointerleave', () => label?.classList.remove('is-on'));

  // fade the hero out while scrolling down, pause when hidden
  const fadeTargets = [stage, ...document.querySelectorAll<HTMLElement>('[data-hero-fade]')];
  const onScroll = () => {
    const o = Math.max(0, Math.min(1, 1 - scrollY / (innerHeight * 0.46)));
    fadeTargets.forEach((el) => (el.style.opacity = o.toFixed(3)));
    const hidden = o <= 0;
    stage.style.visibility = hidden ? 'hidden' : '';
    if (hidden !== paused) {
      paused = hidden;
      if (paused) cancelAnimationFrame(raf), (running = false);
      else wake();
    }
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  let rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(build, 150);
  });

  build();
  // intro: slide in from an offset and ease into place
  if (!reduce) {
    pos.x = pos.tx + step * 0.55;
    pos.y = pos.ty + step * 0.33;
  }
  requestAnimationFrame(() => {
    stage.dataset.status = 'idle';
    wake();
  });
}
