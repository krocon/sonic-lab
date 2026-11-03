// Keeps the app version in sync: package.json is the single source of truth; src-tauri/Cargo.toml
// and src-tauri/Cargo.lock must match (tauri.conf.json reads ../package.json).
//
//   node scripts/version.mjs check
//   node scripts/version.mjs set 0.2.0            # updates all three files
//   node scripts/version.mjs prepare 0.2.0        # set + moves CHANGELOG "Unreleased" to 0.2.0
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const CRATE = 'audiolab';

export function readVersions(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const toml = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8');
  const cargo = /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(toml)?.[1];
  const lock = readFileSync(join(root, 'src-tauri/Cargo.lock'), 'utf8');
  const lockVersion = new RegExp(`\\[\\[package\\]\\]\\nname = "${CRATE}"\\nversion = "([^"]+)"`).exec(lock)?.[1];
  return { package: pkg, cargo, lock: lockVersion };
}

export function check(root) {
  const v = readVersions(root);
  const ok = v.package === v.cargo && v.package === v.lock;
  return { ok, versions: v };
}

export function setVersion(root, version) {
  if (!SEMVER.test(version)) throw new Error(`not a semantic version: ${version}`);
  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  const tomlPath = join(root, 'src-tauri/Cargo.toml');
  const toml = readFileSync(tomlPath, 'utf8').replace(
    /^(\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/m,
    `$1${version}$2`,
  );
  writeFileSync(tomlPath, toml);

  const lockPath = join(root, 'src-tauri/Cargo.lock');
  const lock = readFileSync(lockPath, 'utf8').replace(
    new RegExp(`(\\[\\[package\\]\\]\\nname = "${CRATE}"\\nversion = ")[^"]+(")`),
    `$1${version}$2`,
  );
  writeFileSync(lockPath, lock);
}

/** Turns "## [Unreleased]" into "## [Unreleased]" + a new dated section with its content. */
export function cutChangelog(root, version, date = new Date().toISOString().slice(0, 10)) {
  const path = join(root, 'CHANGELOG.md');
  const text = readFileSync(path, 'utf8');
  if (text.includes(`## [${version}]`)) throw new Error(`CHANGELOG already has ${version}`);
  const marker = '## [Unreleased]';
  if (!text.includes(marker)) throw new Error('CHANGELOG has no "## [Unreleased]" section');
  writeFileSync(path, text.replace(marker, `${marker}\n\n## [${version}] - ${date}`));
}

function main(argv) {
  const root = join(fileURLToPath(import.meta.url), '../..');
  const [command, version] = argv;
  if (command === 'check') {
    const { ok, versions } = check(root);
    console.log(`package.json ${versions.package} · Cargo.toml ${versions.cargo} · Cargo.lock ${versions.lock}`);
    if (!ok) {
      console.error('Versions differ – run: node scripts/version.mjs set <version>');
      process.exit(1);
    }
    return;
  }
  if (command === 'set' || command === 'prepare') {
    if (!version) throw new Error('usage: version.mjs set|prepare <x.y.z>');
    setVersion(root, version);
    if (command === 'prepare') cutChangelog(root, version);
    console.log(`version set to ${version}`);
    return;
  }
  console.error('usage: node scripts/version.mjs check | set <x.y.z> | prepare <x.y.z>');
  process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
