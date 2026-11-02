// Renders every module combination into <out>/<combination>/, each a git repository, so CI can
// run actionlint over the workflows a project would get: `node scripts/render-all.mjs <out>`.
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { init, loadModules } from '../bin/dev-kit.mjs';

const out = resolve(process.argv[2] ?? 'rendered');
const vars = { NAME: 'Demo', DESCRIPTION: 'A demo project.', REPO: 'o-kangal/demo', SITE_URL: 'https://demo.example', CF_PROJECT: 'demo' };
const optional = [...loadModules().keys()].filter((name) => name !== 'core');
for (let mask = 0; mask < 2 ** optional.length; mask++) {
  const modules = optional.filter((_, i) => mask & (1 << i));
  const dir = join(out, modules.join('+') || 'core');
  init(dir, { modules, vars, log: () => {} });
  execFileSync('git', ['init', '-q', dir]);
  console.log(dir);
}
