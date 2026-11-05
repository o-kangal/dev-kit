// `node --test`: renders every module combination and checks the output and the script's rules.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { check, init, loadModules, render, renderProject } from '../bin/dev-kit.mjs';

const VARS = {
  NAME: 'Demo',
  DESCRIPTION: 'A demo project.',
  REPO: 'o-kangal/demo',
  SITE_URL: 'https://demo.example',
  CF_PROJECT: 'demo',
};
const quiet = () => {};
const scratch = mkdtempSync(join(tmpdir(), 'dev-kit-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** Every subset of the optional modules. */
function combinations() {
  const optional = [...loadModules().keys()].filter((name) => name !== 'core');
  return Array.from({ length: 2 ** optional.length }, (_, mask) => optional.filter((_, i) => mask & (1 << i)));
}

describe('render', () => {
  const enabled = new Set(['core', 'ts']);
  test('keeps blocks of enabled modules and drops the others', () => {
    assert.equal(render('a\n{{#ts}}\nb\n{{/ts}}\n{{#rust}}\nc\n{{/rust}}\n{{^rust}}\nd\n{{/rust}}', enabled, {}), 'a\nb\nd');
  });
  test('handles inline blocks', () => {
    assert.equal(render('x{{#ts}} ts{{/ts}}{{#rust}} rust{{/rust}}{{^rust}} no-rust{{/rust}}.', enabled, {}), 'x ts no-rust.');
  });
  test('keeps variable blocks only when the variable is not empty', () => {
    const text = '{{#BUILD}}\nrun: {{BUILD}}\n{{/BUILD}}\n{{^BUILD}}\nno build\n{{/BUILD}}\nx{{#BUILD}} y{{/BUILD}}';
    assert.equal(render(text, enabled, { BUILD: 'make' }), 'run: make\nx y');
    assert.equal(render(text, enabled, { BUILD: '' }), 'no build\nx');
    assert.throws(() => render('{{#NOPE}}\n{{/NOPE}}', enabled, {}), /unknown variable/);
  });
  test('replaces variables but leaves GitHub expressions alone', () => {
    assert.equal(render('{{NAME}} ${{ github.ref }}', enabled, { NAME: 'Demo' }), 'Demo ${{ github.ref }}');
  });
  test('rejects unknown variables and unbalanced blocks', () => {
    assert.throws(() => render('{{NOPE}}', enabled, {}), /unknown variable/);
    assert.throws(() => render('{{#ts}}\n', enabled, {}), /never closed/);
    assert.throws(() => render('{{#ts}}\n{{/rust}}', enabled, {}), /closes/);
    assert.throws(() => render('a {{#ts}} b', enabled, {}), /own line/);
  });
});

describe('every module combination', () => {
  for (const modules of combinations()) {
    test(modules.join(', ') || 'core only', () => {
      const { files } = renderProject(modules, VARS);
      for (const [path, content] of files) {
        assert.doesNotMatch(content, /\{\{[#^/]?[A-Za-z][A-Za-z0-9_-]*\}\}/, `${path} has a leftover template marker`);
        if (path.endsWith('.json') && path !== 'scripts/tsconfig.json') assert.doesNotThrow(() => JSON.parse(content), `${path} is not valid JSON`);
        assert.ok(content.endsWith('\n'), `${path} has no final newline`);
      }
      const settings = JSON.parse(files.get('.claude/settings.json'));
      assert.ok(settings.permissions.deny.includes('Edit(AGENTS.md)'));
      assert.equal(new Set(settings.permissions.allow).size, settings.permissions.allow.length, 'duplicate allow rules');
      const ci = files.get('.github/workflows/ci.yml');
      assert.equal(ci.includes('  web:'), modules.includes('ts'));
      assert.equal(ci.includes('  site:'), modules.includes('cloudflare-pages') && !modules.includes('ts'));
      assert.equal(ci.includes('  rust:'), modules.includes('rust'));
      assert.equal(files.has('.github/workflows/deploy.yml'), modules.includes('cloudflare-pages'));
      // Every action is pinned to a full commit SHA.
      for (const content of [...files].filter(([p]) => p.startsWith('.github/workflows/')).map(([, c]) => c)) {
        for (const [, ref] of content.matchAll(/uses: ([^\s#]+)/g)) {
          if (!ref.startsWith('./')) assert.match(ref, /@[0-9a-f]{40}$/, `${ref} is not pinned to a SHA`);
        }
      }
    });
  }
  test('cloudflare-pages works without a language module or a build', () => {
    const { mods, files } = renderProject(['cloudflare-pages'], { ...VARS, DIST_DIR: 'site' });
    assert.deepEqual(mods.map((mod) => mod.name), ['core', 'cloudflare-pages']);
    const deploy = files.get('.github/workflows/deploy.yml');
    assert.doesNotMatch(deploy, /pnpm/);
    assert.doesNotMatch(deploy, /Build for production/);
    assert.match(deploy, /wrangler pages deploy site /);
    assert.match(files.get('.github/workflows/ci.yml'), /^ {2}site:$/m);
  });
  test('a build command is run by CI and the deploy', () => {
    const { files } = renderProject(['cloudflare-pages'], { ...VARS, BUILD_COMMAND: 'hugo --minify' });
    assert.match(files.get('.github/workflows/deploy.yml'), /Build for production[\s\S]*hugo --minify/);
    assert.match(files.get('.github/workflows/ci.yml'), /hugo --minify/);
  });
  test('module order does not depend on the order asked for', () => {
    const a = renderProject(['rust', 'cloudflare-pages'], VARS).files;
    const b = renderProject(['cloudflare-pages', 'rust'], VARS).files;
    assert.deepEqual([...a], [...b]);
  });
});

describe('project setup defaults', () => {
  test('private notes are ignored and tasks carry a human step', () => {
    const { files } = renderProject([], VARS);
    assert.match(files.get('.gitignore'), /^docs\/private\/$/m);
    assert.match(files.get('TASKS.md'), /\*\*Human Step:\*\* None/);
    assert.match(files.get('.claude/skills/next-task/SKILL.md'), /Human Step/);
    assert.doesNotMatch(files.get('TASKS.md'), /resolve before Task 1/);
  });
});

describe('TS_DIR', () => {
  test('defaults to the repository root', () => {
    const { files } = renderProject(['ts'], VARS);
    assert.deepEqual(JSON.parse(files.get('tsconfig.json')).include, ['src', 'tests', '*.config.ts']);
    const { allow } = JSON.parse(files.get('.claude/settings.json')).permissions;
    assert.ok(allow.includes('Edit(src/**)'));
    assert.ok(!allow.includes('Edit(pnpm-workspace.yaml)'));
  });
  test('moves the paths into the subdirectory', () => {
    const { files } = renderProject(['ts'], { ...VARS, TS_DIR: 'apps/web' });
    assert.deepEqual(JSON.parse(files.get('tsconfig.json')).include, ['apps/web/src', 'apps/web/tests', 'apps/web/*.config.ts']);
    assert.match(files.get('eslint.config.js'), /'apps\/web\/tests\/\*\*'/);
    const { allow } = JSON.parse(files.get('.claude/settings.json')).permissions;
    for (const rule of ['Edit(apps/web/src/**)', 'Edit(apps/web/package.json)', 'Edit(apps/web/vite.config.ts)', 'Edit(pnpm-workspace.yaml)', 'Edit(package.json)']) assert.ok(allow.includes(rule), rule);
    assert.ok(!allow.includes('Edit(src/**)'));
  });
  test('rejects paths that would break the templates', () => {
    for (const value of ['frontend/', './frontend', '../frontend', '/frontend']) {
      assert.throws(() => renderProject(['ts'], { ...VARS, TS_DIR: value }), /Invalid variables[\s\S]*TS_DIR/, value);
    }
  });
});

describe('project additions', () => {
  const project = { permissions: { allow: ['Edit(backend/**)'], deny: ['Bash(uv add *)'] }, actions: ['astral-sh/setup-uv@*'] };
  const withProject = (name) => {
    const dir = join(scratch, name);
    init(dir, { vars: VARS, log: quiet });
    const path = join(dir, '.dev-kit.json');
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), project }));
    return dir;
  };
  test('are merged into the settings and survive a rerun', () => {
    const dir = withProject('extras');
    rmSync(join(dir, '.claude/settings.json'));
    rmSync(join(dir, 'docs/github-settings.md'));
    init(dir, { log: quiet });
    const { permissions } = JSON.parse(readFileSync(join(dir, '.claude/settings.json'), 'utf8'));
    assert.ok(permissions.allow.includes('Edit(backend/**)'));
    assert.ok(permissions.deny.includes('Bash(uv add *)'));
    assert.ok(permissions.deny.includes('Edit(AGENTS.md)'), 'module rules stay');
    assert.match(readFileSync(join(dir, 'docs/github-settings.md'), 'utf8'), /astral-sh\/setup-uv@\*/);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, '.dev-kit.json'), 'utf8')).project, project);
    const report = check(dir, { log: quiet });
    assert.deepEqual(report.differs, []);
    assert.deepEqual(report.missing, []);
  });
  test('must be lists of strings', () => {
    const dir = withProject('bad-extras');
    const path = join(dir, '.dev-kit.json');
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), project: { actions: 'owner/repo@*' } }));
    assert.throws(() => check(dir, { log: quiet }), /must be lists of strings/);
  });
});

describe('unlisted actions', () => {
  const SHA = 'a'.repeat(40);
  const workflow = (...refs) => `jobs:\n  a:\n    steps:\n${refs.map((ref) => `      - uses: ${ref}\n`).join('')}      # - uses: commented/out@${SHA}\n`;
  test('no module combination uses an action it does not allow', () => {
    combinations().forEach((modules, index) => {
      const dir = join(scratch, `actions-${index}`);
      init(dir, { modules, vars: VARS, log: quiet });
      assert.deepEqual(check(dir, { log: quiet }).unlisted, [], modules.join(', ') || 'core only');
    });
  });
  test('reports third-party actions outside the list and ignores the others', () => {
    const dir = join(scratch, 'unlisted');
    init(dir, { modules: ['ts'], vars: VARS, log: quiet });
    writeFileSync(join(dir, '.github/workflows/extra.yml'), workflow(`astral-sh/setup-uv@${SHA}`, `pnpm/action-setup@${SHA}`, `actions/cache@${SHA}`, `github/codeql-action/init@${SHA}`, './.github/workflows/ci.yml', 'docker://alpine:3'));
    assert.deepEqual(check(dir, { log: quiet }).unlisted, [{ action: 'astral-sh/setup-uv', file: '.github/workflows/extra.yml' }]);
    const path = join(dir, '.dev-kit.json');
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), project: { actions: ['astral-sh/setup-uv@*'] } }));
    assert.deepEqual(check(dir, { log: quiet }).unlisted, []);
  });
});

describe('init and check', () => {
  test('missing variables are listed together', () => {
    assert.throws(() => renderProject(['cloudflare-pages'], { NAME: 'x' }), (error) => /DESCRIPTION/.test(error.message) && /SITE_URL/.test(error.message));
  });
  test('unknown modules are rejected', () => {
    assert.throws(() => renderProject(['go'], VARS), /Unknown module "go"/);
  });
  test('init writes, keeps existing files, and reruns from the manifest', () => {
    const dir = join(scratch, 'project');
    const first = init(dir, { modules: ['ts'], vars: VARS, settings: false, log: quiet });
    assert.ok(first.created.includes('AGENTS.md'));
    assert.ok(!first.created.includes('.claude/settings.json'));
    writeFileSync(join(dir, 'AGENTS.md'), '# custom\n');
    writeFileSync(join(dir, 'tsconfig.json'), '{}\n');
    const second = init(dir, { log: quiet });
    assert.deepEqual(second.created, ['.claude/settings.json']);
    assert.deepEqual(second.kept.sort(), ['AGENTS.md', 'tsconfig.json']);
    assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), '# custom\n');
    const manifest = JSON.parse(readFileSync(join(dir, '.dev-kit.json'), 'utf8'));
    assert.deepEqual(manifest.modules, ['ts']);
    assert.equal(manifest.vars.NAME, 'Demo');
    assert.equal(manifest.vars.SITE_URL, undefined, 'variables of modules not enabled are not recorded');
    const report = check(dir, { log: quiet });
    assert.deepEqual(report.differs, ['tsconfig.json'], 'project-owned AGENTS.md is not compared');
    assert.ok(report.owned.includes('AGENTS.md'));
    assert.deepEqual(check(dir, { all: true, log: quiet }).differs.sort(), ['AGENTS.md', 'tsconfig.json']);
  });
  test('modules can be added and removed later', () => {
    const dir = join(scratch, 'grow');
    init(dir, { modules: [], vars: VARS, log: quiet });
    const added = init(dir, { modules: ['ts'], log: quiet });
    assert.ok(added.created.includes('tsconfig.json'));
    assert.ok(added.kept.includes('.github/workflows/ci.yml'), 'a shared file that changes is kept for a manual merge');
    assert.deepEqual(JSON.parse(readFileSync(join(dir, '.dev-kit.json'), 'utf8')).modules, ['ts']);
    const removed = init(dir, { remove: ['ts'], log: quiet });
    assert.ok(removed.unmanaged.includes('tsconfig.json'));
    assert.ok(readFileSync(join(dir, 'tsconfig.json'), 'utf8'), 'nothing is deleted');
    assert.deepEqual(JSON.parse(readFileSync(join(dir, '.dev-kit.json'), 'utf8')).modules, []);
    assert.throws(() => init(dir, { remove: ['core'], log: quiet }), /core cannot be removed/);
  });
  test('a site can drop its language module and keep deploying', () => {
    const dir = join(scratch, 'switch');
    init(dir, { modules: ['ts', 'cloudflare-pages'], vars: VARS, log: quiet });
    const result = init(dir, { remove: ['ts'], log: quiet });
    assert.deepEqual(JSON.parse(readFileSync(join(dir, '.dev-kit.json'), 'utf8')).modules, ['cloudflare-pages']);
    assert.ok(result.unmanaged.includes('tsconfig.json'));
  });
  test('dry run writes nothing', () => {
    const dir = join(scratch, 'dry');
    const result = init(dir, { modules: [], vars: VARS, dryRun: true, log: quiet });
    assert.ok(result.created.length > 0);
    assert.throws(() => readFileSync(join(dir, '.dev-kit.json')));
  });
});
