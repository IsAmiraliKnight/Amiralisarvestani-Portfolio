import { SplitText } from 'gsap/SplitText';

/**
 * Rubbery letters: on hover, the letters of a title lean toward the cursor
 * and spring back when it leaves.
 */
const REACH = 1.75; // how many font-sizes the effect reaches around the cursor
const PULL_Y = 0.2;
const PULL_X = 0.045;
const LIFT = 0.026;
const TILT = 26;
const MAX_TILT = 8;
const GROW = 0.035;
const STIFF = 0.135;
const DAMP = 0.8;
const REST = 0.002;

export function initBend(el: HTMLElement) {
  const split = SplitText.create(el, { type: 'chars' });
  let fontSize = 16;
  const chars = split.chars.map((node, i) => {
    const ch = node as HTMLElement;
    ch.style.display = 'inline-block';
    ch.style.willChange = 'transform';
    return {
      el: ch,
      cx: 0,
      cy: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      stiff: STIFF * (1 + 0.22 * (i % 2 ? 1 : -1) * (0.6 + (0.4 * ((i * 7) % 5)) / 4)),
    };
  });

  const pointer = { x: 0, y: 0, on: 0 };
  let raf = 0;

  const measure = () => {
    // `el` is position: relative, so the letters' offsets are measured from it
    fontSize = parseFloat(getComputedStyle(el).fontSize) || 16;
    for (const c of chars) {
      c.cx = c.el.offsetLeft + c.el.offsetWidth / 2;
      c.cy = c.el.offsetHeight / 2;
    }
  };

  function frame() {
    const reach = REACH * fontSize;
    let moving = false;
    for (const c of chars) {
      let ty = 0,
        tx = 0;
      if (pointer.on) {
        const d = (c.cx - pointer.x) / reach;
        const w = Math.exp(-d * d * 2.2);
        ty = ((pointer.y - c.cy) * PULL_Y - LIFT * fontSize) * w;
        tx = (pointer.x - c.cx) * PULL_X * w;
      }
      c.vy = (c.vy + (ty - c.y) * c.stiff) * DAMP;
      c.vx = (c.vx + (tx - c.x) * c.stiff) * DAMP;
      c.y += c.vy;
      c.x += c.vx;
      if (Math.abs(c.vy) > REST || Math.abs(c.y - ty) > REST || Math.abs(c.vx) > REST || Math.abs(c.x - tx) > REST)
        moving = true;
    }
    chars.forEach((c, i) => {
      const prev = chars[i - 1] || c,
        next = chars[i + 1] || c;
      const slope = (next.y - prev.y) / (next.cx - prev.cx || 1);
      const rot = Math.max(-MAX_TILT, Math.min(MAX_TILT, slope * TILT));
      const scale = 1 + Math.min(1, Math.abs(c.y) / (fontSize * 0.5)) * GROW;
      c.el.style.transform = `translate3d(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    });
    if (!moving && !pointer.on) {
      for (const c of chars) {
        c.x = c.y = c.vx = c.vy = 0;
        c.el.style.transform = '';
      }
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  const start = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const host = el.closest<HTMLElement>('a') ?? el;
  host.addEventListener('pointerenter', measure);
  host.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.on = 1;
    start();
  });
  host.addEventListener('pointerleave', () => {
    pointer.on = 0;
    start();
  });
}
