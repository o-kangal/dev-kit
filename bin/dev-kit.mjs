#!/usr/bin/env node
// dev-kit: renders the module templates in modules/ into a project. No dependencies (Node 22+).
//
//   node bin/dev-kit.mjs list
//   node bin/dev-kit.mjs init <dir> [--modules a,b] [--remove c] [--var KEY=VALUE]... [--dry-run] [--no-settings]
//   node bin/dev-kit.mjs check <dir> [--diff] [--all]
//
// Template syntax (README.md, "Writing templates"):
//   {{VAR}}                       replaced by a variable (upper case only, so `${{ github.ref }}` is safe)
//   {{#module}} ... {{/module}}   lines kept only when the module is enabled (each marker on its own line)
//   {{^module}} ... {{/module}}   lines kept only when the module is not enabled
//   {{#VAR}} ... {{/VAR}}         lines kept only when the variable is not empty ({{^VAR}}: when it is)
//   all forms also work inside one line: `text{{#rust}} more text{{/rust}}`
//   automatic: DATE, YEAR, DEV_KIT_VERSION, CODEQL_LANGUAGES and ALLOWED_ACTIONS (from module.json)
//
// Project additions live in `.dev-kit.json` under `project` and are merged into what is rendered:
//   { "project": { "permissions": { "allow": [], "deny": [] }, "actions": ["owner/repo@*"] } }
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = readFileSync(join(KIT, 'VERSION'), 'utf8').trim();
export const MANIFEST = '.dev-kit.json';
const SETTINGS = '.claude/settings.json';
const DEPENDABOT = '.github/dependabot.yml';

const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;
// A block is named after a module (lower case) or a variable (upper case).
const NAME = '([a-z][a-z0-9-]*|[A-Z][A-Z0-9_]*)';
const BLOCK = new RegExp(`^\\s*\\{\\{([#^/])${NAME}\\}\\}\\s*$`);
const INLINE = new RegExp(`\\{\\{([#^])${NAME}\\}\\}(.*?)\\{\\{/\\2\\}\\}`, 'g');
const STRAY = new RegExp(`\\{\\{[#^/]${NAME}\\}\\}`);

class KitError extends Error {}

/** Every module under modules/, by name. */
export function loadModules() {
  const modules = new Map();
  for (const name of readdirSync(join(KIT, 'modules')).sort()) {
    const dir = join(KIT, 'modules', name);
    const meta = JSON.parse(readFileSync(join(dir, 'module.json'), 'utf8'));
    modules.set(name, { name, dir, requires: [], vars: {}, codeql: [], actions: [], owned: [], ...meta });
  }
  return modules;
}

/** The requested modules plus everything they require, `core` first, dependencies before dependents. */
export function resolveModules(names, modules = loadModules()) {
  const ordered = [];
  const visit = (name, from) => {
    const mod = modules.get(name);
    if (!mod) throw new KitError(`Unknown module "${name}"${from ? ` (required by ${from})` : ''}. Known: ${[...modules.keys()].join(', ')}.`);
    if (ordered.includes(mod)) return;
    for (const dep of mod.requires) visit(dep, name);
    ordered.push(mod);
  };
  visit('core');
  for (const name of [...new Set(names)].sort()) visit(name);
  return ordered;
}

/** Variables for the enabled modules: given values, then defaults; fails listing every missing or invalid one. */
export function resolveVars(mods, given, extras = {}) {
  const vars = {};
  const missing = [];
  const invalid = [];
  for (const mod of mods) {
    for (const [key, spec] of Object.entries(mod.vars)) {
      const value = given[key] ?? spec.default;
      // A variable whose default is '' may stay empty (e.g. no build command).
      if (value === undefined || (value === '' && spec.default !== '')) missing.push(`  ${key} (${mod.name}): ${spec.description}`);
      else if (spec.pattern && !new RegExp(spec.pattern).test(value)) invalid.push(`  ${key} (${mod.name}): "${value}" does not match ${spec.pattern}`);
      else vars[key] = value;
    }
  }
  if (missing.length) throw new KitError(`Missing variables, pass them with --var KEY=VALUE:\n${missing.join('\n')}`);
  if (invalid.length) throw new KitError(`Invalid variables:\n${invalid.join('\n')}`);
  const today = new Date().toISOString().slice(0, 10);
  const languages = [...new Set(mods.flatMap((mod) => mod.codeql))];
  const actions = [...new Set([...mods.flatMap((mod) => mod.actions), ...(extras.actions ?? [])])];
  return {
    ...vars,
    DATE: today,
    YEAR: today.slice(0, 4),
    DEV_KIT_VERSION: VERSION,
    CODEQL_LANGUAGES: `[${languages.join(', ')}]`,
    ALLOWED_ACTIONS: JSON.stringify(actions),
  };
}

/** Applies conditional blocks and placeholders to one template. */
export function render(text, enabled, vars, source = 'template') {
  const holds = (name, index) => {
    if (/^[a-z]/.test(name)) return enabled.has(name);
    if (!(name in vars)) throw new KitError(`${source}:${index + 1}: unknown variable {{#${name}}}; declare it in a module.json.`);
    return vars[name] !== '';
  };
  const out = [];
  const stack = [];
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    const block = BLOCK.exec(line);
    if (!block) {
      if (!stack.every((frame) => frame.keep)) return;
      const kept = line.replace(INLINE, (_, kind, name, body) => ((kind === '#') === holds(name, index) ? body : ''));
      const stray = STRAY.exec(kept);
      if (stray) throw new KitError(`${source}:${index + 1}: ${stray[0]} must be on its own line, or open and close on the same line.`);
      out.push(kept);
      return;
    }
    const [, kind, name] = block;
    if (kind === '/') {
      const open = stack.pop();
      if (!open || open.name !== name) throw new KitError(`${source}:${index + 1}: {{/${name}}} closes ${open ? `{{${open.name}}}` : 'nothing'}.`);
    } else {
      // Inside a dropped block nothing is evaluated: its variables may belong to a disabled module.
      const outer = stack.every((frame) => frame.keep);
      stack.push({ name, keep: outer && (kind === '#') === holds(name, index) });
    }
  });
  if (stack.length) throw new KitError(`${source}: {{${stack.at(-1).name}}} is never closed.`);
  return out.join('\n').replace(PLACEHOLDER, (match, key) => {
    if (!(key in vars)) throw new KitError(`${source}: unknown variable ${match}; declare it in a module.json.`);
    return vars[key];
  });
}

function filesUnder(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesUnder(path, base) : [relative(base, path)];
  });
}

/** Merged `.claude/settings.json`: every module's settings.json, then the project's additions, deduplicated. */
function mergeSettings(mods, enabled, vars, extras) {
  const merged = { permissions: { allow: [], deny: [] } };
  const add = (permissions) => {
    for (const list of ['allow', 'deny']) {
      for (const rule of permissions[list] ?? []) if (!merged.permissions[list].includes(rule)) merged.permissions[list].push(rule);
    }
  };
  for (const mod of mods) {
    const path = join(mod.dir, 'settings.json');
    if (existsSync(path)) add(JSON.parse(render(readFileSync(path, 'utf8'), enabled, vars, relative(KIT, path))).permissions ?? {});
  }
  add(extras);
  return `${JSON.stringify(merged, null, 2)}\n`;
}

/** `.github/dependabot.yml`: a header plus every module's dependabot.yml entries. */
function mergeDependabot(mods, enabled, vars) {
  const parts = mods
    .map((mod) => join(mod.dir, 'dependabot.yml'))
    .filter((path) => existsSync(path))
    .map((path) => render(readFileSync(path, 'utf8'), enabled, vars, relative(KIT, path)).trimEnd());
  return [
    '# Weekly dependency updates, grouped to keep the pull requests few. Every update goes through CI',
    '# before it can be merged; a new release waits a week first (cooldown).',
    'version: 2',
    'updates:',
    parts.join('\n\n'),
    '',
  ].join('\n');
}

/** Renders a whole project in memory: Map of project-relative path -> content. */
export function renderProject(names, given, { settings = true, extras = {} } = {}) {
  const mods = resolveModules(names);
  const enabled = new Set(mods.map((mod) => mod.name));
  const vars = resolveVars(mods, given, extras);
  const files = new Map();
  const owner = new Map();
  for (const mod of mods) {
    const root = join(mod.dir, 'files');
    for (const path of filesUnder(root)) {
      if (owner.has(path)) throw new KitError(`${path} comes from both ${owner.get(path)} and ${mod.name}.`);
      owner.set(path, mod.name);
      files.set(path, render(readFileSync(join(root, path), 'utf8'), enabled, vars, `modules/${mod.name}/files/${path}`));
    }
  }
  if (settings) files.set(SETTINGS, mergeSettings(mods, enabled, vars, extras));
  files.set(DEPENDABOT, mergeDependabot(mods, enabled, vars));
  const owned = new Set(mods.flatMap((mod) => mod.owned));
  return { mods, vars, files, owned };
}

function readManifest(dir) {
  const path = join(dir, MANIFEST);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
}

/** The project's own additions from the manifest: extra permissions and third-party actions. */
function projectExtras(manifest) {
  const { permissions: { allow = [], deny = [] } = {}, actions = [] } = manifest?.project ?? {};
  for (const list of [allow, deny, actions]) {
    if (!Array.isArray(list) || list.some((item) => typeof item !== 'string')) {
      throw new KitError(`${MANIFEST}: project.permissions.allow, project.permissions.deny and project.actions must be lists of strings.`);
    }
  }
  return { allow, deny, actions };
}

/** Third-party actions in the project's workflows that the allowed list does not cover. */
function unlistedActions(dir, allowed) {
  const root = join(dir, '.github/workflows');
  const patterns = allowed.map((pattern) => new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`));
  const found = [];
  for (const file of filesUnder(root).filter((path) => /\.ya?ml$/.test(path)).sort()) {
    for (const [, ref] of readFileSync(join(root, file), 'utf8').matchAll(/^\s*(?:-\s*)?uses:\s*['"]?([^\s'"#]+)/gm)) {
      if (ref.startsWith('./') || ref.startsWith('docker://') || /^(actions|github)\//.test(ref)) continue;
      if (!patterns.some((pattern) => pattern.test(ref))) found.push({ action: ref.split('@')[0], file: `.github/workflows/${file}` });
    }
  }
  return found;
}

function parseVars(list) {
  const vars = {};
  for (const item of list ?? []) {
    const eq = item.indexOf('=');
    if (eq < 1) throw new KitError(`--var expects KEY=VALUE, got "${item}".`);
    vars[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return vars;
}

function status(dir, path, content) {
  const target = join(dir, path);
  if (!existsSync(target)) return 'missing';
  return readFileSync(target, 'utf8') === content ? 'same' : 'differs';
}

/**
 * Writes missing files, keeps existing ones (reporting those that differ), records the manifest.
 * `modules` are added to the ones the manifest already has and `remove` drops some; files only a
 * dropped module rendered are reported, never deleted.
 */
export function init(dir, { modules = [], remove = [], vars = {}, dryRun = false, settings = true, log = console.log }) {
  const manifest = readManifest(dir);
  const before = manifest?.modules ?? [];
  const known = loadModules();
  for (const name of remove) {
    if (name === 'core') throw new KitError('core cannot be removed.');
    if (!known.has(name)) throw new KitError(`Unknown module "${name}".`);
  }
  const names = [...new Set([...before, ...modules])].filter((name) => !remove.includes(name));
  const given = { ...manifest?.vars, ...vars };
  const extras = projectExtras(manifest);
  const { mods, files, owned } = renderProject(names, given, { settings, extras });
  const dependents = mods.filter((mod) => remove.includes(mod.name));
  if (dependents.length) throw new KitError(`${dependents.map((mod) => mod.name).join(', ')} is still required by another enabled module.`);
  const result = { created: [], kept: [], same: [] };
  for (const [path, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const state = status(dir, path, content);
    if (state === 'missing') {
      result.created.push(path);
      if (!dryRun) {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), content);
      }
    } else (state === 'same' ? result.same : result.kept).push(path);
  }
  const declared = new Set(mods.flatMap((mod) => Object.keys(mod.vars)));
  const recorded = Object.fromEntries(Object.entries(given).filter(([key]) => declared.has(key)).sort());
  if (!dryRun) {
    mkdirSync(dir, { recursive: true });
    const project = manifest?.project ? { project: manifest.project } : {};
    writeFileSync(join(dir, MANIFEST), `${JSON.stringify({ version: VERSION, modules: mods.map((m) => m.name).filter((n) => n !== 'core'), vars: recorded, ...project }, null, 2)}\n`);
  }
  const verb = dryRun ? 'would create' : 'created';
  for (const path of result.created) log(`${verb}  ${path}`);
  for (const path of result.kept) log(`kept     ${path} (exists and differs from the template${owned.has(path) ? '' : '; merge with `check --diff`'})`);
  if (manifest && remove.length) {
    const previous = renderProject(before, given, { settings, extras }).files;
    result.unmanaged = [...previous.keys()].filter((path) => !files.has(path) && existsSync(join(dir, path))).sort();
    for (const path of result.unmanaged) log(`unmanaged ${path} (only a removed module rendered it; delete it by hand if unused)`);
  }
  log(`dev-kit ${VERSION}: ${result.created.length} ${verb}, ${result.kept.length} kept, ${result.same.length} unchanged.`);
  return result;
}

/**
 * Compares a project with what the current kit would render for its manifest. Files a module
 * lists as `owned` (AGENTS.md, SPEC.md, …) are seeds the project rewrites, so they are only
 * compared with `all`.
 */
export function check(dir, { diff = false, all = false, log = console.log } = {}) {
  const manifest = readManifest(dir);
  if (!manifest) throw new KitError(`${join(dir, MANIFEST)} not found; run \`init\` first.`);
  const { files, owned, vars } = renderProject(manifest.modules, manifest.vars, { extras: projectExtras(manifest) });
  const result = { same: [], differs: [], missing: [], owned: [], unlisted: unlistedActions(dir, JSON.parse(vars.ALLOWED_ACTIONS)) };
  const scratch = diff ? mkdtempSync(join(tmpdir(), 'dev-kit-')) : undefined;
  try {
    for (const [path, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
      const state = status(dir, path, content);
      if (owned.has(path) && !all && state !== 'missing') {
        result.owned.push(path);
        continue;
      }
      result[state].push(path);
      if (state === 'same') continue;
      log(`${state.padEnd(8)} ${path}`);
      if (diff && state === 'differs') {
        const rendered = join(scratch, path.replaceAll('/', '__'));
        writeFileSync(rendered, content);
        const { stdout } = spawnSync('git', ['diff', '--no-index', '--no-color', '--', join(dir, path), rendered], { encoding: 'utf8' });
        log(stdout.replaceAll(rendered, `dev-kit/${path}`));
      }
    }
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
  for (const { action, file } of result.unlisted) log(`unlisted ${action} in ${file} (add it to project.actions in ${MANIFEST}, then apply docs/github-settings.md)`);
  log(`project at dev-kit ${manifest.version}, kit is ${VERSION}: ${result.same.length} unchanged, ${result.differs.length} differ, ${result.missing.length} missing, ${result.unlisted.length} unlisted actions, ${result.owned.length} project-owned not compared${all ? '' : ' (--all compares them)'}.`);
  return result;
}

function list(log = console.log) {
  for (const mod of loadModules().values()) {
    log(`${mod.name}${mod.requires.length ? ` (requires ${mod.requires.join(', ')})` : ''}: ${mod.description}`);
    for (const [key, spec] of Object.entries(mod.vars)) log(`    ${key}${spec.default !== undefined ? ` [default: ${spec.default}]` : ''}: ${spec.description}`);
  }
}

function main(argv) {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      modules: { type: 'string' },
      remove: { type: 'string' },
      var: { type: 'string', multiple: true },
      'dry-run': { type: 'boolean', default: false },
      'no-settings': { type: 'boolean', default: false },
      diff: { type: 'boolean', default: false },
      all: { type: 'boolean', default: false },
    },
  });
  const [command, target] = positionals;
  if (command === 'list') return list();
  if (!target || !['init', 'check'].includes(command)) {
    throw new KitError('Usage: dev-kit list | init <dir> [--modules a,b] [--remove c] [--var KEY=VALUE]... [--dry-run] [--no-settings] | check <dir> [--diff] [--all]');
  }
  const dir = resolve(target);
  if (command === 'check') return void check(dir, { diff: values.diff, all: values.all });
  const names = (option) => (option ?? '').split(',').map((name) => name.trim()).filter(Boolean);
  init(dir, { modules: names(values.modules), remove: names(values.remove), vars: parseVars(values.var), dryRun: values['dry-run'], settings: !values['no-settings'] });
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    // parseArgs reports bad options as TypeErrors with a code; show them like our own errors.
    if (!(error instanceof KitError) && !error?.code?.startsWith?.('ERR_PARSE_ARGS')) throw error;
    console.error(`dev-kit: ${error.message}`);
    process.exitCode = 1;
  }
}
