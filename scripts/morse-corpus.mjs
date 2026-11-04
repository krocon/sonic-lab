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
else {
  console.error(`unknown command "${command}" – use convert or run`);
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
  const outfile = join(tmpdir(), `morse-corpus-${process.pid}.mjs`);
  await build({
    entryPoints: ['src/testing/morse-corpus/run-corpus.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'warning',
  });
  const { runCorpus } = await import(pathToFileURL(outfile).href);
  const code = await runCorpus({ corpus: CORPUS, wavDir: WAV_DIR, args });
  process.exit(code);
}
