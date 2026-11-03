import { AudioFrame } from '../audio/audio-frame';
import { DecoderEvent, SignalDecoder } from './signal-decoder';

interface PeakEvent extends DecoderEvent {
  readonly type: 'peak';
  readonly value: number;
}

/** Minimal decoder proving the contract is usable without Angular. */
class PeakDecoder implements SignalDecoder<{ threshold: number }, PeakEvent> {
  readonly id = 'peak';
  readonly name = 'Peak';
  private threshold = 0.5;
  configure(config: Partial<{ threshold: number }>): void {
    this.threshold = config.threshold ?? this.threshold;
  }
  process(frame: AudioFrame): PeakEvent[] {
    let max = 0;
    for (const s of frame.samples) max = Math.max(max, Math.abs(s));
    return max >= this.threshold ? [{ type: 'peak', timestamp: frame.timestamp, value: max }] : [];
  }
  reset(): void {
    this.threshold = 0.5;
  }
}

describe('SignalDecoder contract', () => {
  it('can be implemented and driven with plain frames', () => {
    const d = new PeakDecoder();
    const frame: AudioFrame = {
      samples: new Float32Array([0.1, -0.7]),
      sampleRate: 8000,
      timestamp: 1,
    };
    expect(d.process(frame)).toEqual([
      { type: 'peak', timestamp: 1, value: expect.closeTo(0.7, 5) },
    ]);
    d.configure({ threshold: 0.9 });
    expect(d.process(frame)).toEqual([]);
    d.reset();
    expect(d.process(frame).length).toBe(1);
  });
});
