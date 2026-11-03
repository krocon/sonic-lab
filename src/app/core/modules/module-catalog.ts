import { AnalysisModule, ModuleGroup } from './analysis-module';

/**
 * Single source of truth for the mode keys and routing.
 * Adding a module = one entry here + a route (see docs/ARCHITECTURE.md).
 */
export const ANALYSIS_MODULES: readonly AnalysisModule[] = [
  {
    id: 'morse-decoder',
    path: 'morse-decoder',
    title: 'Morse Decoder',
    key: 'Morse',
    summary: 'Detects acoustic Morse code and translates it into plain text.',
    group: 'decode',
    icon: 'morse',
    status: 'available',
    prompt: '03-morse-decoder.md',
  },
  {
    id: 'dtmf-decoder',
    path: 'dtmf-decoder',
    title: 'DTMF Decoder',
    key: 'DTMF',
    summary: 'Recognises telephone keypad tones (Goertzel).',
    group: 'decode',
    icon: 'keypad',
    status: 'available',
    prompt: '07-dtmf-decoder.md',
  },
  {
    id: 'frequency-analyzer',
    path: 'frequency-analyzer',
    title: 'Frequency Analyzer',
    key: 'Freq',
    summary: 'Shows the dominant frequency and its stability over time.',
    group: 'analyze',
    icon: 'frequency',
    status: 'available',
    prompt: '06-frequency-and-spectrum-analyzer.md',
  },
  {
    id: 'spectrum-analyzer',
    path: 'spectrum-analyzer',
    title: 'Spectrum Analyzer',
    key: 'Spectrum',
    summary: 'FFT-based spectrum and spectrogram display.',
    group: 'analyze',
    icon: 'spectrum',
    status: 'available',
    prompt: '06-frequency-and-spectrum-analyzer.md',
  },
  {
    id: 'signal-monitor',
    path: 'signal-monitor',
    title: 'Signal Monitor',
    key: 'Monitor',
    summary: 'Level, frequency and their history at a glance.',
    group: 'analyze',
    icon: 'monitor',
    status: 'available',
    prompt: '06-frequency-and-spectrum-analyzer.md',
  },
  {
    id: 'morse-encoder',
    path: 'morse-encoder',
    title: 'Morse Encoder',
    key: 'Morse',
    summary: 'Turns text into Morse code and audible tones.',
    group: 'generate',
    icon: 'encode',
    status: 'available',
    prompt: '05-morse-encoder.md',
  },
  {
    id: 'tone-generator',
    path: 'tone-generator',
    title: 'Tone Generator',
    key: 'Tone',
    summary: 'Sine, square, sawtooth and noise test signals.',
    group: 'generate',
    icon: 'tone',
    status: 'available',
    prompt: '08-tone-generator-and-recorder.md',
  },
  {
    id: 'audio-recorder',
    path: 'audio-recorder',
    title: 'Audio Recorder',
    key: 'Rec',
    summary: 'Records audio locally and exports it on request.',
    group: 'generate',
    icon: 'record',
    status: 'available',
    prompt: '08-tone-generator-and-recorder.md',
  },
];

export const MODULE_GROUPS: readonly { readonly id: ModuleGroup; readonly label: string }[] = [
  { id: 'decode', label: 'Decode' },
  { id: 'analyze', label: 'Analyze' },
  { id: 'generate', label: 'Generate & Record' },
];

export function findModule(id: string): AnalysisModule | undefined {
  return ANALYSIS_MODULES.find((m) => m.id === id);
}

export function modulesInGroup(group: ModuleGroup): readonly AnalysisModule[] {
  return ANALYSIS_MODULES.filter((m) => m.group === group);
}
