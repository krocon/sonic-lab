/* Sonic Lab — promo site motion engine.
 * Plain JavaScript, no dependencies, no network requests. Every animation respects
 * prefers-reduced-motion; every canvas sleeps while it is off screen. */
(() => {
  'use strict';

  /* ───────────────────────── utilities ───────────────────────── */

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const range = (v, a, b) => clamp((v - a) / (b - a));
  const E = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  };
  const TAU = Math.PI * 2;
  const html = document.documentElement;
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  let RM = mqReduce.matches;
  html.classList.toggle('rm', RM);
  mqReduce.addEventListener?.('change', () => location.reload());
  const FINE = matchMedia('(pointer: fine)').matches;
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  const AC = window.AudioContext || window.webkitAudioContext;
  let vw = innerWidth;
  let vh = innerHeight;

  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function watch(el, cb, margin = '0px') {
    const io = new IntersectionObserver((es) => es.forEach((e) => cb(e.isIntersecting, e)), { rootMargin: margin });
    io.observe(el);
    return io;
  }

  function fitCanvas(cv, ctx) {
    const r = cv.getBoundingClientRect();
    const d = DPR();
    cv.width = Math.max(1, Math.round(r.width * d));
    cv.height = Math.max(1, Math.round(r.height * d));
    ctx.setTransform(d, 0, 0, d, 0, 0);
    return { W: r.width, H: r.height };
  }

  /* one animation frame loop for everything */
  const tickers = new Set();
  let lastNow = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    const t = now / 1000;
    tickers.forEach((fn) => fn(t, dt));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const resizers = new Set();
  let rzTimer = 0;
  let lastW = vw;
  let lastH = vh;
  addEventListener('resize', () => {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => {
      vw = innerWidth;
      vh = innerHeight;
      // mobile URL bars change the height while scrolling: ignore small height-only changes
      if (vw === lastW && Math.abs(vh - lastH) < 120) return;
      lastW = vw;
      lastH = vh;
      resizers.forEach((fn) => fn());
    }, 120);
  });

  /* scroll state */
  let sy = scrollY;
  let prevSy = sy;
  let vel = 0; // px/s, smoothed
  addEventListener('scroll', () => (sy = scrollY), { passive: true });
  tickers.add((t, dt) => {
    const v = dt > 0 ? (sy - prevSy) / dt : 0;
    vel = lerp(vel, v, 0.15);
    if (Math.abs(vel) < 0.5) vel = 0;
    prevSy = sy;
  });

  /* ───────────────────────── Morse ───────────────────────── */

  const MORSE = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
    K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
    U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
    0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '=': '-...-', '+': '.-.-.', '-': '-....-',
    '@': '.--.-.', "'": '.----.', '!': '-.-.--', '(': '-.--.', ')': '-.--.-', ':': '---...', ';': '-.-.-.',
    '"': '.-..-.', '&': '.-...',
  };
  const pretty = (code) => code.replace(/-/g, '–').replace(/\./g, '·');

  const tokenize = (text) =>
    Array.from(text.toUpperCase()).map((ch) => (/\s/.test(ch) ? { ch: ' ', code: '' } : { ch, code: MORSE[ch] || null }));

  /** Element timeline in dit units. marks[] maps back to tokens (chars, spaces, unsupported). */
  function buildTimeline(tokens) {
    const els = [];
    const marks = [];
    let u = 0;
    let gap = 0;
    let started = false;
    tokens.forEach((t, i) => {
      if (t.ch === ' ') {
        if (started && gap !== 7) gap = 7;
        marks.push({ i, sp: true, s: u + 7, e: u + 7 });
        return;
      }
      if (!t.code) {
        marks.push({ i, bad: true, s: u, e: u });
        return;
      }
      u += started ? gap : 0;
      const s = u;
      for (let k = 0; k < t.code.length; k++) {
        if (k) u += 1;
        const len = t.code[k] === '.' ? 1 : 3;
        els.push({ s: u, e: u + len, m: marks.length });
        u += len;
      }
      marks.push({ i, s, e: u, ch: t.ch, code: t.code });
      started = true;
      gap = 3;
    });
    return { els, marks, total: u };
  }

  /* ───────────────────────── text effects ───────────────────────── */

  const GLYPHS = '·–/ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function scramble(el, text = el.dataset.text || el.textContent, dur = 700) {
    if (!el) return;
    el.dataset.text = text;
    if (RM) {
      el.textContent = text;
      return;
    }
    cancelAnimationFrame(el._scr);
    const t0 = performance.now();
    const len = text.length;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      let out = '';
      for (let i = 0; i < len; i++) {
        const c = text[i];
        if (c === ' ' || p >= (i / len) * 0.7 + 0.3) out += c;
        else {
          const g = GLYPHS[(Math.random() * GLYPHS.length) | 0];
          out += c === c.toLowerCase() && c !== c.toUpperCase() ? g.toLowerCase() : g;
        }
      }
      el.textContent = out;
      if (p < 1) el._scr = requestAnimationFrame(step);
    };
    el._scr = requestAnimationFrame(step);
  }

  function split(el) {
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(' '));
              return;
            }
            const w = document.createElement('span');
            w.className = 'w';
            const wi = document.createElement('span');
            wi.className = 'wi';
            wi.style.setProperty('--i', i++);
            wi.textContent = part;
            w.appendChild(wi);
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el);
  }

  function countUp(el) {
    const to = parseFloat(el.dataset.count);
    const from = el.dataset.from != null ? parseFloat(el.dataset.from) : 0;
    const dec = +el.dataset.decimals || 0;
    const sep = el.hasAttribute('data-sep');
    const fmt = (v) => {
      const a = Math.abs(v);
      const s = sep
        ? a.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
        : a.toFixed(dec);
      return (v < 0 && Math.abs(v) >= Math.pow(10, -dec) / 2 ? '−' : '') + s;
    };
    if (RM) {
      el.textContent = fmt(to);
      return;
    }
    const t0 = performance.now();
    const dur = 1700;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(lerp(from, to, E.outExpo(p)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ───────────────────────── reveals ───────────────────────── */

  function reveal(el) {
    el.classList.add('is-in');
    if (el.hasAttribute('data-split')) {
      const n = el.querySelectorAll('.wi').length;
      setTimeout(() => el.classList.add('split-done'), RM ? 0 : 1250 + n * 55);
    }
  }

  function reveals() {
    $$('[data-split]').forEach(split);
    $$('[data-stagger]').forEach((g) => $$('[data-reveal]', g).forEach((c, i) => c.style.setProperty('--i', i)));

    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          reveal(e.target);
          io.unobserve(e.target);
        }),
      { rootMargin: '0px 0px -10% 0px' },
    );
    $$('[data-reveal], [data-split]').forEach((el) => {
      if (!el.closest('.hero')) io.observe(el);
    });

    // eyebrows decode themselves when they scroll in
    const eio = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          eio.unobserve(e.target);
          const label = e.target.lastChild;
          if (label && label.nodeType === 3 && label.textContent.trim()) {
            const span = document.createElement('span');
            span.textContent = label.textContent.trim();
            label.replaceWith(' ', span);
            scramble(span, span.textContent, 800);
          }
        }),
      { rootMargin: '0px 0px -10% 0px' },
    );
    $$('.eyebrow').forEach((el) => {
      if (!el.closest('.hero')) eio.observe(el);
    });

    const cio = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          cio.unobserve(e.target);
          countUp(e.target);
        }),
      { threshold: 0.6 },
    );
    $$('[data-count]').forEach((el) => {
      if (!RM && el.dataset.from != null) el.textContent = el.dataset.from;
      cio.observe(el);
    });
  }

  /* ───────────────────────── chrome: nav, meter, pointer ───────────────────────── */

  function chrome() {
    const nav = $('.nav');
    let navY = sy;
    tickers.add(() => {
      nav.classList.toggle('is-scrolled', sy > 30);
      if (sy > navY + 8 && sy > 500) nav.classList.add('is-hidden');
      else if (sy < navY - 8 || sy < 200) nav.classList.remove('is-hidden');
      if (Math.abs(sy - navY) > 8) navY = sy;
    });
    nav.addEventListener('focusin', () => nav.classList.remove('is-hidden'));

    // hover scramble on nav links
    $$('[data-hover-scramble]').forEach((a) => {
      a.dataset.text = a.textContent;
      a.addEventListener('pointerenter', () => scramble(a, a.dataset.text, 420));
    });

    // active section
    const links = $$('.nav-links a');
    const byId = { panel: 0, modules: 1, morse: 2, encoder: 2, privacy: 3, download: 4 };
    const sio = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          const n = byId[e.target.id];
          links.forEach((l, i) => l.classList.toggle('is-active', i === n));
        }),
      { rootMargin: '-48% 0px -51% 0px' },
    );
    Object.keys(byId).forEach((id) => $('#' + id) && sio.observe($('#' + id)));
    const hio = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && links.forEach((l) => l.classList.remove('is-active'))),
      { rootMargin: '-48% 0px -51% 0px' },
    );
    hio.observe($('.hero'));
    $$('.spectrum, .finale').forEach((s) => hio.observe(s));

    // LED level meter: scroll position plus a kick from scroll speed, with peak hold
    const segWrap = $('.meter-segs');
    const N = 34;
    const segs = [];
    for (let i = 0; i < N; i++) {
      const s = document.createElement('i');
      if (i >= N - 4) s.className = 'over';
      else if (i >= N - 10) s.className = 'hot';
      segWrap.appendChild(s);
      segs.push(s);
    }
    let level = 0;
    let peak = 0;
    let peakT = 0;
    let lastLit = -1;
    let lastPeak = -1;
    tickers.add((t) => {
      const max = Math.max(1, document.documentElement.scrollHeight - vh);
      const target = (sy / max) * N + Math.min(5, Math.abs(vel) / 900);
      level = lerp(level, target, 0.2);
      const lit = Math.round(clamp(level, 0, N));
      if (lit >= peak) {
        peak = lit;
        peakT = t;
      } else if (t - peakT > 0.9) {
        peak = Math.max(lit, peak - 1);
        peakT = t - 0.84;
      }
      if (lit !== lastLit || peak !== lastPeak) {
        segs.forEach((s, i) => {
          s.classList.toggle('on', i < lit);
          s.classList.toggle('peak', i === peak - 1 && peak > lit);
        });
        lastLit = lit;
        lastPeak = peak;
      }
    });

    // spotlight grid follows the pointer
    if (FINE && !RM) {
      const grid = $('.grid-bg');
      let mx = -999;
      let my = -999;
      let px = vw / 2;
      let py = -400;
      addEventListener('pointermove', (e) => ((mx = e.clientX), (my = e.clientY)), { passive: true });
      tickers.add(() => {
        if (mx < -900) return;
        const nx = lerp(px, mx, 0.16);
        const ny = lerp(py, my, 0.16);
        if (Math.abs(nx - px) + Math.abs(ny - py) < 0.2) return;
        px = nx;
        py = ny;
        grid.style.setProperty('--mx', px.toFixed(1) + 'px');
        grid.style.setProperty('--my', py.toFixed(1) + 'px');
      });
    } else {
      $('.grid-bg').style.display = 'none';
    }

    // magnetic buttons
    if (FINE && !RM) {
      $$('[data-magnetic]').forEach((el) => {
        let tx = 0;
        let ty = 0;
        let x = 0;
        let y = 0;
        let raf = 0;
        const loop = () => {
          x = lerp(x, tx, 0.2);
          y = lerp(y, ty, 0.2);
          el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
          raf = Math.abs(x - tx) + Math.abs(y - ty) > 0.05 ? requestAnimationFrame(loop) : 0;
          if (!raf && tx === 0 && ty === 0) el.style.transform = '';
        };
        const run = () => raf || (raf = requestAnimationFrame(loop));
        el.addEventListener('pointermove', (e) => {
          const r = el.getBoundingClientRect();
          tx = (e.clientX - (r.left + r.width / 2)) * 0.3;
          ty = (e.clientY - (r.top + r.height / 2)) * 0.42;
          run();
        });
        el.addEventListener('pointerleave', () => {
          tx = ty = 0;
          run();
        });
      });

      // platform cards: tilt + glare
      $$('[data-tilt]').forEach((card) => {
        card.addEventListener('pointermove', (e) => {
          const r = card.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width;
          const y = (e.clientY - r.top) / r.height;
          card.style.setProperty('--rx', ((0.5 - y) * 9).toFixed(2) + 'deg');
          card.style.setProperty('--ry', ((x - 0.5) * 11).toFixed(2) + 'deg');
          card.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
          card.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
        });
        card.addEventListener('pointerleave', () => {
          card.style.setProperty('--rx', '0deg');
          card.style.setProperty('--ry', '0deg');
        });
      });
    }
  }

  /* ───────────────────────── boot ───────────────────────── */

  function boot(done) {
    const b = $('.boot');
    let skip = RM;
    try {
      skip = skip || sessionStorage.getItem('sl-booted') === '1';
      sessionStorage.setItem('sl-booted', '1');
    } catch {
      /* storage blocked: just play it */
    }
    if (!b || skip) {
      b && b.classList.add('gone');
      done();
      return;
    }
    const word = $('.boot-word', b);
    word.textContent = '';
    const at = (ms, fn) => setTimeout(fn, ms);
    at(120, () => b.classList.add('s1'));
    at(360, () => b.classList.add('s2'));
    at(700, () => {
      b.classList.add('s3');
      scramble(word, 'SONIC LAB', 560);
    });
    at(1500, () => {
      b.classList.add('open');
      done();
    });
    at(2500, () => b.classList.add('gone'));
  }

  /* ───────────────────────── hero oscilloscope ───────────────────────── */

  function heroScope() {
    const hero = $('.hero');
    const cv = $('.scope', hero);
    const ctx = cv.getContext('2d');
    const band = $('.scope-band', hero);
    const textEl = $('.decoded-text', hero);
    const codeEl = $('.decoded-code', hero);
    const toneOut = $('[data-ro="tone"]', hero);
    const snrOut = $('[data-ro="snr"]', hero);
    const listen = $('.listen', hero);
    const listenLabel = $('.listen-label', hero);

    const WPM = 18;
    const UNIT = 1.2 / WPM;
    const tl = buildTimeline(tokenize('CQ CQ DE SONIC LAB K'));
    const LOOP = (tl.total + 26) * UNIT;
    // keying envelope, 1 ms resolution, 5 ms raised-cosine edges (click-free, like the app)
    const N = Math.ceil(LOOP * 1000) + 2;
    const env = new Float32Array(N);
    tl.els.forEach((el) => {
      const a = el.s * UNIT * 1000;
      const b = el.e * UNIT * 1000;
      for (let i = Math.floor(a); i <= Math.ceil(b); i++) {
        const r = Math.min((i - a) / 5, (b - i) / 5, 1);
        if (r > 0) env[i] = 0.5 - 0.5 * Math.cos(Math.PI * r);
      }
    });
    const envAt = (tau) => (tau < 0 ? 0 : env[((tau % LOOP) * 1000) | 0] || 0);

    let W = 0;
    let H = 0;
    let cy = 0;
    let amp = 0;
    let headX = 0;
    let pps = 150;
    let keyY = 0;
    let bandTop = 0;
    let bandH = 0;
    let drewStill = false;
    // where the band sits can change without any size change (font swap, wrapping),
    // so its offset is read every frame – cheap, the hero is its offsetParent
    function place() {
      if (band.offsetTop === bandTop && band.offsetHeight === bandH) return;
      bandTop = band.offsetTop;
      bandH = band.offsetHeight;
      cy = bandTop + bandH * 0.42;
      amp = bandH * 0.27;
      keyY = bandTop + bandH - 40;
      drewStill = false;
    }
    function size() {
      ({ W, H } = fitCanvas(cv, ctx));
      headX = W < 700 ? W - 22 : W * 0.86;
      pps = clamp(W / 7.2, 90, 210);
      bandTop = -1;
      place();
    }
    size();
    resizers.add(size);
    if ('ResizeObserver' in window) new ResizeObserver(() => size()).observe(hero);

    let t0 = 0;
    let started = false;
    let visible = true;
    let tone = 700;
    let toneT = 700;
    let level = 0.86;
    let levelT = 0.86;
    let shown = 0;
    let loopIdx = -1;
    let snr = 36;
    let lastSnrT = 0;
    let clearing = false;

    watch(hero, (v) => {
      visible = v;
      if (!v && audioOn) setListening(false);
    });

    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      toneT = Math.round((400 + ((e.clientX - r.left) / r.width) * 600) / 10) * 10;
      levelT = clamp(0.45 + (1 - (e.clientY - r.top) / r.height) * 0.75, 0.45, 1.12);
    });
    hero.addEventListener('pointerleave', () => {
      toneT = 700;
      levelT = 0.86;
    });

    /* audio: what you hear is what the pen draws */
    let ac = null;
    let osc = null;
    let gate = null;
    let out = null;
    let audioOn = false;
    let schedUntil = 0;
    function setListening(on) {
      if (on && !AC) return;
      audioOn = on;
      listen.setAttribute('aria-pressed', String(on));
      listenLabel.textContent = on ? 'Stop' : 'Listen';
      if (on) {
        if (!ac) {
          ac = new AC();
          osc = ac.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = tone;
          gate = ac.createGain();
          gate.gain.value = 0;
          const lp = ac.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 2500;
          out = ac.createGain();
          out.gain.value = 0;
          osc.connect(gate).connect(lp).connect(out).connect(ac.destination);
          osc.start();
        }
        ac.resume();
        out.gain.cancelScheduledValues(ac.currentTime);
        out.gain.setTargetAtTime(0.16, ac.currentTime, 0.04);
        schedUntil = 0;
      } else if (ac) {
        out.gain.cancelScheduledValues(ac.currentTime);
        out.gain.setTargetAtTime(0, ac.currentTime, 0.03);
        setTimeout(() => {
          if (!audioOn && ac) {
            gate.gain.cancelScheduledValues(0);
            gate.gain.value = 0;
            ac.suspend();
          }
        }, 300);
      }
    }
    listen.addEventListener('click', () => {
      if (!started) start();
      setListening(!audioOn);
    });
    if (!AC) listen.hidden = true;

    function schedule(vt) {
      if (!audioOn || !ac || ac.state !== 'running') return;
      const aNow = ac.currentTime;
      const horizon = vt + 0.3;
      if (schedUntil < vt) schedUntil = vt;
      const k0 = Math.floor(schedUntil / LOOP);
      const k1 = Math.floor(horizon / LOOP);
      const g = gate.gain;
      for (let k = k0; k <= k1; k++) {
        for (const el of tl.els) {
          const s = k * LOOP + el.s * UNIT;
          if (s < schedUntil || s >= horizon) continue;
          const e = k * LOOP + el.e * UNIT;
          const as = aNow + (s - vt);
          const ae = aNow + (e - vt);
          g.setValueAtTime(0, as);
          g.linearRampToValueAtTime(1, as + 0.005);
          g.setValueAtTime(1, ae - 0.005);
          g.linearRampToValueAtTime(0, ae);
        }
      }
      schedUntil = horizon;
      if (Math.abs(osc.frequency.value - tone) > 0.5) osc.frequency.setTargetAtTime(tone, aNow, 0.02);
    }

    function clearDecoded() {
      textEl.textContent = '';
      codeEl.textContent = '';
      textEl.classList.remove('is-clearing');
      clearing = false;
    }
    function emit(m) {
      if (m.sp) {
        textEl.appendChild(document.createTextNode(' '));
        codeEl.textContent += ' /';
        return;
      }
      const s = document.createElement('span');
      s.textContent = m.ch;
      textEl.appendChild(s);
      const code = codeEl.textContent + (codeEl.textContent ? ' ' : '') + m.code;
      codeEl.textContent = code.length > 64 ? code.slice(-64) : code;
    }

    function start() {
      if (started) return;
      started = true;
      size();
      t0 = performance.now() / 1000 + 0.4;
      textEl.classList.add('has-cursor');
    }

    const frozenVt = (tl.total + 6) * UNIT;
    tickers.add((now) => {
      if (!started || !visible) return;
      place();
      if (RM && drewStill) return;
      const vt = RM ? frozenVt : now - t0;
      drewStill = true;
      tone = lerp(tone, toneT, 0.08);
      level = lerp(level, levelT, 0.08);

      // readouts
      toneOut.textContent = String(Math.round(tone / 10) * 10);
      if (now - lastSnrT > 0.45) {
        lastSnrT = now;
        snr = clamp(snr + (Math.random() - 0.5) * 2, 33, 39);
        snrOut.textContent = String(Math.round(snr * (0.6 + level * 0.45)));
      }

      // decoder text
      if (vt >= 0) {
        const k = Math.floor(vt / LOOP);
        const tin = vt - k * LOOP;
        if (k !== loopIdx) {
          loopIdx = k;
          shown = 0;
          clearDecoded();
        }
        while (shown < tl.marks.length) {
          const m = tl.marks[shown];
          const due = m.sp ? (m.s - 1.5) * UNIT : (m.e + 2.5) * UNIT;
          if (tin < due) break;
          if (!m.bad) emit(m);
          shown++;
        }
        if (!clearing && tin > LOOP - 0.55) {
          clearing = true;
          textEl.classList.add('is-clearing');
        }
      }
      schedule(vt);

      draw(vt);
    });

    function draw(vt) {
      ctx.clearRect(0, 0, W, H);
      const period = 2.5 + ((1000 - tone) / 600) * 3.4; // px per drawn carrier cycle
      const A = amp * level;
      const k2 = TAU / period;

      // trace
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      let yHead = cy;
      for (let x = 0; x <= headX; x += 1) {
        const tau = vt - (headX - x) / pps;
        const e = envAt(tau);
        let y = cy + e * A * Math.sin(tau * pps * k2);
        y += (Math.random() - 0.5) * (1.8 + e * 2.2);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        yHead = y;
      }
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(47,123,255,0.16)';
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(60,200,255,0.22)';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(120,220,255,0.95)';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      // key-down strip
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(238,243,248,0.92)';
      const tMin = vt - headX / pps;
      const ka = Math.floor(Math.max(0, tMin) / LOOP);
      const kb = Math.floor(Math.max(0, vt) / LOOP);
      for (let k = ka; k <= kb; k++) {
        for (const el of tl.els) {
          const s = k * LOOP + el.s * UNIT;
          const e = k * LOOP + el.e * UNIT;
          if (e < tMin || s > vt) continue;
          const xs = headX - (vt - s) * pps;
          const xe = headX - (vt - Math.min(e, vt)) * pps;
          ctx.fillRect(xs, keyY, Math.max(1, xe - xs), 16);
        }
      }

      // fade the history out to the left
      ctx.globalCompositeOperation = 'destination-out';
      const fade = ctx.createLinearGradient(0, 0, W * 0.22, 0);
      fade.addColorStop(0, 'rgba(0,0,0,1)');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, bandTop - 40, W * 0.22, bandH + 80);
      ctx.globalCompositeOperation = 'source-over';

      // future: dotted baseline
      ctx.setLineDash([2, 7]);
      ctx.strokeStyle = 'rgba(150,170,190,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(headX + 10, cy);
      ctx.lineTo(W, cy);
      ctx.stroke();
      ctx.setLineDash([]);

      // write head
      ctx.strokeStyle = 'rgba(255,194,58,0.28)';
      ctx.beginPath();
      ctx.moveTo(headX + 0.5, bandTop + 20);
      ctx.lineTo(headX + 0.5, keyY + 22);
      ctx.stroke();
      const g = ctx.createRadialGradient(headX, yHead, 0, headX, yHead, 22);
      g.addColorStop(0, 'rgba(255,194,58,0.55)');
      g.addColorStop(1, 'rgba(255,194,58,0)');
      ctx.fillStyle = g;
      ctx.fillRect(headX - 22, yHead - 22, 44, 44);
      ctx.fillStyle = '#ffd36b';
      ctx.beginPath();
      ctx.arc(headX, yHead, 3, 0, TAU);
      ctx.fill();
    }

    return { start };
  }

  /* ───────────────────────── front panel tour ───────────────────────── */

  function panelTour() {
    const sec = $('.panel');
    const device = $('.device', sec);
    const img = $('.device-img', sec);
    const screen = $('.device-screen', sec);
    const video = $('.device-video', sec);
    const scan = $('.scanline', sec);
    const shade = $('.device-shade', sec);
    const focus = $('.focus', sec);
    const tour = $('.tour', sec);
    const items = $$('.tour-item', sec);
    const dots = $$('.tour-progress span', sec);
    const head = $('.panel-head', sec);

    // feature centres and clear half-axes, in % of the device image
    const STOPS = [
      { x: 37.9, y: 45.2, w: 37, h: 44 }, // display
      { x: 37.9, y: 94.4, w: 33, h: 5.6 }, // F keys
      { x: 77.2, y: 44.6, w: 3.4, h: 33 }, // soft keys
      { x: 89.5, y: 22.4, w: 8.2, h: 6.8 }, // knobs
      { x: 89.3, y: 51.8, w: 10, h: 12 }, // keypad + transport
      { x: 86.8, y: 87.4, w: 7.2, h: 11.5 }, // jog dial
    ];

    let visible = false;
    let p = 0;
    let ps = 0;
    let active = -1;
    let powered = false;

    watch(
      sec,
      (v) => {
        visible = v;
        if (v) video.preload = 'auto';
        else video.pause();
      },
      '50% 0px',
    );
    retryOnce(video);

    if (RM) {
      items.forEach((it) => it.classList.add('is-on'));
      return;
    }

    tickers.add(() => {
      if (!visible) return;
      const r = sec.getBoundingClientRect();
      p = clamp(-r.top / Math.max(1, r.height - vh));
      ps = lerp(ps, p, 0.14);
      if (Math.abs(ps - p) < 0.0004) ps = p;
      apply(ps);
    });

    function apply(q) {
      // 1 · entrance: the panel tips up out of the desk
      const a = E.outCubic(range(q, 0, 0.24));
      // 4 · dive into the display
      const z = E.inOut(range(q, 0.885, 1));
      const s = (0.72 + 0.28 * a) * (1 + z * 1.85);
      const bw = device.offsetWidth;
      const bh = device.offsetHeight;
      const dx = ((37.9 - 50) / 100) * bw;
      const dy = ((45.2 - 50) / 100) * bh;
      const tx = -dx * (s - 1) - z * dx * 1;
      const ty = -dy * (s - 1) - z * dy * 1 + (1 - a) * bh * 0.28;
      device.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) rotateX(${((1 - a) * 54).toFixed(2)}deg) scale(${s.toFixed(4)})`;
      img.style.opacity = String((0.32 + 0.68 * a) * (1 - z * 0.92));
      head.style.opacity = String(1 - range(q, 0.86, 0.93));

      // 2 · power on: the OLED opens from a bright line
      const pw = range(q, 0.18, 0.27);
      screen.style.setProperty('--pw', pw.toFixed(3));
      scan.style.setProperty('--flash', (Math.sin(pw * Math.PI) * 1.2).toFixed(3));
      scan.style.setProperty('--sx', (0.2 + 0.8 * E.outCubic(range(q, 0.16, 0.2))).toFixed(3));
      const on = pw > 0.35;
      if (on !== powered) {
        powered = on;
        if (on) video.play().catch(() => {});
        else video.pause();
      }

      // 3 · guided tour with a moving spotlight
      const T0 = 0.29;
      const T1 = 0.86;
      const seg = (T1 - T0) / STOPS.length;
      const qq = (q - T0) / seg;
      const idx = clamp(Math.floor(qq), 0, STOPS.length - 1);
      const f = clamp(qq - idx);
      const mix = idx < STOPS.length - 1 ? E.inOut(range(f, 0.62, 1)) : 0;
      const A = STOPS[idx];
      const B = STOPS[Math.min(idx + 1, STOPS.length - 1)];
      const fx = lerp(A.x, B.x, mix);
      const fy = lerp(A.y, B.y, mix);
      const fw = lerp(A.w, B.w, mix);
      const fh = lerp(A.h, B.h, mix);
      const sa = 0.8 * range(q, 0.27, 0.32) * (1 - range(q, 0.86, 0.9));
      shade.style.setProperty('--fx', fx.toFixed(2) + '%');
      shade.style.setProperty('--fy', fy.toFixed(2) + '%');
      shade.style.setProperty('--rw', ((fw / 0.58) * 1.05).toFixed(2) + '%');
      shade.style.setProperty('--rh', ((fh / 0.58) * 1.05).toFixed(2) + '%');
      shade.style.setProperty('--sa', sa.toFixed(3));
      const pad = 1.6;
      focus.style.left = (fx - fw - pad).toFixed(2) + '%';
      focus.style.top = (fy - fh - pad * 1.6).toFixed(2) + '%';
      focus.style.width = (2 * fw + 2 * pad).toFixed(2) + '%';
      focus.style.height = (2 * fh + 3.2 * pad).toFixed(2) + '%';
      focus.style.opacity = String(range(q, 0.29, 0.33) * (1 - range(q, 0.85, 0.88)));
      tour.style.setProperty('--tour-o', String(range(q, 0.27, 0.31) * (1 - range(q, 0.86, 0.9))));
      const cur = q < T0 ? 0 : mix > 0.5 ? idx + 1 : idx;
      if (cur !== active) {
        active = cur;
        items.forEach((it, i) => it.classList.toggle('is-on', i === cur));
        dots.forEach((d, i) => d.classList.toggle('on', i <= cur));
        const h3 = $('h3', items[cur]);
        if (h3 && q >= T0) scramble(h3, h3.dataset.text || h3.textContent, 520);
      }
    }
    apply(0);
  }

  /* ───────────────────────── modules ───────────────────────── */

  function modules() {
    const sec = $('.modules');
    const mods = $$('.mod', sec);
    const stack = $('.oled-stack', sec);
    const frame = $('.oled-frame', sec);
    const labels = $('.fbar-labels', sec);
    const keys = $('.fbar-keys', sec);
    const mq = matchMedia('(min-width: 900px)');
    const pinned = () => !RM && mq.matches;

    const imgs = [];
    const keyEls = [];
    const labelEls = [];
    mods.forEach((m, i) => {
      const src = $('.mod-img', m);
      const im = document.createElement('img');
      im.alt = '';
      im.decoding = 'async';
      im.dataset.src = src.getAttribute('src');
      stack.appendChild(im);
      imgs.push(im);

      const l = document.createElement('span');
      l.textContent = m.dataset.label;
      labels.appendChild(l);
      labelEls.push(l);

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fkey';
      b.innerHTML = `<span>${m.dataset.key}</span>`;
      b.setAttribute('aria-label', `${m.dataset.key}: ${$('.mod-title', m).textContent}`);
      b.addEventListener('click', () => go(i));
      keys.appendChild(b);
      keyEls.push(b);
    });

    let loaded = false;
    watch(
      sec,
      (v) => {
        if (v && !loaded && pinned()) {
          loaded = true;
          imgs.forEach((im) => (im.src = im.dataset.src));
        }
      },
      '100% 0px',
    );

    let cur = -1;
    function set(i) {
      if (i === cur) return;
      const prev = cur;
      cur = i;
      mods.forEach((m, k) => m.classList.toggle('is-on', k === i));
      labelEls.forEach((l, k) => l.classList.toggle('on', k === i));
      keyEls.forEach((b, k) => {
        b.classList.toggle('on', k === i);
        b.setAttribute('aria-pressed', String(k === i));
      });
      imgs.forEach((im, k) => {
        im.classList.remove('was-on');
        if (k === i) {
          im.classList.remove('is-on');
          void im.offsetWidth;
          im.classList.add('is-on');
        } else if (k === prev) {
          im.classList.remove('is-on');
          im.classList.add('was-on');
        } else im.classList.remove('is-on');
      });
      frame.style.setProperty('--scan-h', stack.clientHeight + 'px');
      frame.classList.remove('is-switching');
      void frame.offsetWidth;
      frame.classList.add('is-switching');
      const m = mods[i];
      const g = $('.mod-group', m);
      const t = $('.mod-title', m);
      scramble(g, g.dataset.text || g.textContent, 420);
      scramble(t, t.dataset.text || t.textContent, 620);
    }

    function go(i) {
      const top = sec.getBoundingClientRect().top + scrollY;
      const span = sec.offsetHeight - vh;
      scrollTo({ top: top + ((i + 0.5) / mods.length) * span, behavior: RM ? 'auto' : 'smooth' });
    }

    let visible = false;
    watch(sec, (v) => (visible = v));
    tickers.add(() => {
      if (!visible || !pinned()) return;
      const r = sec.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, r.height - vh), 0, 0.9999);
      set(Math.floor(p * mods.length));
    });
    if (pinned()) set(0);
    mq.addEventListener?.('change', () => {
      if (pinned()) {
        if (!loaded) {
          loaded = true;
          imgs.forEach((im) => (im.src = im.dataset.src));
        }
        cur = -1;
        set(0);
      }
    });
  }

  /* ───────────────────────── impairment tiles ───────────────────────── */

  function keyed(text, { jitter = 0, gapMul = 1, seed = 7 } = {}) {
    const rnd = seeded(seed);
    const j = () => 1 + (rnd() - 0.5) * 2 * jitter;
    const els = [];
    let u = 2;
    const words = text.split(' ');
    words.forEach((w, wi) => {
      Array.from(w).forEach((ch, ci) => {
        const code = MORSE[ch];
        for (let k = 0; k < code.length; k++) {
          if (k) u += j();
          const len = (code[k] === '.' ? 1 : 3) * j();
          els.push({ s: u, e: u + len });
          u += len;
        }
        if (ci < w.length - 1) u += 3 * gapMul * j();
      });
      if (wi < words.length - 1) u += 7 * gapMul;
    });
    return { els, total: u + 8 * gapMul };
  }

  function makeTile(cv, type, n) {
    const ctx = cv.getContext('2d');
    let W = 0;
    let H = 0;
    const resize = () => ({ W, H } = fitCanvas(cv, ctx));
    resize();
    resizers.add(resize);

    const wpm = 20;
    const unit = 1.2 / wpm;
    const opts =
      type === 'hand' ? { jitter: 0.25, seed: 11 } : type === 'farnsworth' ? { gapMul: 2.6 } : { seed: 3 + n };
    const k = keyed(type === 'farnsworth' ? 'CQ DE SL' : 'PARIS CQ DE SL', opts);
    const LOOP = k.total * unit;
    const N = Math.ceil(LOOP * 1000) + 2;
    const env = new Float32Array(N);
    k.els.forEach((el) => {
      const a = el.s * unit * 1000;
      const b = el.e * unit * 1000;
      for (let i = Math.floor(a); i <= Math.ceil(b); i++) {
        const r = Math.min((i - a) / 4, (b - i) / 4, 1);
        if (r > 0) env[i] = Math.max(env[i], 0.5 - 0.5 * Math.cos(Math.PI * r));
      }
    });
    if (type === 'reverb') {
      // a room that keeps ringing: exponential tail after every mark
      const d = Math.exp(-1 / 85);
      let v = 0;
      for (let i = 0; i < N; i++) {
        v = Math.max(env[i], v * d);
        env[i] = Math.max(env[i], v * 0.72);
      }
    }
    const rnd = seeded(97 + n);
    const clicks = [];
    if (type === 'clicks') {
      for (let t = 0.2; t < LOOP; t += 0.25 + rnd() * 0.45) clicks.push({ t, burst: rnd() < 0.55, a: 0.55 + rnd() * 0.4 });
    }
    const envAt = (tau) => env[(((tau % LOOP) + LOOP) % LOOP) * 1000 | 0] || 0;

    function draw(t) {
      if (!W) return;
      ctx.clearRect(0, 0, W, H);
      const pps = W / 3.2;
      const cy = H * 0.4;
      const A = H * 0.27;
      const head = W - 6;
      const k2 = TAU / 3.1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      for (let x = 0; x <= head; x += 1) {
        const tau = t - (head - x) / pps;
        let e = envAt(tau);
        let ampl = 0.92;
        let noise = 1.2;
        if (type === 'noise') {
          ampl = 0.62;
          noise = 0.3 * A * (Math.random() + Math.random() + Math.random() - 1.5) * 1.5;
        } else if (type === 'fading') {
          ampl = 0.12 + 0.88 * (0.5 + 0.5 * Math.sin((TAU * tau) / 3));
          noise = (Math.random() - 0.5) * 2;
        } else {
          noise = (Math.random() - 0.5) * 2.2;
        }
        let y = cy + e * A * ampl * Math.sin(tau * pps * k2);
        if (type === 'noise') y += noise;
        else y += noise;
        if (type === 'clicks') {
          const tm = ((tau % LOOP) + LOOP) % LOOP;
          for (const c of clicks) {
            const d = tm - c.t;
            if (c.burst && d >= 0 && d < 0.06) y += A * 0.5 * Math.sin(tau * pps * 2.3);
            else if (!c.burst && Math.abs(d) < 0.006) y += (x % 2 ? 1 : -1) * A * c.a * 1.25;
          }
        }
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(60,200,255,0.2)';
      ctx.lineWidth = 3.2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(120,220,255,0.92)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';

      // what the decoder keys
      const ky = H * 0.78;
      const kh = Math.max(8, H * 0.09);
      ctx.fillStyle = 'rgba(238,243,248,0.9)';
      const tMin = t - head / pps;
      const ka = Math.floor(tMin / LOOP);
      const kb = Math.floor(t / LOOP);
      for (let kk = ka; kk <= kb; kk++) {
        for (const el of k.els) {
          const s = kk * LOOP + el.s * unit;
          const e = kk * LOOP + el.e * unit;
          if (e < tMin || s > t) continue;
          const xs = head - (t - s) * pps;
          const xe = head - (t - Math.min(e, t)) * pps;
          ctx.fillRect(xs, ky, Math.max(1, xe - xs), kh);
        }
      }
      ctx.globalCompositeOperation = 'destination-out';
      const fade = ctx.createLinearGradient(0, 0, W * 0.18, 0);
      fade.addColorStop(0, 'rgba(0,0,0,1)');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, W * 0.18, H);
      ctx.globalCompositeOperation = 'source-over';

      ctx.font = '500 9.5px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = 'rgba(138,148,160,0.9)';
      ctx.fillText('IN', 10, 16);
      ctx.fillText('KEYED', 10, ky - 6);
    }
    return { draw };
  }

  function tiles() {
    const wrap = $('.tiles');
    const items = $$('.tile-canvas', wrap).map((cv, n) => makeTile(cv, cv.dataset.impair, n));
    let visible = false;
    watch(wrap, (v) => (visible = v), '80px');
    if (RM) {
      const still = () => items.forEach((it) => it.draw(6.4));
      requestAnimationFrame(still);
      resizers.add(() => requestAnimationFrame(still));
      return;
    }
    tickers.add((t) => visible && items.forEach((it) => it.draw(t)));
  }

  /* ───────────────────────── encoder playground ───────────────────────── */

  function encoder() {
    const box = $('.enc');
    const input = $('.enc-input', box);
    const list = $('.enc-tokens', box);
    const codeOut = $('.enc-code', box);
    const lenOut = $('.enc-len', box);
    const wpmOut = $('.enc-wpm', box);
    const toneOut = $('.enc-tone', box);
    const ranges = $$('.enc-range', box);
    const playBtn = $('.enc-play', box);
    const playLabel = $('.enc-play-label', box);
    const state = $('.enc-state-text', box);
    const bars = $('.enc-bars', box);
    const bctx = bars.getContext('2d');
    let BW = 0;
    let BH = 0;
    const fit = () => ({ W: BW, H: BH } = fitCanvas(bars, bctx));
    fit();
    resizers.add(() => {
      fit();
      drawBars(playing ? posU : -1);
    });

    let wpm = 20;
    let tone = 700;
    let toks = [];
    let tl = null;
    let lis = [];
    let playing = false;
    let ac = null;
    let nodes = null;
    let startAt = 0;
    let posU = -1;

    function rebuild() {
      toks = tokenize(input.value.slice(0, 40));
      tl = buildTimeline(toks);
      list.textContent = '';
      lis = toks.map((t) => {
        const li = document.createElement('li');
        if (t.ch === ' ') li.className = 'sp';
        else {
          if (!t.code) li.className = 'bad';
          li.innerHTML = `<span class="t-ch"></span><span class="t-code"></span>`;
          li.firstChild.textContent = t.ch;
          li.lastChild.textContent = t.code ? pretty(t.code) : '?';
        }
        list.appendChild(li);
        return li;
      });
      codeOut.textContent = tl.marks
        .filter((m) => !m.bad)
        .map((m) => (m.sp ? '/' : m.code))
        .join(' ')
        .replace(/(\/ )+/g, '/ ');
      lenOut.textContent = ((tl.total * 1.2) / wpm).toFixed(1);
      drawBars(-1);
    }

    function drawBars(u) {
      bctx.clearRect(0, 0, BW, BH);
      if (!tl || !tl.total) return;
      const sx = (BW - 2) / tl.total;
      const y = BH * 0.28;
      const h = BH * 0.44;
      tl.els.forEach((el) => {
        const x = 1 + el.s * sx;
        const w = Math.max(1.5, (el.e - el.s) * sx - 0.5);
        if (u < 0) bctx.fillStyle = 'rgba(238,243,248,0.9)';
        else if (el.s <= u && u < el.e) bctx.fillStyle = '#ffffff';
        else if (el.e <= u) bctx.fillStyle = 'rgba(60,200,255,0.85)';
        else bctx.fillStyle = 'rgba(238,243,248,0.22)';
        bctx.fillRect(x, y, w, h);
        if (u >= 0 && el.s <= u && u < el.e) {
          bctx.save();
          bctx.shadowColor = '#3cc8ff';
          bctx.shadowBlur = 18;
          bctx.fillRect(x, y, w, h);
          bctx.restore();
        }
      });
      if (u >= 0) {
        const x = 1 + Math.min(u, tl.total) * sx;
        bctx.fillStyle = '#ffc23a';
        bctx.fillRect(x - 0.5, 0, 1.5, BH);
      }
    }

    function stop() {
      if (nodes) {
        try {
          nodes.out.gain.setTargetAtTime(0, ac.currentTime, 0.01);
          nodes.osc.stop(ac.currentTime + 0.06);
        } catch {
          /* already stopped */
        }
        nodes = null;
      }
      playing = false;
      posU = -1;
      box.classList.remove('is-playing');
      playLabel.textContent = 'Play';
      state.textContent = 'Ready';
      lis.forEach((li) => li.classList.remove('on'));
      drawBars(-1);
    }

    function play() {
      if (!AC || !tl || !tl.els.length) return;
      ac = ac || new AC();
      ac.resume();
      const unit = 1.2 / wpm;
      const t0 = ac.currentTime + 0.08;
      const osc = ac.createOscillator();
      osc.frequency.value = tone;
      const g = ac.createGain();
      g.gain.value = 0;
      const out = ac.createGain();
      out.gain.value = 0.2;
      osc.connect(g).connect(out).connect(ac.destination);
      tl.els.forEach((el) => {
        const s = t0 + el.s * unit;
        const e = t0 + el.e * unit;
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(1, s + 0.005);
        g.gain.setValueAtTime(1, e - 0.005);
        g.gain.linearRampToValueAtTime(0, e);
      });
      osc.start(t0);
      osc.stop(t0 + tl.total * unit + 0.05);
      nodes = { osc, out };
      osc.onended = () => nodes && nodes.osc === osc && stop();
      startAt = t0;
      playing = true;
      box.classList.add('is-playing');
      playLabel.textContent = 'Stop';
      state.textContent = `Sending · ${tone} Hz`;
    }

    tickers.add(() => {
      if (!playing || !ac) return;
      const unit = 1.2 / wpm;
      posU = Math.max(0, (ac.currentTime - startAt) / unit);
      drawBars(posU);
      let on = -1;
      for (const m of tl.marks) {
        if (m.bad || m.sp) continue;
        if (posU >= m.s && posU < m.e + 1.5) on = m.i;
      }
      lis.forEach((li, i) => li.classList.toggle('on', i === on));
    });

    playBtn.addEventListener('click', () => (playing ? stop() : play()));
    if (!AC) playBtn.disabled = true;
    input.addEventListener('input', () => {
      if (playing) stop();
      rebuild();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') playing ? stop() : play();
    });
    ranges.forEach((r) => {
      const fill = () => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min)) * 100 + '%');
      fill();
      r.addEventListener('input', () => {
        fill();
        if (r.dataset.enc === 'wpm') {
          wpm = +r.value;
          wpmOut.textContent = r.value;
        } else {
          tone = +r.value;
          toneOut.textContent = r.value;
        }
        if (playing) stop();
        lenOut.textContent = ((tl.total * 1.2) / wpm).toFixed(1);
      });
    });
    rebuild();
  }

  /* ───────────────────────── marquee ───────────────────────── */

  function marquee() {
    const wrap = $('.marquee');
    const rows = $$('.mq-row', wrap).map((row) => {
      const tr = $('.mq-track', row);
      row.appendChild(tr.cloneNode(true));
      row.appendChild(tr.cloneNode(true));
      return { tracks: $$('.mq-track', row), dir: row.classList.contains('mq-rev') ? 1 : -1, x: 0, w: 0 };
    });
    const measure = () => rows.forEach((r) => (r.w = r.tracks[0].offsetWidth));
    measure();
    resizers.add(measure);
    document.fonts?.ready.then(measure);
    rows.forEach((r) => (r.x = r.dir > 0 ? -r.w : 0));
    if (RM) return;
    let visible = false;
    let skew = 0;
    let flip = 1;
    watch(wrap, (v) => (visible = v), '100px');
    tickers.add((t, dt) => {
      if (!visible) return;
      if (vel > 40) flip = 1;
      else if (vel < -40) flip = -1;
      const speed = 70 + Math.min(900, Math.abs(vel) * 0.55);
      skew = lerp(skew, clamp(-vel * 0.004, -9, 9), 0.1);
      rows.forEach((r) => {
        if (!r.w) return;
        r.x += r.dir * flip * speed * dt;
        if (r.x <= -r.w) r.x += r.w;
        if (r.x > 0) r.x -= r.w;
        const tf = `translate3d(${r.x.toFixed(1)}px,0,0) skewX(${skew.toFixed(2)}deg)`;
        r.tracks.forEach((tr) => (tr.style.transform = tf));
      });
    });
  }

  /* ───────────────────────── videos ───────────────────────── */

  function retryOnce(v) {
    let tried = false;
    const retry = () => {
      if (tried) return;
      tried = true;
      setTimeout(() => {
        const keep = !v.paused;
        v.load();
        if (keep && !RM) v.play().catch(() => {});
      }, 400);
    };
    v.addEventListener('error', retry, true);
    v.addEventListener('stalled', () => v.readyState === 0 && retry());
  }

  function sideVideos() {
    $$('.spec-video').forEach((v) => {
      retryOnce(v);
      watch(
        v,
        (on) => {
          if (on) {
            v.preload = 'auto';
            if (!RM) v.play().catch(() => {});
          } else v.pause();
        },
        '150px',
      );
    });
  }

  /* ───────────────────────── privacy rings ───────────────────────── */

  function rings() {
    const cv = $('.rings');
    const ctx = cv.getContext('2d');
    let W = 0;
    let H = 0;
    const fit = () => ({ W, H } = fitCanvas(cv, ctx));
    fit();
    resizers.add(fit);
    let visible = false;
    watch(cv, (v) => (visible = v), '50px');
    const list = [];
    let lastSpawn = 0;
    let hit = 0;
    let rot = 0;

    function draw(t, dt) {
      ctx.clearRect(0, 0, W, H);
      const c = W / 2;
      const R = W * 0.36;
      if (t - lastSpawn > 0.85) {
        lastSpawn = t;
        list.push({ r: W * 0.075 });
      }
      // inner glow
      const g = ctx.createRadialGradient(c, c, 0, c, c, R);
      g.addColorStop(0, 'rgba(60,200,255,0.16)');
      g.addColorStop(0.6, 'rgba(47,123,255,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, R, 0, TAU);
      ctx.fill();

      for (let i = list.length - 1; i >= 0; i--) {
        const ring = list[i];
        ring.r += dt * W * 0.13;
        const k = ring.r / R;
        if (k >= 1) {
          list.splice(i, 1);
          hit = 1;
          continue;
        }
        ctx.strokeStyle = `rgba(60,200,255,${(0.75 * (1 - k) * (1 - k) + 0.05).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(c, c, ring.r, 0, TAU);
        ctx.stroke();
      }
      hit = Math.max(0, hit - dt * 2.2);
      // the boundary: everything stays inside
      ctx.strokeStyle = `rgba(150,170,190,${(0.35 + hit * 0.5).toFixed(3)})`;
      ctx.lineWidth = 1.2 + hit * 1.5;
      if (hit > 0.01) {
        ctx.shadowColor = '#3cc8ff';
        ctx.shadowBlur = 24 * hit;
      }
      ctx.beginPath();
      ctx.arc(c, c, R, 0, TAU);
      ctx.stroke();
      ctx.shadowBlur = 0;
      rot += dt * 0.12;
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(-rot);
      ctx.setLineDash([2, 8]);
      ctx.strokeStyle = 'rgba(150,170,190,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, R + W * 0.03, 0, TAU);
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);
    }
    if (RM) {
      list.push({ r: W * 0.12 }, { r: W * 0.2 }, { r: W * 0.28 });
      requestAnimationFrame(() => draw(0, 0));
      return;
    }
    tickers.add((t, dt) => visible && draw(t, dt));
  }

  /* ───────────────────────── finale: blinking TUNE IN ───────────────────────── */

  function finale() {
    const wrap = $('.finale-morse');
    const unit = 0.11;
    const tl = buildTimeline(tokenize('TUNE IN'));
    const spans = [];
    let lastEnd = 0;
    tl.els.forEach((el) => {
      const gapU = el.s - lastEnd;
      if (lastEnd && gapU > 1) {
        const g = document.createElement('span');
        g.className = 'gap';
        g.style.width = `calc(var(--u) * ${((gapU - 1) * 0.58).toFixed(2)})`;
        wrap.appendChild(g);
      }
      const s = document.createElement('span');
      s.style.width = `calc(var(--u) * ${el.e - el.s})`;
      wrap.appendChild(s);
      spans.push({ el, s });
      lastEnd = el.e;
    });
    const loop = (tl.total + 14) * unit;
    let visible = false;
    watch(wrap, (v) => (visible = v));
    if (RM) {
      spans.forEach((x) => x.s.classList.add('on'));
      return;
    }
    const title = $('.finale-title');
    let keyedNow = false;
    tickers.add((t) => {
      if (!visible) return;
      const u = (t % loop) / unit;
      let any = false;
      spans.forEach(({ el, s }) => {
        const on = u >= el.s && u < el.e;
        s.classList.toggle('on', on);
        any = any || on;
      });
      if (any !== keyedNow) {
        keyedNow = any;
        title.classList.toggle('keyed', any);
      }
    });
  }

  /* ───────────────────────── <base href> helpers ───────────────────────── */

  // The page sets <base href="/products/sonic-lab/">. Fragment links then resolve against the base,
  // which reloads the page when it was opened as …/index.html, and fragment references inside
  // inline SVG break in Firefox and Safari. Keep both pointed at this very document.
  function sameDocumentLinks() {
    const here = location.href.split('#')[0];
    $$('svg [href^="#"]').forEach((el) => el.setAttribute('href', here + el.getAttribute('href')));
    document.addEventListener('click', (e) => {
      const a = e.target.closest?.('a[href^="#"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const id = a.getAttribute('href').slice(1);
      const target = id ? document.getElementById(id) : document.body;
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', location.pathname + location.search + (id ? '#' + id : ''));
      if (id === 'main') {
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    });
  }

  /* ───────────────────────── go ───────────────────────── */

  sameDocumentLinks();
  reveals();
  chrome();
  const scope = heroScope();
  panelTour();
  modules();
  tiles();
  encoder();
  marquee();
  sideVideos();
  rings();
  finale();

  const eyebrow = $('.hero-eyebrow');
  eyebrow.dataset.text = eyebrow.textContent;
  boot(() => {
    document.body.classList.add('is-ready');
    reveal($('.hero-title'));
    scramble(eyebrow, eyebrow.dataset.text, 1000);
    setTimeout(scope.start, RM ? 0 : 350);
  });
})();
