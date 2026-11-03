import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ModulePlaceholderPage } from './module-placeholder.page';

describe('ModulePlaceholderPage', () => {
  it('names the module and its follow-up prompt', async () => {
    TestBed.configureTestingModule({
      imports: [ModulePlaceholderPage],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(ModulePlaceholderPage);
    fixture.componentRef.setInput('moduleId', 'dtmf-decoder');
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('DTMF Decoder');
    expect(text).toContain('prompts/07-dtmf-decoder.md');
  });

  it('renders nothing for an unknown id', async () => {
    TestBed.configureTestingModule({
      imports: [ModulePlaceholderPage],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(ModulePlaceholderPage);
    fixture.componentRef.setInput('moduleId', 'nope');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h1')).toBeNull();
  });
});
