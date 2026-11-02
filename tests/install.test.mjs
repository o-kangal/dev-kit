// `node --test`: install.sh against a scratch CLAUDE_CONFIG_DIR, never the real ~/.claude.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { KIT } from '../bin/dev-kit.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'dev-kit-install-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** Runs install.sh with stdin not a terminal, as CI and Claude's `!` commands do. */
function install(dir, ...args) {
  const { status, stdout } = spawnSync('bash', [join(KIT, 'install.sh'), ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CLAUDE_CONFIG_DIR: dir, NO_COLOR: '1' },
  });
  return { status, stdout };
}

const fresh = (name) => {
  const dir = join(scratch, name);
  mkdirSync(dir);
  return dir;
};

test('--dry-run explains the plan and changes nothing', () => {
  const dir = fresh('dry');
  const { status, stdout } = install(dir, '--dry-run');
  assert.equal(status, 0);
  assert.match(stdout, /What this kit is/);
  assert.match(stdout, /2 change\(s\) planned/);
  assert.deepEqual(readdirSync(dir), []);
});

test('without a terminal it refuses to apply unless --yes is given', () => {
  const dir = fresh('notty');
  const { status, stdout } = install(dir);
  assert.equal(status, 1);
  assert.match(stdout, /No terminal to answer in/);
  assert.deepEqual(readdirSync(dir), []);
});

test('--yes links both, moves an existing file aside, and a rerun changes nothing', () => {
  const dir = fresh('yes');
  writeFileSync(join(dir, 'CLAUDE.md'), 'old\n');
  assert.equal(install(dir, '--yes').status, 0);
  assert.equal(readlinkSync(join(dir, 'skills', 'dev-kit')), join(KIT, 'skills', 'dev-kit'));
  assert.equal(readlinkSync(join(dir, 'CLAUDE.md')), join(KIT, 'global', 'CLAUDE.md'));
  const backup = readdirSync(dir).find((name) => name.startsWith('CLAUDE.md.bak-'));
  assert.equal(readFileSync(join(dir, backup), 'utf8'), 'old\n');
  assert.match(install(dir, '--yes').stdout, /Nothing to change/);
});

test('--uninstall removes only its own links and keeps backups', () => {
  const dir = fresh('uninstall');
  writeFileSync(join(dir, 'CLAUDE.md'), 'old\n');
  install(dir, '--yes');
  assert.equal(install(dir, '--uninstall', '--yes').status, 0);
  assert.ok(!existsSync(join(dir, 'CLAUDE.md')));
  assert.ok(!existsSync(join(dir, 'skills', 'dev-kit')));
  assert.ok(readdirSync(dir).some((name) => name.startsWith('CLAUDE.md.bak-')));
  // A file the kit didn't make is never removed.
  writeFileSync(join(dir, 'CLAUDE.md'), 'mine\n');
  install(dir, '--uninstall', '--yes');
  assert.ok(lstatSync(join(dir, 'CLAUDE.md')).isFile());
});

test('links from an earlier install are updated without a backup', () => {
  const dir = fresh('stale');
  // Another copy of the kit, and a kit that was moved away (its links are now broken).
  const other = join(scratch, 'other-kit');
  mkdirSync(join(other, 'bin'), { recursive: true });
  mkdirSync(join(other, 'skills', 'dev-kit'), { recursive: true });
  writeFileSync(join(other, 'bin', 'dev-kit.mjs'), '');
  mkdirSync(join(dir, 'skills'));
  symlinkSync(join(other, 'skills', 'dev-kit'), join(dir, 'skills', 'dev-kit'));
  symlinkSync(join(scratch, 'moved-kit', 'global', 'CLAUDE.md'), join(dir, 'CLAUDE.md'));
  const plan = install(dir, '--dry-run').stdout;
  assert.match(plan, /update.*another copy of the kit/);
  assert.match(plan, /update.*a kit that is no longer there/);
  assert.equal(install(dir, '--yes').status, 0);
  assert.equal(readlinkSync(join(dir, 'skills', 'dev-kit')), join(KIT, 'skills', 'dev-kit'));
  assert.equal(readlinkSync(join(dir, 'CLAUDE.md')), join(KIT, 'global', 'CLAUDE.md'));
  assert.deepEqual(readdirSync(dir).filter((name) => name.includes('.bak-')), []);
  assert.deepEqual(readdirSync(join(dir, 'skills')), ['dev-kit']);
});

test('your own link is moved aside like a file', () => {
  const dir = fresh('own-link');
  writeFileSync(join(scratch, 'my-prefs.md'), 'mine\n');
  symlinkSync(join(scratch, 'my-prefs.md'), join(dir, 'CLAUDE.md'));
  assert.match(install(dir, '--dry-run').stdout, /something is already there/);
  install(dir, '--yes');
  const backup = readdirSync(dir).find((name) => name.startsWith('CLAUDE.md.bak-'));
  assert.equal(readlinkSync(join(dir, backup)), join(scratch, 'my-prefs.md'));
});

test('unknown options are rejected', () => {
  assert.equal(install(fresh('bad'), '--force').status, 2);
});
