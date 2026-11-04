/**
 * Runs the Morse decoder over the real recordings in morse-training/ (Node only, bundled and
 * started by scripts/morse-corpus.mjs). Not part of `ng test`: the corpus is large and the WAVs
 * are generated locally.
 */
import { mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import {
  MorseDecoder,
  MorseDecoderConfig,
  MorseEvent,
  eventsToText,
} from '../../app/decoders/morse/morse-decoder';
import { SENSITIVITY_PRESETS, Sensitivity } from '../../app/features/morse-decoder/morse-settings';
import { createGaussian, createRandom } from '../../app/audio/synthesis/random';
import { characterErrorRate } from '../signals/cer';
import { roomReverb } from '../signals/room-reverb';

interface Options {
  filter?: string;
  rate?: number;
  snr?: number;
  reverb?: number;
  wet: number;
  room: number;
  sensitivity: Sensitivity;
  config: Partial<MorseDecoderConfig>;
  out?: string;
  json: boolean;
  verbose: boolean;
}

export interface CorpusResult {
  readonly name: string;
  readonly seconds: number;
  readonly rate: number;
  readonly cer: number | null;
  readonly refLength: number;
  readonly gotLength: number;
  readonly unknown: number;
  readonly wpm: number | null;
  readonly frequency: number | null;
  readonly text: string;
}

export async function runCorpus(env: {
  corpus: string;
  wavDir: string;
  args: string[];
}): Promise<number> {
  const o = parseArgs(env.args);
  const names = readdirSync(env.wavDir)
    .filter((f) => f.endsWith('.wav'))
    .map((f) => parse(f).name)
    .filter((n) => !o.filter || n.includes(o.filter))
    .sort();
  if (o.out) mkdirSync(o.out, { recursive: true });

  const results: CorpusResult[] = [];
  for (const name of names) {
    const wav = decodeWav(readFileSync(join(env.wavDir, `${name}.wav`)));
    let samples = wav.samples;
    let rate = wav.sampleRate;
    if (o.rate && o.rate !== rate) {
      samples = resampleLinear(samples, rate, o.rate);
      rate = o.rate;
    }
    samples = impair(samples, rate, o);
    const decoder = new MorseDecoder({
      ...SENSITIVITY_PRESETS[o.sensitivity],
      ...o.config,
    });
    const events = decoder.decodeAll(samples, rate, Math.round(rate * 0.02));
    const text = normalise(eventsToText(events));
    const refFile = referenceFile(env.corpus, name);
    const ref = refFile ? normalise(readFileSync(refFile, 'utf8')) : null;
    const result: CorpusResult = {
      name,
      seconds: samples.length / rate,
      rate,
      cer: ref === null ? null : characterErrorRate(ref, text),
      refLength: ref?.length ?? 0,
      gotLength: text.length,
      unknown: events.filter((e) => e.type === 'character' && !e.known).length,
      wpm: medianWpm(events),
      frequency: dominantFrequency(events),
      text,
    };
    results.push(result);
    if (o.out) {
      writeFileSync(join(o.out, `${name}.got.txt`), text + '\n');
      if (ref !== null) writeFileSync(join(o.out, `${name}.ref.txt`), ref + '\n');
      writeFileSync(
        join(o.out, `${name}.events.jsonl`),
        events
          .filter((e) => e.type !== 'tone')
          .map((e) => JSON.stringify(e))
          .join('\n') + '\n',
      );
    }
    if (!o.json) printRow(result, o.verbose);
  }

  if (o.json) {
    console.log(
      JSON.stringify({ options: o, results: results.map(({ text: _, ...r }) => r) }, null, 2),
    );
  } else {
    const scored = results.filter((r) => r.cer !== null);
    const chars = scored.reduce((n, r) => n + r.refLength, 0);
    const errors = scored.reduce((n, r) => n + (r.cer ?? 0) * r.refLength, 0);
    const impairments = [
      o.rate && `rate ${o.rate} Hz`,
      o.snr !== undefined && `SNR ${o.snr} dB`,
      o.reverb !== undefined && `reverb RT60 ${o.reverb} s / wet ${o.wet} / room ${o.room}`,
      `sensitivity ${o.sensitivity}`,
    ].filter(Boolean);
    console.log(
      `\n${scored.length} scored, overall CER ${chars ? ((100 * errors) / chars).toFixed(1) : '–'} % (${impairments.join(', ')})`,
    );
  }
  return 0;
}

/** W1AW texts: "<" is AR (sent as +), typographic quotes become plain ones, whitespace collapses. */
export function normalise(text: string): string {
  return text
    .toUpperCase()
    .replace(/</g, '+')
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function referenceFile(corpus: string, name: string): string | null {
  for (const candidate of [name, name.replace(/WPM$/i, '')]) {
    const file = join(corpus, `${candidate}.txt`);
    if (existsSync(file)) return file;
  }
  return null;
}

function printRow(r: CorpusResult, verbose: boolean): void {
  const cer = r.cer === null ? '   (no text)' : `CER ${(100 * r.cer).toFixed(1).padStart(5)} %`;
  console.log(
    `${r.name.padEnd(22)} ${cer}  ${String(r.gotLength).padStart(5)}/${String(r.refLength).padEnd(5)} chars  ` +
      `${String(r.unknown).padStart(3)} unknown  ${r.wpm ?? '–'} WPM  ${r.frequency ?? '–'} Hz  ${r.seconds.toFixed(0)} s`,
  );
  if (verbose || r.cer === null)
    console.log(`  “${r.text.slice(0, 400)}${r.text.length > 400 ? '…' : ''}”`);
}

function medianWpm(events: readonly MorseEvent[]): number | null {
  const w = events.flatMap((e) => (e.type === 'wpm' ? [e.wpm] : [])).sort((a, b) => a - b);
  return w.length ? (w[Math.floor(w.length / 2)] ?? null) : null;
}

function dominantFrequency(events: readonly MorseEvent[]): number | null {
  const counts = new Map<number, number>();
  for (const e of events)
    if (e.type === 'tone' && e.keyDown) counts.set(e.frequency, (counts.get(e.frequency) ?? 0) + 1);
  let best: number | null = null;
  let n = 0;
  for (const [f, c] of counts) if (c > n) [best, n] = [f, c];
  return best;
}

// --- impairments -------------------------------------------------------------------------------

function impair(input: Float32Array, rate: number, o: Options): Float32Array {
  let samples = input;
  let peak = 0;
  for (const x of samples) peak = Math.max(peak, Math.abs(x));
  if (o.reverb !== undefined)
    samples = roomReverb(samples, rate, { rt60Seconds: o.reverb, wet: o.wet, seed: o.room });
  if (o.snr !== undefined) {
    samples = samples === input ? samples.slice() : samples;
    const sigma = peak / Math.SQRT2 / Math.pow(10, o.snr / 20);
    const random = createGaussian(createRandom(12345));
    for (let i = 0; i < samples.length; i++) samples[i] = (samples[i] ?? 0) + sigma * random();
  }
  return samples;
}

function resampleLinear(input: Float32Array, from: number, to: number): Float32Array {
  const out = new Float32Array(Math.floor((input.length * to) / from));
  const step = from / to;
  for (let i = 0; i < out.length; i++) {
    const p = i * step;
    const j = Math.floor(p);
    const f = p - j;
    out[i] = (input[j] ?? 0) * (1 - f) + (input[j + 1] ?? 0) * f;
  }
  return out;
}

// --- WAV + CLI -------------------------------------------------------------------------------

/** Minimal RIFF/WAVE reader: PCM 16 bit or IEEE float 32, mono (first channel otherwise). */
export function decodeWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let format = 1;
  let channels = 1;
  let sampleRate = 0;
  let bits = 16;
  while (offset + 8 <= view.byteLength) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      const bytesPerSample = bits / 8;
      const frames = Math.floor(
        Math.min(size, view.byteLength - body) / (bytesPerSample * channels),
      );
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        const p = body + i * bytesPerSample * channels;
        samples[i] = format === 3 ? view.getFloat32(p, true) : view.getInt16(p, true) / 32768;
      }
      return { samples, sampleRate };
    }
    offset = body + size + (size & 1);
  }
  throw new Error('no data chunk');
}

function parseArgs(args: string[]): Options {
  const o: Options = {
    wet: 0.5,
    room: 1,
    sensitivity: 'medium',
    config: {},
    json: false,
    verbose: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const v = () => {
      const value = args[++i];
      if (value === undefined) throw new Error(`${a} needs a value`);
      return value;
    };
    if (a === '--filter') o.filter = v();
    else if (a === '--rate') o.rate = Number(v());
    else if (a === '--snr') o.snr = Number(v());
    else if (a === '--reverb') o.reverb = Number(v());
    else if (a === '--wet') o.wet = Number(v());
    else if (a === '--room') o.room = Number(v());
    else if (a === '--sensitivity') o.sensitivity = v() as Sensitivity;
    else if (a === '--config') o.config = JSON.parse(v()) as Partial<MorseDecoderConfig>;
    else if (a === '--out') o.out = v();
    else if (a === '--json') o.json = true;
    else if (a === '--verbose') o.verbose = true;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}
