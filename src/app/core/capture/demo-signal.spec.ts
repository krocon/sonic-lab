import { render } from '../../audio/synthesis/signal';
import { MorseDecoder, eventsToText } from '../../decoders/morse/morse-decoder';
import { DEMO_TEXT, demoSignal } from './demo-signal';

describe('demo signal', () => {
  it('is a decodable Morse message', () => {
    const samples = render(demoSignal(), 18, 48000);
    expect(eventsToText(new MorseDecoder().decodeAll(samples, 48000))).toContain(DEMO_TEXT);
  });
});

describe('analysis and DTMF demo signals', () => {
  it('DTMF demo decodes to all 16 keys and loops seamlessly across blocks', async () => {
    const { demoDtmfSignal, DTMF_DEMO_KEYS } = await import('./demo-signal');
    const { DtmfDecoder } = await import('../../decoders/dtmf/dtmf-decoder');
    const gen = demoDtmfSignal();
    const rate = 16000;
    const out = new Float32Array(rate * 9);
    const block = new Float32Array(1000);
    for (let i = 0; i < out.length; i += block.length) {
      gen(block, i, rate);
      out.set(block.subarray(0, Math.min(block.length, out.length - i)), i);
    }
    expect(new DtmfDecoder().decodeAll(out, rate)).toContain(DTMF_DEMO_KEYS);
  });

  it('analysis demo glides between 220 and 1760 Hz', async () => {
    const { demoAnalysisSignal } = await import('./demo-signal');
    const { SpectrumAnalyzer, findPeak } = await import('../../audio/dsp/spectrum');
    const gen = demoAnalysisSignal();
    const a = new SpectrumAnalyzer({ size: 4096, averaging: 0 });
    const block = new Float32Array(4096);
    const peaks: number[] = [];
    for (let i = 0; i < 48000 * 8; i += 4096) {
      gen(block, i, 48000);
      a.process(block, 48000);
      peaks.push(findPeak(a, 100, 2500)?.frequency ?? 0);
    }
    expect(Math.min(...peaks.filter((p) => p > 0))).toBeLessThan(260);
    expect(Math.max(...peaks)).toBeGreaterThan(1500);
  });
});
