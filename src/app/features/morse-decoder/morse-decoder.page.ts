import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon/icon';

/**
 * Workspace layout of the Morse decoder.
 * Phase B ships the layout only: audio capture arrives with prompt 02, decoding with 03/04.
 * Controls are rendered disabled so the final information architecture can be reviewed.
 */
@Component({
  selector: 'app-morse-decoder-page',
  imports: [Icon],
  templateUrl: './morse-decoder.page.html',
  styleUrl: './morse-decoder.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MorseDecoderPage {}
