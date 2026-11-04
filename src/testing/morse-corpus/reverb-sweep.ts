/**
 * Reverberation sweep for the Morse decoder (Node only, bundled and started by
 * scripts/morse-corpus.mjs `sweep`). Synthetic Morse with a known text goes through simulated
 * rooms (RT60, reverberant share, several impulse responses) at several speeds; the result is a
 * CER matrix. Unlike the real recordings, the keying is known exactly, so the numbers are
 * comparable between decoder versions.
 */
import {
  MorseDecoder,
  MorseDecoderConfig,
  eventsToText,
} from '../../app/decoders/morse/morse-decoder';
import { SENSITIVITY_PRESETS, Sensitivity } from '../../app/features/morse-decoder/morse-settings';
import { characterErrorRate } from '../signals/cer';
import { impairedMorse } from '../signals/impaired-morse';

/** Mixed QSO and plain text, ≈ 200 characters: letters, digits, punctuation, prosigns. */
export const SWEEP_TEXT =
  'CQ CQ DE DL1ABC DL1ABC K = GM OM TNX FER CALL UR RST 579 579 = NAME MARC QTH BERLIN = ' +
  'WX CLOUDY ES 12C = RIG IC7300 ES DIPOLE AT 15M = HW CPY? AR KN ' +
  'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG 1234567890 /?.,';

export interface SweepCase {
  readonly wpm: number;
  readonly rt60: number;
  readonly wet: number;
  readonly room: number;
}

export interface SweepResult extends SweepCase {
  readonly cer: number;
  readonly wpmEstimate: number | null;
  readonly text: string;
}

interface Options {
  speeds: number[];
  rooms: number[];
  reverbs: { rt60: number; wet: number }[];
  snr: number;
  rate: number;
  sensitivity: Sensitivity;
  config: Partial<MorseDecoderConfig>;
  json: boolean;
  verbose: boolean;
  text: string;
}

export function runSweepCase(
  c: SweepCase,
  o: Pick<Options, 'snr' | 'rate' | 'sensitivity' | 'config' | 'text'>,
): SweepResult {
  const signal = impairedMorse(o.text, {
    wpm: c.wpm,
    sampleRate: o.rate,
    snrDb: o.snr,
    seed: c.room,
    reverb: c.rt60 > 0 ? { rt60Seconds: c.rt60, wet: c.wet, seed: c.room } : undefined,
  });
  const decoder = new MorseDecoder({ ...SENSITIVITY_PRESETS[o.sensitivity], ...o.config });
  const events = decoder.decodeAll(signal.samples, signal.sampleRate, Math.round(o.rate * 0.02));
  const text = eventsToText(events);
  return { ...c, cer: characterErrorRate(o.text, text), wpmEstimate: decoder.wpm, text };
}

export async function runSweep(env: { args: string[] }): Promise<number> {
  const o = parseArgs(env.args);
  const results: SweepResult[] = [];
  for (const r of o.reverbs)
    for (const wpm of o.speeds)
      for (const room of o.rooms) results.push(runSweepCase({ wpm, room, ...r }, o));

  if (o.json) {
    console.log(JSON.stringify(results.map(({ text: _, ...r }) => r)));
    return 0;
  }
  const pct = (x: number) => `${(100 * x).toFixed(1)}`.padStart(5);
  console.log(
    `CER % (mean over rooms ${o.rooms.join(',')}; [rooms < 5 %]); SNR ${o.snr} dB (500 Hz), ${o.rate} Hz, sensitivity ${o.sensitivity}`,
  );
  console.log(`${'RT60 / wet'.padEnd(14)}${o.speeds.map((s) => `${s} WPM`.padStart(14)).join('')}`);
  let total = 0;
  for (const r of o.reverbs) {
    const cells = o.speeds.map((wpm) => {
      const rows = results.filter((x) => x.wpm === wpm && x.rt60 === r.rt60 && x.wet === r.wet);
      const mean = rows.reduce((a, x) => a + x.cer, 0) / rows.length;
      const good = rows.filter((x) => x.cer < 0.05).length;
      total += mean;
      return `${pct(mean)} [${good}/${rows.length}]`.padStart(14);
    });
    console.log(`${`${r.rt60} s / ${r.wet}`.padEnd(14)}${cells.join('')}`);
  }
  const cells = o.reverbs.length * o.speeds.length;
  console.log(`\nscore (mean CER over all cells): ${pct(total / cells)} %`);
  if (o.verbose)
    for (const x of results)
      console.log(
        `${x.rt60}/${x.wet} ${x.wpm} WPM room ${x.room}: CER ${pct(x.cer)} %, ${x.wpmEstimate?.toFixed(1) ?? '–'} WPM  “${x.text.slice(0, 120)}”`,
      );
  return 0;
}

function parseArgs(args: string[]): Options {
  const o: Options = {
    speeds: [12, 18, 25, 30, 40],
    rooms: [1, 2, 3, 4, 5, 6],
    reverbs: [
      { rt60: 0.3, wet: 0.25 },
      { rt60: 0.3, wet: 0.5 },
      { rt60: 0.6, wet: 0.25 },
      { rt60: 0.6, wet: 0.5 },
    ],
    snr: 30,
    rate: 16000,
    sensitivity: 'medium',
    config: {},
    json: false,
    verbose: false,
    text: SWEEP_TEXT,
  };
  const list = (v: string) => v.split(',').map(Number);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const v = () => {
      const value = args[++i];
      if (value === undefined) throw new Error(`${a} needs a value`);
      return value;
    };
    if (a === '--speeds') o.speeds = list(v());
    else if (a === '--rooms') o.rooms = list(v());
    else if (a === '--reverbs')
      // "0.3/0.25,0.6/0.5"
      o.reverbs = v()
        .split(',')
        .map((p) => {
          const [rt60, wet] = p.split('/').map(Number);
          return { rt60: rt60 ?? 0, wet: wet ?? 0.5 };
        });
    else if (a === '--snr') o.snr = Number(v());
    else if (a === '--rate') o.rate = Number(v());
    else if (a === '--sensitivity') o.sensitivity = v() as Sensitivity;
    else if (a === '--config') o.config = JSON.parse(v()) as Partial<MorseDecoderConfig>;
    else if (a === '--text') o.text = v();
    else if (a === '--json') o.json = true;
    else if (a === '--verbose') o.verbose = true;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}
