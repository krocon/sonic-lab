// Prints the CHANGELOG section of a version (used as GitHub release body).
//   node scripts/release-notes.mjs 0.2.0     (a leading "v" is ignored)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function releaseNotes(changelog, version) {
  const v = version.replace(/^v/, '');
  const lines = changelog.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## [${v}]`));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## ['));
  const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
  return body || null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(fileURLToPath(import.meta.url), '../..');
  const version = process.argv[2];
  const notes = version ? releaseNotes(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version) : null;
  if (!notes) {
    console.error(`No CHANGELOG section for ${version ?? '(missing version)'}`);
    process.exit(1);
  }
  console.log(notes);
}
