import { AnalysisModule, ModuleGroup } from './analysis-module';

/**
 * Single source of truth for navigation, overview and routing.
 * Adding a module = one entry here + a route (see docs/ARCHITECTURE.md).
 */
export const ANALYSIS_MODULES: readonly AnalysisModule[] = [
  {
    id: 'morse-decoder',
    path: 'morse-decoder',
    title: 'Morse Decoder',
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
    summary: 'Recognises telephone keypad tones (Goertzel).',
    group: 'decode',
    icon: 'keypad',
    status: 'planned',
    prompt: '07-dtmf-decoder.md',
  },
  {
    id: 'frequency-analyzer',
    path: 'frequency-analyzer',
    title: 'Frequency Analyzer',
    summary: 'Shows the dominant frequency and its stability over time.',
    group: 'analyze',
    icon: 'frequency',
    status: 'planned',
    prompt: '06-frequency-and-spectrum-analyzer.md',
  },
  {
    id: 'spectrum-analyzer',
    path: 'spectrum-analyzer',
    title: 'Spectrum Analyzer',
    summary: 'FFT-based spectrum and spectrogram display.',
    group: 'analyze',
    icon: 'spectrum',
    status: 'planned',
    prompt: '06-frequency-and-spectrum-analyzer.md',
  },
  {
    id: 'signal-monitor',
    path: 'signal-monitor',
    title: 'Signal Monitor',
    summary: 'Level, frequency and their history at a glance.',
    group: 'analyze',
    icon: 'monitor',
    status: 'planned',
    prompt: '06-frequency-and-spectrum-analyzer.md',
  },
  {
    id: 'morse-encoder',
    path: 'morse-encoder',
    title: 'Morse Encoder',
    summary: 'Turns text into Morse code and audible tones.',
    group: 'generate',
    icon: 'encode',
    status: 'planned',
    prompt: '05-morse-encoder.md',
  },
  {
    id: 'tone-generator',
    path: 'tone-generator',
    title: 'Tone Generator',
    summary: 'Sine, square, sawtooth and noise test signals.',
    group: 'generate',
    icon: 'tone',
    status: 'planned',
    prompt: '08-tone-generator-and-recorder.md',
  },
  {
    id: 'audio-recorder',
    path: 'audio-recorder',
    title: 'Audio Recorder',
    summary: 'Records audio locally and exports it on request.',
    group: 'generate',
    icon: 'record',
    status: 'planned',
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
