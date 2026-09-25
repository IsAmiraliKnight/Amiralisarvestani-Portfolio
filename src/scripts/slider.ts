import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { InertiaPlugin } from 'gsap/InertiaPlugin';

gsap.registerPlugin(Draggable, InertiaPlugin);

const GAP = 16;
const FLAT = 0.34; // part of the viewport that stays flat
const ANGLE = 26; // how much the side slides turn away
const DEPTH = 240; // how far the side slides are pushed back

const smooth = (t: number) => t * t * (3 - 2 * t);

type Slide = HTMLElement & { _x?: number };

/** Infinite, draggable, slightly curved image slider with dots. */
export function initSlider(root: HTMLElement) {
  const viewport = root.querySelector<HTMLElement>('[data-slider-viewport]')!;
  const track = root.querySelector<HTMLElement>('[data-slider-track]')!;
  const originals = [...track.querySelectorAll<HTMLElement>('[data-slide]')].map((s) => s.cloneNode(true) as HTMLElement);
  const count = originals.length;
  if (!count) return;
  const href = root.dataset.href;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const proxy = document.createElement('div');

  let slides: Slide[] = [];
  let dots: HTMLButtonElement[] = [];
  let drag: Draggable | null = null;
  let step = 0,
    slideW = 0,
    vw = 0,
    offset = 0,
    active = -1;

  function render(x: number) {
    const total = slides.length * step;
    for (const s of slides) {
      const i = slides.indexOf(s);
      const sx = gsap.utils.wrap(-step, total - step, x + i * step + offset);
      s._x = sx;
      const center = sx + slideW / 2;
      const e = (center - vw / 2) / (vw / 2);
      const a = Math.abs(e);
      let rot = 0,
        z = 0;
      if (!reduce && a > FLAT) {
        const t = smooth(Math.min(1, (a - FLAT) / (1 - FLAT)));
        rot = -ANGLE * t * Math.sign(e);
        z = -DEPTH * t;
      }
      gsap.set(s, { x: sx, rotationY: rot, z });
      s.dataset.status = center > vw * 0.2 && center < vw * 0.8 ? 'active' : 'idle';
    }
    const idx = ((Math.round(-x / step) % count) + count) % count;
    if (idx !== active) {
      active = idx;
      dots.forEach((d, i) => {
        d.classList.toggle('is-active', i === idx);
        d.setAttribute('aria-current', String(i === idx));
      });
    }
  }

  const current = () => Number(gsap.getProperty(proxy, 'x')) || 0;

  function goTo(target: number) {
    gsap.to(proxy, {
      x: target,
      duration: 0.7,
      ease: 'power3.out',
      overwrite: 'auto',
      onUpdate: () => render(current()),
    });
  }

  function build() {
    drag?.kill();
    vw = viewport.clientWidth;
    const spv = vw < 700 ? 1.12 : 1.5;
    const img = originals[0].querySelector('img');
    const ratio = img ? Number(img.getAttribute('width')) / Number(img.getAttribute('height')) || 1.6 : 1.6;
    slideW = (vw - GAP * (spv - 1)) / spv;
    const maxH = Math.max(220, innerHeight * 0.64);
    if (slideW / ratio > maxH) slideW = maxH * ratio;
    const slideH = Math.round(slideW / ratio);
    step = slideW + GAP;
    offset = (vw - slideW) / 2;

    // clone slides until the track can loop seamlessly
    const needed = Math.max(count, Math.ceil((vw + step * 3) / step));
    const els: Slide[] = [];
    for (let i = 0; els.length < needed || els.length % count; i++) {
      const el = originals[i % count].cloneNode(true) as Slide;
      if (i >= count) el.setAttribute('aria-hidden', 'true');
      els.push(el);
    }
    track.replaceChildren(...els);
    slides = els;
    gsap.set(slides, { width: slideW, height: slideH });
    track.style.height = `${slideH}px`;

    drag = Draggable.create(proxy, {
      type: 'x',
      trigger: viewport,
      inertia: true,
      dragResistance: 0.05,
      throwResistance: 2200,
      minDuration: 0.2,
      maxDuration: 0.9,
      allowNativeTouchScrolling: true,
      snap: { x: (v: number) => Math.round(v / step) * step },
      onPress: () => (viewport.dataset.grab = 'down'),
      onRelease: () => (viewport.dataset.grab = ''),
      onDrag() {
        render(this.x);
      },
      onThrowUpdate() {
        render(this.x);
      },
    })[0];

    const x = Math.round(current() / step) * step || 0;
    gsap.set(proxy, { x });
    active = -1;
    render(x);
  }

  // dots
  const dotWrap = root.querySelector<HTMLElement>('[data-slider-dots]');
  if (dotWrap && count > 1) {
    dots = originals.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'work__dot';
      b.setAttribute('aria-label', `Go to image ${i + 1} of ${count}`);
      b.addEventListener('click', () => {
        const x = current();
        const loop = count * step;
        let delta = (-i * step - x) % loop;
        if (delta > loop / 2) delta -= loop;
        if (delta < -loop / 2) delta += loop;
        goTo(x + delta);
      });
      dotWrap.appendChild(b);
      return b;
    });
  }

  // tap: the centered slide opens the case study, side slides scroll into the center
  let down: { x: number; y: number } | null = null;
  viewport.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  viewport.addEventListener('click', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    down = null;
    const px = e.clientX - viewport.getBoundingClientRect().left;
    const hit = slides.find((s) => (s._x ?? 0) <= px && px < (s._x ?? 0) + slideW);
    if (!hit) return;
    const center = (hit._x ?? 0) + slideW / 2;
    if (Math.abs(center - vw / 2) < slideW / 2 && href) location.href = href;
    else goTo(current() - Math.round((center - vw / 2) / step) * step);
  });

  let t = 0;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = window.setTimeout(() => viewport.clientWidth !== vw && build(), 150);
  });

  build();
  root.dataset.status = 'active';
}
