// Real-recording test corpus for the Morse decoder (morse-training/).
//
//   node scripts/morse-corpus.mjs convert            decode every recording to morse-training/wav/*.wav
//   node scripts/morse-corpus.mjs run [options]      run the decoder over the WAVs, print CER per file
//
// Recordings: any audio file ffmpeg can read (mp3, opus, ogg, m4a, flac, wav) directly in
// morse-training/. The reference text is <name>.txt or – for "<name>WPM.mp3" – <name>.txt.
// Recordings without a text are decoded and printed only. The WAVs (16-bit PCM, mono, source
// rate capped at 16 kHz) are generated and git-ignored; `convert` only redoes stale ones.
//
// run options:
//   --filter <substring>     only recordings whose name contains it
//   --rate <Hz>              resample before decoding (the app runs at 48000; default: WAV rate)
//   --snr <dB>               add white noise; tone power / noise power over the whole band
//   --reverb <RT60 s>        add room reverb (decaying-noise IR), --wet <0..1> reverberant energy share (default 0.5)
//   --room <n>               which simulated room (impulse response seed, default 1)
//   --sensitivity <low|medium|high>   app sensitivity preset (default medium)
//   --config '<json>'        extra MorseDecoderConfig fields, e.g. '{"frequency":750}'
//   --out <dir>              write <name>.got.txt / .ref.txt / .events.jsonl there
//   --json                   machine-readable result
//   --verbose                print the decoded text of every recording
//
//   node scripts/morse-corpus.mjs sweep [options]    synthetic text through simulated rooms: CER matrix
//
// sweep options: --speeds 12,18,25,30,40  --rooms 1,2,3,4,5,6  --reverbs 0.3/0.25,0.6/0.5 (RT60 s /
// reverberant share)  --snr <dB, 500 Hz>  --rate <Hz>  --sensitivity  --config  --text  --json  --verbose
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { pathToFileURL } from 'node:url';

const CORPUS = 'morse-training';
const WAV_DIR = join(CORPUS, 'wav');
const AUDIO = /\.(mp3|opus|ogg|oga|m4a|aac|flac|wav)$/i;
const MAX_RATE = 16000;

const [command = 'run', ...rest] = process.argv.slice(2);

if (command === 'convert') convert();
else if (command === 'run') await run(rest);
else if (command === 'sweep') await sweep(rest);
else {
  console.error(`unknown command "${command}" – use convert, run or sweep`);
  process.exit(2);
}

function recordings() {
  return readdirSync(CORPUS)
    .filter((f) => AUDIO.test(f) && statSync(join(CORPUS, f)).isFile())
    .sort();
}

function convert() {
  mkdirSync(WAV_DIR, { recursive: true });
  let converted = 0;
  for (const file of recordings()) {
    const src = join(CORPUS, file);
    const dst = join(WAV_DIR, `${parse(file).name}.wav`);
    if (existsSync(dst) && statSync(dst).mtimeMs >= statSync(src).mtimeMs) continue;
    const probe = execFileSync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=sample_rate',
      '-of',
      'csv=p=0',
      src,
    ])
      .toString()
      .trim();
    const rate = Math.min(MAX_RATE, parseInt(probe, 10) || MAX_RATE);
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-i',
      src,
      '-ac',
      '1',
      '-ar',
      String(rate),
      '-c:a',
      'pcm_s16le',
      dst,
    ]);
    console.log(`${file} → ${dst} (${rate} Hz)`);
    converted++;
  }
  console.log(`${converted} converted, ${recordings().length} recordings in ${CORPUS}/`);
}

async function run(args) {
  if (!existsSync(WAV_DIR)) convert();
  const { runCorpus } = await bundle('src/testing/morse-corpus/run-corpus.ts');
  const code = await runCorpus({ corpus: CORPUS, wavDir: WAV_DIR, args });
  process.exit(code);
}

async function sweep(args) {
  const { runSweep } = await bundle('src/testing/morse-corpus/reverb-sweep.ts');
  process.exit(await runSweep({ args }));
}

/** Bundles a TypeScript entry point for Node and imports it. */
async function bundle(entry) {
  const outfile = join(tmpdir(), `morse-${parse(entry).name}-${process.pid}.mjs`);
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'warning',
  });
  return import(pathToFileURL(outfile).href);
}
