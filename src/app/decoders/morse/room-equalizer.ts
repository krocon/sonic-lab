import { KeyingSegment } from './keying-detector';
import { estimateUnit } from './unit-estimator';

/**
 * Keying detection for Morse played through a loudspeaker in a reverberant room (opt-in).
 *
 * At the tone frequency the room adds a reverberant field to the direct sound. Where it is partly
 * opposite in phase, the steady tone is no louder than its own tail: at a key-up the level stays
 * flat or even rises, and level-based detection merges whole characters into one mark. The phase
 * still shows every edge. This stage models the complex tone amplitude per hop (Goertzel, phase
 * referenced to the sample clock, frequency offset removed) as a sum over keyed elements:
 *
 *   Y(t) = Σₑ cₑ · (S(t − startₑ) − S(t − endₑ))
 *
 * S is the room's complex step response at the hop rate (direct sound + build-up, learned from the
 * signal), cₑ the element's complex amplitude (its own phase, so a tone generator that restarts
 * the phase at every element works too). Each hop is decided two hops late by comparing "no
 * change" with "an element starts / ends at one of the last three hops", the tails of earlier
 * elements included.
 *
 * Learning S without knowing the keying: character onsets after a long gap are found by the level
 * detector even in a bad room (the decoder reports them via {@link onset}); aligned on the complex
 * step of the direct sound and phase-normalised, their average is S for the first unit. A first
 * decode tells which first elements were dahs, which extends S to three units. The speed is then
 * estimated from the decoded elements, and S is refined twice by least squares over the full
 * length, using only characters whose decoded timing is plausible. Online, S is refined every few
 * seconds the same way.
 *
 * The model needs the tone's phase to stand still between hops, so the frequency offset from the
 * analysis bin must be removed to a fraction of a hertz – a dah's tail is predicted hundreds of
 * milliseconds ahead. A tracker over steady hops gets within a few hertz (the room's build-up turns
 * the phase too); the rest is found by trying offsets of ±5 Hz through the whole learning chain
 * (most plausibly timed characters, then the best model fit) and a fine search of ±0.4 Hz.
 */

/** Taps of the step response (hops): 48 × 6 ms ≈ 0.3 s. */
const TAPS = 48;
/** The direct sound has fully entered the analysis window after this many hops. */
const DIRECT_TAPS = 3;
/** Decision delay, hops. */
const DELAY = 2;
/** A new element must be at least this strong relative to recent elements … */
const MIN_ELEMENT = 0.7;
/** … and at most this strong. */
const MAX_ELEMENT = 2;
/** The running element's amplitude is kept within this range of recent elements. */
const ELEMENT_CLAMP: readonly [number, number] = [0.7, 1.4];
/** Cost of one transition, relative to the squared step-response peak. */
const TRANSITION_COST = 0.02;
/** Recorded hops (≈ 12 s at 6 ms) – learning and refits look at this window. */
const CAPACITY = 2048;
/** Character onsets needed before learning, and the minimum recording. */
const MIN_ONSETS = 6;
const MIN_LEARN_SECONDS = 4;
/** Refit of S while active, s. */
const REFIT_SECONDS = 2;
/** Least-squares refinements after the bootstrap. */
const REFINEMENTS = 2;
/** Normalised model error above which the equalizer is not trusted (≈ −8 dB). */
const MAX_RESIDUAL = 0.16;
/** Time constant of the frequency-offset estimate (over steady hops), s. */
const ROTATION_SECONDS = 1;
/** Steady hops for the offset estimate: within 6 dB of the recent peak … */
const STEADY_LEVEL = 0.5;
/** … for at least this long (s) … */
const STEADY_SECONDS = 0.06;
/** … and changing by at most this fraction of the level from the previous hop. */
const STEADY_CHANGE = 0.1;
/** Release of the level peak used for that, s. */
const PEAK_SECONDS = 2;
/** Coarse search for the residual frequency offset when learning: ±span in steps, Hz. */
const COARSE_SPAN = 5;
const COARSE_STEP = 0.5;
/** Candidates with the most plausibly timed decodes compared by their model fit … */
const COARSE_FINALISTS = 3;
/** … which is weighted up by this per Hz of correction (the tracker is unbiased without a room). */
const OFFSET_PENALTY = 0.1;
/** Fine search after the coarse one, ±span in steps (Hz) … */
const OFFSET_SPAN = 0.4;
const OFFSET_STEP = 0.1;
/** … and at each refit. */
const REFIT_OFFSET_SPAN = 0.3;
const REFIT_OFFSET_STEP = 0.1;

interface Element {
  start: number;
  /** First hop after the element, −1 while it runs. */
  end: number;
  cRe: number;
  cIm: number;
}

type Reader = (n: number) => readonly [number, number];

/** Complex step response, flat after its last tap. */
class StepResponse {
  readonly re = new Float64Array(TAPS);
  readonly im = new Float64Array(TAPS);
  peak = 0;

  set(re: ArrayLike<number>, im: ArrayLike<number>, length: number): void {
    const n = Math.min(length, TAPS);
    for (let i = 0; i < TAPS; i++) {
      const j = Math.min(i, n - 1);
      this.re[i] = re[j] ?? 0;
      this.im[i] = im[j] ?? 0;
    }
    this.peak = 0;
    for (let i = 0; i < TAPS; i++)
      this.peak = Math.max(this.peak, Math.hypot(this.re[i] ?? 0, this.im[i] ?? 0));
  }
}

/** Delayed per-hop decisions with the element model (see the class comment of RoomEqualizer). */
class ElementDecoder {
  elements: Element[] = [];
  /** Elements dropped from {@link elements} (kept only for batch runs). */
  private readonly archive: Element[] = [];
  on = false;
  lastChange = -1e9;
  /** Transitions committed since the last call of {@link take}: [hop, keyDown]. */
  private changes: [number, boolean][] = [];
  private readonly predRe = new Float64Array(DELAY + 1);
  private readonly predIm = new Float64Array(DELAY + 1);

  constructor(
    private readonly s: StepResponse,
    private readonly minRun: number,
    private readonly keepAll = false,
  ) {}

  /** Every element decoded so far (batch runs), oldest first. */
  get all(): Element[] {
    return [...this.archive, ...this.elements];
  }

  take(): [number, boolean][] {
    const c = this.changes;
    this.changes = [];
    return c;
  }

  /** Decides hop t − DELAY using hops up to t. */
  step(y: Reader, t: number): void {
    const base = t - DELAY;
    this.prune(base);
    const els = this.elements;
    const s = this.s;
    // prediction of the committed elements for the window
    for (let m = base; m <= t; m++) {
      let pr = 0;
      let pi = 0;
      for (const e of els) {
        const [vr, vi] = this.contribution(e, m);
        pr += e.cRe * vr - e.cIm * vi;
        pi += e.cRe * vi + e.cIm * vr;
      }
      this.predRe[m - base] = pr;
      this.predIm[m - base] = pi;
    }
    const lambda = TRANSITION_COST * s.peak * s.peak;
    let bestCost = this.cost(y, base, t, null, 0, 0, -1);
    let bestAt = -1;
    let bestRe = 0;
    let bestIm = 0;
    const running = this.on ? els[els.length - 1] : undefined;
    const ref = this.reference();
    for (let at = base; at <= t; at++) {
      if (at - this.lastChange < this.minRun) continue;
      let cRe = 0;
      let cIm = 0;
      if (!this.on) {
        // amplitude of a new element starting at `at`, from the residual of hops at..t
        let nr = 0;
        let ni = 0;
        let den = 0;
        for (let m = at; m <= t; m++) {
          const [yr, yi] = y(m);
          const rr = yr - (this.predRe[m - base] ?? 0);
          const ri = yi - (this.predIm[m - base] ?? 0);
          const vr = s.re[Math.min(m - at, TAPS - 1)] ?? 0;
          const vi = s.im[Math.min(m - at, TAPS - 1)] ?? 0;
          nr += vr * rr + vi * ri;
          ni += vr * ri - vi * rr;
          den += vr * vr + vi * vi;
        }
        if (den <= 0) continue;
        cRe = nr / den;
        cIm = ni / den;
        const mag = Math.hypot(cRe, cIm);
        if (mag < MIN_ELEMENT * ref || mag > MAX_ELEMENT * ref) continue;
      }
      const cost = this.cost(y, base, t, running ?? null, cRe, cIm, at) + lambda;
      if (cost < bestCost) {
        bestCost = cost;
        bestAt = at;
        bestRe = cRe;
        bestIm = cIm;
      }
    }
    if (bestAt === base) {
      if (this.on && running) {
        running.end = base;
      } else {
        els.push({ start: base, end: -1, cRe: bestRe, cIm: bestIm });
      }
      this.on = !this.on;
      this.lastChange = base;
      this.changes.push([base, this.on]);
    } else if (running) {
      this.refine(y, running, t, ref);
    }
  }

  /** Squared error over the window for a hypothesis (a transition at `at`, or none for at = −1). */
  private cost(
    y: Reader,
    base: number,
    t: number,
    running: Element | null,
    cRe: number,
    cIm: number,
    at: number,
  ): number {
    const s = this.s;
    let sum = 0;
    for (let m = base; m <= t; m++) {
      let pr = this.predRe[m - base] ?? 0;
      let pi = this.predIm[m - base] ?? 0;
      if (at >= 0 && m >= at) {
        if (running) {
          // the running element ends at `at`: subtract its step from there on
          const vr = s.re[Math.min(m - at, TAPS - 1)] ?? 0;
          const vi = s.im[Math.min(m - at, TAPS - 1)] ?? 0;
          pr -= running.cRe * vr - running.cIm * vi;
          pi -= running.cRe * vi + running.cIm * vr;
        } else {
          const vr = s.re[Math.min(m - at, TAPS - 1)] ?? 0;
          const vi = s.im[Math.min(m - at, TAPS - 1)] ?? 0;
          pr += cRe * vr - cIm * vi;
          pi += cRe * vi + cIm * vr;
        }
      }
      const [yr, yi] = y(m);
      sum += (yr - pr) ** 2 + (yi - pi) ** 2;
    }
    return sum;
  }

  /** S(m − start) − S(m − end) for element e at hop m. */
  private contribution(e: Element, m: number): [number, number] {
    const s = this.s;
    if (m < e.start) return [0, 0];
    const a = Math.min(m - e.start, TAPS - 1);
    let vr = s.re[a] ?? 0;
    let vi = s.im[a] ?? 0;
    if (e.end >= 0 && m >= e.end) {
      const b = Math.min(m - e.end, TAPS - 1);
      vr -= s.re[b] ?? 0;
      vi -= s.im[b] ?? 0;
    }
    return [vr, vi];
  }

  /** Least-squares amplitude of the running element over its hops so far (at most 64). */
  private refine(y: Reader, e: Element, t: number, ref: number): void {
    const s = this.s;
    let nr = 0;
    let ni = 0;
    let den = 0;
    for (let m = Math.max(e.start, t - 63); m <= t; m++) {
      let pr = 0;
      let pi = 0;
      for (const o of this.elements) {
        if (o === e) continue;
        const [vr, vi] = this.contribution(o, m);
        pr += o.cRe * vr - o.cIm * vi;
        pi += o.cRe * vi + o.cIm * vr;
      }
      const [yr, yi] = y(m);
      const rr = yr - pr;
      const ri = yi - pi;
      const a = Math.min(m - e.start, TAPS - 1);
      const vr = s.re[a] ?? 0;
      const vi = s.im[a] ?? 0;
      nr += vr * rr + vi * ri;
      ni += vr * ri - vi * rr;
      den += vr * vr + vi * vi;
    }
    if (den <= 0) return;
    let cRe = nr / den;
    let cIm = ni / den;
    const mag = Math.hypot(cRe, cIm);
    if (ref > 0 && mag > 0) {
      const k = Math.min(Math.max(mag, ELEMENT_CLAMP[0] * ref), ELEMENT_CLAMP[1] * ref) / mag;
      cRe *= k;
      cIm *= k;
    }
    e.cRe = cRe;
    e.cIm = cIm;
  }

  /** Median amplitude of the last finished elements (1 before the first: S has the signal's scale). */
  private reference(): number {
    const mags: number[] = [];
    for (let i = this.elements.length - 1; i >= 0 && mags.length < 8; i--) {
      const e = this.elements[i] as Element;
      if (e.end >= 0) mags.push(Math.hypot(e.cRe, e.cIm));
    }
    if (mags.length === 0) return 1;
    mags.sort((a, b) => a - b);
    return mags[mags.length >> 1] ?? 0;
  }

  /** Drops elements whose tail has died out (keeps a few for the amplitude reference). */
  private prune(base: number): void {
    const els = this.elements;
    let drop = 0;
    while (
      drop < els.length - 8 &&
      (els[drop] as Element).end >= 0 &&
      base - (els[drop] as Element).end >= TAPS
    )
      drop++;
    if (drop > 0) {
      const old = els.splice(0, drop);
      if (this.keepAll) this.archive.push(...old);
    }
  }
}

export class RoomEqualizer {
  private readonly re = new Float64Array(CAPACITY);
  private readonly im = new Float64Array(CAPACITY);
  private readonly times = new Float64Array(CAPACITY);
  /** Absolute index of the next hop. */
  private n = 0;
  private prevRe = 0;
  private prevIm = 0;
  private rotRe = 0;
  private rotIm = 0;
  private phase = 0;
  private peak = 0;
  private strongHops = 0;
  /** The offset estimate is held (tuned by the room model instead). */
  private frozen = false;
  /** Trial residual offset (rad per hop from hop `trialFrom`) applied by the reader while learning. */
  private trial = 0;
  private trialFrom = 0;
  private hopSeconds = 0.006;
  private onsets: number[] = [];
  private readonly s = new StepResponse();
  private decoder: ElementDecoder | null = null;
  private unitHops = 10;
  private lastRefit = 0;
  private learnAttempts = 0;
  private emittedState = false;
  private emittedSince = 0;
  /** Normalised model error of the last fit (diagnostics). */
  residual = 1;
  /** Refits since the room was learned. */
  private refits = 0;

  /** True once S has been learned and the element decoder runs. */
  get isActive(): boolean {
    return this.decoder !== null;
  }

  /** True once S has been learned and refined online at least once (a steadier estimate). */
  get isConfirmed(): boolean {
    return this.decoder !== null && this.refits > 0;
  }

  /**
   * How much the room shapes the tone: the mean change of the step response after the direct
   * sound, relative to it (complex, so a turning phase counts). ≈ 0.05 without a room – also in
   * strong noise –, 0.25–0.5 in the rooms where level detection fails.
   */
  get reverberation(): number {
    const s = this.s;
    const r0 = s.re[DIRECT_TAPS] ?? 0;
    const i0 = s.im[DIRECT_TAPS] ?? 0;
    const ref = Math.hypot(r0, i0);
    if (ref === 0) return 0;
    let sum = 0;
    for (let m = 2 * DIRECT_TAPS; m < TAPS; m++)
      sum += Math.hypot((s.re[m] ?? 0) - r0, (s.im[m] ?? 0) - i0);
    return sum / (TAPS - 2 * DIRECT_TAPS) / ref;
  }

  /**
   * Reverberation beyond what noise explains: {@link reverberation} minus the model error. In noise
   * the step response wanders (the tap errors add up like a random walk) – by about as much as the
   * model error says. ≈ 0 in noise without a room, ≥ 0.2 in rooms that defeat level detection.
   */
  get evidence(): number {
    return this.reverberation - this.residual;
  }

  /** Unit learned from the decoded elements, s. */
  get unitSeconds(): number {
    return this.unitHops * this.hopSeconds;
  }

  /** Key state of the active decoder (two hops late). */
  get isKeyDown(): boolean {
    return this.decoder?.on ?? false;
  }

  reset(): void {
    this.n = 0;
    this.prevRe = this.prevIm = this.rotRe = this.rotIm = this.phase = this.peak = 0;
    this.strongHops = 0;
    this.frozen = false;
    this.onsets = [];
    this.decoder = null;
    this.lastRefit = 0;
    this.learnAttempts = 0;
    this.emittedState = false;
    this.emittedSince = 0;
    this.residual = 1;
    this.refits = 0;
  }

  /** A character onset found by the level detector (a mark after a long gap), time in s. */
  onset(time: number): void {
    if (this.decoder) return;
    const first = Math.max(0, this.n - CAPACITY);
    for (let k = this.n - 1; k >= first; k--) {
      if ((this.times[k % CAPACITY] ?? 0) - this.hopSeconds <= time) {
        this.onsets.push(k);
        break;
      }
    }
    while (this.onsets.length && (this.onsets[0] ?? 0) < this.n - CAPACITY + TAPS)
      this.onsets.shift();
  }

  /**
   * One hop: complex tone amplitude, time of the hop end, the speed prior (s per unit).
   * Returns the segments the active decoder finished with this hop.
   */
  push(
    re: number,
    im: number,
    time: number,
    hopSeconds: number,
    priorUnit: number,
  ): KeyingSegment[] {
    this.hopSeconds = hopSeconds;
    this.track(re, im, hopSeconds);
    const c = Math.cos(-this.phase);
    const s = Math.sin(-this.phase);
    const i = this.n % CAPACITY;
    this.re[i] = re * c - im * s;
    this.im[i] = re * s + im * c;
    this.times[i] = time;
    this.n++;

    if (!this.decoder) {
      this.maybeLearn(priorUnit);
      return [];
    }
    this.decoder.step(this.reader, this.n - 1);
    if (this.n - this.lastRefit >= REFIT_SECONDS / hopSeconds) this.refit();
    return this.segments();
  }

  /**
   * Frequency offset: the tone's phase advance per hop, from Y(t)·conj(Y(t−1)) over strong, steady
   * hops only (inside marks, not at edges, not in tails or noise), slowly averaged. Between them
   * the estimate is held, so the phase advances linearly and gaps do not make it wander.
   */
  private track(re: number, im: number, dt: number): void {
    const mag = Math.hypot(re, im);
    const prevMag = Math.hypot(this.prevRe, this.prevIm);
    const kPeak = 1 - Math.exp(-dt / PEAK_SECONDS);
    this.peak = mag > this.peak ? mag : this.peak + (mag - this.peak) * kPeak;
    // late in a long mark only: the room's build-up turns the phase too
    this.strongHops = mag >= STEADY_LEVEL * this.peak ? this.strongHops + 1 : 0;
    const steady =
      this.strongHops * dt >= STEADY_SECONDS &&
      prevMag >= STEADY_LEVEL * this.peak &&
      Math.abs(mag - prevMag) <= STEADY_CHANGE * mag;
    if (steady && !this.frozen) {
      const k = 1 - Math.exp(-dt / ROTATION_SECONDS);
      this.rotRe += (re * this.prevRe + im * this.prevIm - this.rotRe) * k;
      this.rotIm += (im * this.prevRe - re * this.prevIm - this.rotIm) * k;
    }
    this.prevRe = re;
    this.prevIm = im;
    if (this.rotRe !== 0 || this.rotIm !== 0) this.phase += Math.atan2(this.rotIm, this.rotRe);
    if (this.phase > Math.PI) this.phase -= 2 * Math.PI;
    if (this.phase < -Math.PI) this.phase += 2 * Math.PI;
  }

  private readonly reader: Reader = (n) => {
    const i = ((n % CAPACITY) + CAPACITY) % CAPACITY;
    const r = this.re[i] ?? 0;
    const im = this.im[i] ?? 0;
    if (this.trial === 0) return [r, im];
    // trial residual offset while learning
    const a = -this.trial * (n - this.trialFrom);
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [r * c - im * s, r * s + im * c];
  };

  /**
   * Start reporting segments: the key is up since `since` (s) – the space the previous detector
   * had begun continues here.
   */
  startEmitting(since: number): void {
    this.emittedState = false;
    this.emittedSince = since;
  }

  /** Start of the current (reported) state, s. */
  get stateSince(): number {
    return this.emittedSince;
  }

  private segments(): KeyingSegment[] {
    const out: KeyingSegment[] = [];
    for (const [hop, down] of this.decoder?.take() ?? []) {
      const time = this.hopStart(hop);
      if (time <= this.emittedSince || down === this.emittedState) continue;
      out.push({
        state: this.emittedState ? 'mark' : 'space',
        start: this.emittedSince,
        duration: time - this.emittedSince,
      });
      this.emittedState = down;
      this.emittedSince = time;
    }
    return out;
  }

  /** Start of the newest half of hop n's analysis window (the part a transition there falls in). */
  private hopStart(n: number): number {
    return (this.times[((n % CAPACITY) + CAPACITY) % CAPACITY] ?? 0) - this.hopSeconds;
  }

  /** Learns S from the recorded hops once enough character onsets are there. */
  private maybeLearn(priorUnit: number): void {
    const recorded = Math.min(this.n, CAPACITY);
    if (this.onsets.length < MIN_ONSETS || recorded * this.hopSeconds < MIN_LEARN_SECONDS) return;
    // try again only after a few more onsets
    if (this.onsets.length < MIN_ONSETS + 3 * this.learnAttempts) return;
    this.learnAttempts++;
    const first = this.n - recorded;
    const last = this.n - 1;
    let unit = Math.max(3, priorUnit / this.hopSeconds);
    const onsets = this.onsets
      .map((o) => this.align(o))
      .filter((o) => o > first + 8 && o < last - 3 * unit);
    if (onsets.length < MIN_ONSETS - 1) return;

    // 1.–2. the room's first units from the onsets, for each coarse residual offset (the tracker's
    // estimate is biased by the room's own build-up); the offset that decodes the most plausible
    // characters wins
    const prior = unit;
    const candidates: { hz: number; trusted: number; unit: number; residual: number }[] = [];
    for (let hz = -COARSE_SPAN; hz <= COARSE_SPAN + 1e-9; hz += COARSE_STEP) {
      this.trial = hz * 2 * Math.PI * this.hopSeconds;
      this.trialFrom = first;
      const result = this.learnRoom(onsets, first, last, prior);
      candidates.push({ hz, ...result, residual: Infinity });
    }
    // the most plausible decodes; among them the room model that fits best (a wrong offset can
    // still decode a few characters, e.g. at twice the speed)
    candidates.sort((a, b) => b.trusted - a.trusted);
    const top = candidates.filter((c) => c.trusted >= 4 * TAPS).slice(0, COARSE_FINALISTS);
    for (const c of top) {
      this.trial = c.hz * 2 * Math.PI * this.hopSeconds;
      this.learnRoom(onsets, first, last, prior);
      const elements = this.decodeRange(first, last, c.unit).all;
      c.residual = this.fit(elements, first, last, c.unit, 0, false) ?? Infinity;
    }
    this.trial = 0;
    // mild preference for small corrections: the tracker is unbiased without a room
    top.sort(
      (a, b) =>
        a.residual * (1 + OFFSET_PENALTY * Math.abs(a.hz)) -
        b.residual * (1 + OFFSET_PENALTY * Math.abs(b.hz)),
    );
    const best = top[0];
    if (!best || !Number.isFinite(best.residual)) return;
    this.rotate(best.hz * 2 * Math.PI * this.hopSeconds, first);
    unit = this.learnRoom(onsets, first, last, prior).unit;
    let elements = this.decodeRange(first, last, unit).all;
    // 3. fine offset, then least-squares refinements of the whole response
    this.tuneOffset(elements, first, last, unit, OFFSET_SPAN, OFFSET_STEP);
    elements = this.decodeRange(first, last, unit).all;
    for (let r = 0; r < REFINEMENTS; r++) {
      if (this.fit(elements, first, last, unit) === null) {
        this.frozen = false;
        return;
      }
      elements = this.decodeRange(first, last, unit).all;
    }
    if (this.residual > MAX_RESIDUAL) {
      this.frozen = false;
      return;
    }
    // 4. continue online from the end of the recording with the decoded state
    const run = this.decodeRange(first, last, unit);
    this.unitHops = unit;
    this.decoder = run;
    run.take();
    this.emittedState = run.on;
    this.emittedSince = this.hopStart(Math.max(run.lastChange, first));
    this.lastRefit = this.n;
  }

  /**
   * S for the first three units from the onsets (first unit from all, the rest from those whose
   * first element decodes as a dah), and the speed and number of plausibly timed hops it gives.
   */
  private learnRoom(
    onsets: number[],
    first: number,
    last: number,
    prior: number,
  ): { trusted: number; unit: number } {
    const unit = prior;
    this.bootstrap(
      onsets,
      onsets.map(() => Math.round(unit)),
      Math.round(unit),
    );
    let elements = this.decodeRange(first, last, unit).all;
    const lengths = onsets.map((o) => {
      const e = nearest(elements, o);
      const length = e && e.end >= 0 && Math.abs(e.start - o) <= 3 ? e.end - e.start : 0;
      return length >= 2 * unit ? length : Math.round(unit);
    });
    this.bootstrap(onsets, lengths, Math.round(3 * unit));
    elements = this.decodeRange(first, last, unit).all;
    const learned = this.unitFrom(elements, unit);
    return { trusted: trustedRows(elements, learned, first, last).count, unit: learned };
  }

  /** Turns the recording from hop `from` on back by `rotation` per hop, and the tracker with it. */
  private rotate(rotation: number, from: number): void {
    if (rotation === 0) return;
    for (let n = from; n < this.n; n++) {
      const i = n % CAPACITY;
      const a = -rotation * (n - from);
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const r = this.re[i] ?? 0;
      const im = this.im[i] ?? 0;
      this.re[i] = r * c - im * sn;
      this.im[i] = r * sn + im * c;
    }
    // future hops: the tracker's phase continues from the corrected one and turns `rotation` more
    this.phase += rotation * (this.n - from);
    const c = Math.cos(rotation);
    const sn = Math.sin(rotation);
    const rr = this.rotRe;
    this.rotRe = rr * c - this.rotIm * sn;
    this.rotIm = rr * sn + this.rotIm * c;
  }

  /** Hop where the direct sound arrives near onset o: the largest complex step |Y(c+1) − Y(c−1)|. */
  private align(o: number): number {
    let best = o;
    let bestStep = -1;
    for (let c = o - 5; c <= o + 2; c++) {
      const [ar, ai] = this.reader(c + 1);
      const [br, bi] = this.reader(c - 1);
      const step = Math.hypot(ar - br, ai - bi);
      if (step > bestStep) {
        bestStep = step;
        best = c;
      }
    }
    return best;
  }

  /** S from phase-normalised trajectories after the onsets, each used for `lengths[i]` hops. */
  private bootstrap(onsets: number[], lengths: number[], length: number): void {
    const n = Math.min(length, TAPS);
    const accRe = new Float64Array(n);
    const accIm = new Float64Array(n);
    const count = new Float64Array(n);
    onsets.forEach((o, k) => {
      const [rr, ri] = this.reader(o + 2);
      const mag = Math.hypot(rr, ri);
      if (mag === 0) return;
      // multiply by conj(ref)/|ref|: phase 0 at the second hop of the element
      const cr = rr / mag;
      const ci = -ri / mag;
      for (let m = 0; m < Math.min(n, lengths[k] ?? 0); m++) {
        const [yr, yi] = this.reader(o + m);
        accRe[m] = (accRe[m] ?? 0) + yr * cr - yi * ci;
        accIm[m] = (accIm[m] ?? 0) + yr * ci + yi * cr;
        count[m] = (count[m] ?? 0) + 1;
      }
    });
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    let lr = 0;
    let li = 0;
    for (let m = 0; m < n; m++) {
      if ((count[m] ?? 0) >= 2) {
        lr = (accRe[m] ?? 0) / (count[m] ?? 1);
        li = (accIm[m] ?? 0) / (count[m] ?? 1);
      }
      re[m] = lr;
      im[m] = li;
    }
    this.s.set(re, im, n);
  }

  /** Decodes recorded hops first..last with the current S (a fresh decoder). */
  private decodeRange(first: number, last: number, unit: number): ElementDecoder {
    const d = new ElementDecoder(this.s, minRun(unit), true);
    for (let t = first + DELAY; t <= last; t++) d.step(this.reader, t);
    return d;
  }

  /** Unit (hops) from decoded marks and spaces; keeps `fallback` if they are not conclusive. */
  private unitFrom(elements: Element[], fallback: number): number {
    const done = elements.filter((e) => e.end >= 0);
    const marks = done.map((e) => e.end - e.start);
    const spaces: number[] = [];
    for (let k = 1; k < done.length; k++)
      spaces.push((done[k] as Element).start - (done[k - 1] as Element).end);
    if (marks.length < 6) return fallback;
    const est = estimateUnit(marks, spaces, fallback);
    return est.confident ? Math.max(3, est.unit) : fallback;
  }

  /**
   * Least-squares fit of the impulse response g (S = cumulative sum) to the recorded hops, over
   * characters whose decoded timing is plausible. Returns false if there are too few.
   */
  private fit(
    elements: Element[],
    first: number,
    last: number,
    unit: number,
    rotation = 0,
    apply = true,
  ): number | null {
    const rows = trustedRows(elements, unit, first, last);
    if (rows.count < 4 * TAPS) return null;
    // the recording turned back by `rotation` per hop (a residual frequency offset)
    const y = (n: number): [number, number] => {
      const [r, i] = this.reader(n);
      if (rotation === 0) return [r, i];
      const a = -rotation * (n - first);
      const c = Math.cos(a);
      const sn = Math.sin(a);
      return [r * c - i * sn, r * sn + i * c];
    };
    // keying with element amplitudes, z(n) = Σ cₑ over the elements on at n
    const len = last - first + 1;
    const zr = new Float64Array(len);
    const zi = new Float64Array(len);
    for (const e of elements) {
      const end = e.end >= 0 ? e.end : last + 1;
      const a = -rotation * (e.start - first);
      const cr = e.cRe * Math.cos(a) - e.cIm * Math.sin(a);
      const ci = e.cRe * Math.sin(a) + e.cIm * Math.cos(a);
      for (let m = Math.max(e.start, first); m < Math.min(end, last + 1); m++) {
        zr[m - first] = (zr[m - first] ?? 0) + cr;
        zi[m - first] = (zi[m - first] ?? 0) + ci;
      }
    }
    // normal equations A g = b, A = Xᴴ X (Hermitian), rows X(n) = [z(n), z(n−1), …]
    const L = TAPS;
    const aRe = new Float64Array(L * L);
    const aIm = new Float64Array(L * L);
    const bRe = new Float64Array(L);
    const bIm = new Float64Array(L);
    let power = 0;
    for (let n = first + L; n <= last; n++) {
      if (!rows.mask[n - first]) continue;
      const [yr, yi] = y(n);
      power += yr * yr + yi * yi;
      for (let j = 0; j < L; j++) {
        const xr = zr[n - j - first] ?? 0;
        const xi = zi[n - j - first] ?? 0;
        if (xr === 0 && xi === 0) continue;
        // b += conj(x_j) y
        bRe[j] = (bRe[j] ?? 0) + xr * yr + xi * yi;
        bIm[j] = (bIm[j] ?? 0) + xr * yi - xi * yr;
        for (let k = 0; k < L; k++) {
          const wr = zr[n - k - first] ?? 0;
          const wi = zi[n - k - first] ?? 0;
          if (wr === 0 && wi === 0) continue;
          // A[j][k] += conj(x_j) x_k
          aRe[j * L + k] = (aRe[j * L + k] ?? 0) + xr * wr + xi * wi;
          aIm[j * L + k] = (aIm[j * L + k] ?? 0) + xr * wi - xi * wr;
        }
      }
    }
    const g = solveHermitian(aRe, aIm, bRe, bIm, L);
    if (!g) return null;
    // residual of the fit
    let err = 0;
    for (let n = first + L; n <= last; n++) {
      if (!rows.mask[n - first]) continue;
      let pr = 0;
      let pi = 0;
      for (let j = 0; j < L; j++) {
        const xr = zr[n - j - first] ?? 0;
        const xi = zi[n - j - first] ?? 0;
        pr += xr * (g.re[j] ?? 0) - xi * (g.im[j] ?? 0);
        pi += xr * (g.im[j] ?? 0) + xi * (g.re[j] ?? 0);
      }
      const [yr, yi] = y(n);
      err += (yr - pr) ** 2 + (yi - pi) ** 2;
    }
    const residual = power > 0 ? err / power : 1;
    if (!apply) return residual;
    this.residual = residual;
    const re = new Float64Array(L);
    const im = new Float64Array(L);
    let sr = 0;
    let si = 0;
    for (let j = 0; j < L; j++) {
      sr += g.re[j] ?? 0;
      si += g.im[j] ?? 0;
      re[j] = sr;
      im[j] = si;
    }
    this.s.set(re, im, L);
    return residual;
  }

  /**
   * Residual frequency offset: the rotation (Hz, grid ±span) that fits the room model best. Applied
   * to the recording and to the phase tracker, which is held from now on.
   */
  private tuneOffset(
    elements: Element[],
    first: number,
    last: number,
    unit: number,
    span: number,
    step: number,
  ): void {
    const perHz = 2 * Math.PI * this.hopSeconds;
    let best = 0;
    let bestResidual = this.fit(elements, first, last, unit, 0, false) ?? Infinity;
    for (let hz = -span; hz <= span + 1e-9; hz += step) {
      if (Math.abs(hz) < 1e-9) continue;
      const r = this.fit(elements, first, last, unit, hz * perHz, false);
      if (r !== null && r < bestResidual) {
        bestResidual = r;
        best = hz;
      }
    }
    this.frozen = true;
    this.rotate(best * perHz, first);
  }

  /** Online refit of S from the decisions of the recorded window. */
  private refit(): void {
    this.lastRefit = this.n;
    const d = this.decoder;
    if (!d) return;
    const recorded = Math.min(this.n, CAPACITY);
    const first = this.n - recorded;
    const last = this.n - 1 - DELAY;
    // the decoder only keeps recent elements; decode the window again for the fit
    const run = this.decodeRange(first, last, this.unitHops);
    let elements = run.all;
    this.unitHops = this.unitFrom(elements, this.unitHops);
    this.tuneOffset(elements, first, last, this.unitHops, REFIT_OFFSET_SPAN, REFIT_OFFSET_STEP);
    elements = this.decodeRange(first, last, this.unitHops).all;
    if (this.fit(elements, first, last, this.unitHops) === null) return;
    this.refits++;
    if (this.residual > 2 * MAX_RESIDUAL) {
      // the room changed or the model never fitted: learn again
      this.decoder = null;
      this.onsets = [];
      this.learnAttempts = 0;
      this.frozen = false;
      this.refits = 0;
    }
  }
}

function minRun(unit: number): number {
  return Math.max(2, Math.round(0.3 * unit));
}

function nearest(elements: Element[], hop: number): Element | undefined {
  let best: Element | undefined;
  let dist = Infinity;
  for (const e of elements) {
    const d = Math.abs(e.start - hop);
    if (d < dist) {
      dist = d;
      best = e;
    }
  }
  return best;
}

/**
 * Hops (relative to `first`) of characters whose decoded timing is plausible: marks ≈ 1 or 3
 * units, element gaps ≈ 1 unit, followed by a character gap. A decoding error almost always
 * breaks this – those characters would teach the fit the error.
 */
function trustedRows(
  elements: Element[],
  unit: number,
  first: number,
  last: number,
): { mask: Uint8Array; count: number } {
  const mask = new Uint8Array(last - first + 1);
  const done = elements.filter((e) => e.end >= 0);
  const chars: Element[][] = [];
  let cur: Element[] = [];
  for (const e of done) {
    const prev = cur[cur.length - 1];
    if (prev && e.start - prev.end >= 2 * unit) {
      chars.push(cur);
      cur = [];
    }
    cur.push(e);
  }
  if (cur.length) chars.push(cur);
  let count = 0;
  chars.forEach((ch, k) => {
    const lengthOk = ch.every((e) => {
      const d = e.end - e.start;
      return (d >= 0.6 * unit && d <= 1.5 * unit) || (d >= 2.2 * unit && d <= 3.8 * unit);
    });
    let gapsOk = true;
    for (let i = 1; i < ch.length; i++) {
      const g = (ch[i] as Element).start - (ch[i - 1] as Element).end;
      if (g < 0.5 * unit || g > 1.6 * unit) gapsOk = false;
    }
    const next = chars[k + 1]?.[0]?.start ?? last + 1;
    const lastEnd = (ch[ch.length - 1] as Element).end;
    if (!lengthOk || !gapsOk || next - lastEnd < 2.5 * unit) return;
    const from = Math.max((ch[0] as Element).start, first);
    const to = Math.min(lastEnd + TAPS, next, last + 1);
    for (let n = from; n < to; n++) {
      if (!mask[n - first]) count++;
      mask[n - first] = 1;
    }
  });
  return { mask, count };
}

/** Solves the Hermitian system A x = b (Cholesky); null if A is not positive definite. */
function solveHermitian(
  aRe: Float64Array,
  aIm: Float64Array,
  bRe: Float64Array,
  bIm: Float64Array,
  n: number,
): { re: Float64Array; im: Float64Array } | null {
  // light regularisation: taps the keying never excited stay near zero
  let trace = 0;
  for (let i = 0; i < n; i++) trace += aRe[i * n + i] ?? 0;
  const eps = (1e-6 * trace) / n;
  const lRe = new Float64Array(n * n);
  const lIm = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      // s = A[i][j] − Σ_k L[i][k] conj(L[j][k])
      let sr = aRe[i * n + j] ?? 0;
      let si = aIm[i * n + j] ?? 0;
      if (i === j) sr += eps;
      for (let k = 0; k < j; k++) {
        const ar = lRe[i * n + k] ?? 0;
        const ai = lIm[i * n + k] ?? 0;
        const br = lRe[j * n + k] ?? 0;
        const bi = lIm[j * n + k] ?? 0;
        sr -= ar * br + ai * bi;
        si -= ai * br - ar * bi;
      }
      if (i === j) {
        if (sr <= 0) return null;
        lRe[i * n + i] = Math.sqrt(sr);
        lIm[i * n + i] = 0;
      } else {
        const d = lRe[j * n + j] ?? 1;
        lRe[i * n + j] = sr / d;
        lIm[i * n + j] = si / d;
      }
    }
  }
  // forward: L y = b
  const yRe = new Float64Array(n);
  const yIm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sr = bRe[i] ?? 0;
    let si = bIm[i] ?? 0;
    for (let k = 0; k < i; k++) {
      const ar = lRe[i * n + k] ?? 0;
      const ai = lIm[i * n + k] ?? 0;
      sr -= ar * (yRe[k] ?? 0) - ai * (yIm[k] ?? 0);
      si -= ar * (yIm[k] ?? 0) + ai * (yRe[k] ?? 0);
    }
    const d = lRe[i * n + i] ?? 1;
    yRe[i] = sr / d;
    yIm[i] = si / d;
  }
  // backward: Lᴴ x = y
  const xRe = new Float64Array(n);
  const xIm = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sr = yRe[i] ?? 0;
    let si = yIm[i] ?? 0;
    for (let k = i + 1; k < n; k++) {
      // Lᴴ[i][k] = conj(L[k][i])
      const ar = lRe[k * n + i] ?? 0;
      const ai = -(lIm[k * n + i] ?? 0);
      sr -= ar * (xRe[k] ?? 0) - ai * (xIm[k] ?? 0);
      si -= ar * (xIm[k] ?? 0) + ai * (xRe[k] ?? 0);
    }
    const d = lRe[i * n + i] ?? 1;
    xRe[i] = sr / d;
    xIm[i] = si / d;
  }
  return { re: xRe, im: xIm };
}
