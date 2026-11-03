import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { check, cutChangelog, setVersion } from './version.mjs';
import { releaseNotes } from './release-notes.mjs';

function fixture(pkg = '0.1.0', cargo = '0.1.0', lock = '0.1.0') {
  const root = mkdtempSync(join(tmpdir(), 'audiolab-version-'));
  mkdirSync(join(root, 'src-tauri'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'audiolab', version: pkg }, null, 2));
  writeFileSync(join(root, 'src-tauri/Cargo.toml'), `[package]\nname = "audiolab"\nversion = "${cargo}"\n\n[dependencies]\nserde = { version = "1.0" }\n`);
  writeFileSync(
    join(root, 'src-tauri/Cargo.lock'),
    `[[package]]\nname = "atty"\nversion = "9.9.9"\n\n[[package]]\nname = "audiolab"\nversion = "${lock}"\ndependencies = []\n`,
  );
  writeFileSync(join(root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Thing.\n');
  return root;
}

test('check detects mismatches', () => {
  assert.equal(check(fixture()).ok, true);
  assert.equal(check(fixture('0.1.0', '0.2.0')).ok, false);
  assert.equal(check(fixture('0.1.0', '0.1.0', '0.0.9')).ok, false);
});

test('set updates all files and only the app crate', () => {
  const root = fixture();
  setVersion(root, '1.2.3');
  assert.deepEqual(check(root), { ok: true, versions: { package: '1.2.3', cargo: '1.2.3', lock: '1.2.3' } });
  assert.match(readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8'), /serde = \{ version = "1.0" \}/);
  assert.match(readFileSync(join(root, 'src-tauri/Cargo.lock'), 'utf8'), /name = "atty"\nversion = "9.9.9"/);
  assert.throws(() => setVersion(root, 'v1.2'), /semantic version/);
});

test('changelog cut and release notes', () => {
  const root = fixture();
  cutChangelog(root, '0.2.0', '2026-11-03');
  const text = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  assert.match(text, /## \[Unreleased\]\n\n## \[0.2.0\] - 2026-11-03\n\n### Added/);
  assert.equal(releaseNotes(text, 'v0.2.0'), '### Added\n\n- Thing.');
  assert.equal(releaseNotes(text, '9.9.9'), null);
  assert.throws(() => cutChangelog(root, '0.2.0'), /already/);
});
