import { render } from '../../audio/synthesis/signal';
import { MorseDecoder, eventsToText } from '../../decoders/morse/morse-decoder';
import { DEMO_TEXT, demoSignal } from './demo-signal';

describe('demo signal', () => {
  it('is a decodable Morse message', () => {
    const samples = render(demoSignal(), 18, 48000);
    expect(eventsToText(new MorseDecoder().decodeAll(samples, 48000))).toContain(DEMO_TEXT);
  });
});
