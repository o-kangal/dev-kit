// Updates the action pins in modules/ (`uses: owner/repo@<sha> # vX.Y.Z`) to the newest release
// of the same major version; reports newer majors instead of taking them. Dependabot doesn't see
// templates, so run this before a release: `node scripts/refresh-pins.mjs [--write]`. Needs `gh`.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PIN = /uses: ([\w.-]+\/[\w.-]+)((?:\/[\w.-]+)*)@([0-9a-f]{40}) # (v\d+\.\d+\.\d+)/g;
const write = process.argv.includes('--write');
const gh = (...args) => execFileSync('gh', ['api', ...args], { encoding: 'utf8' }).trim();
const parse = (tag) => tag.slice(1).split('.').map(Number);
const newer = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };

function files(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.yml') ? [path] : [];
  });
}

const latest = new Map();
function newest(repo, major) {
  if (!latest.has(repo)) {
    const tags = gh('--paginate', `repos/${repo}/tags`, '--jq', '.[].name').split('\n').filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
    latest.set(repo, tags);
  }
  const tags = latest.get(repo);
  const best = (filter) => tags.filter(filter).reduce((a, b) => (!a || newer(parse(b), parse(a)) ? b : a), undefined);
  return { sameMajor: best((tag) => parse(tag)[0] === major), any: best(() => true) };
}

let changed = 0;
for (const path of files('modules')) {
  const text = readFileSync(path, 'utf8');
  const updated = text.replace(PIN, (match, repo, sub, sha, tag) => {
    const { sameMajor, any } = newest(repo, parse(tag)[0]);
    if (any && parse(any)[0] > parse(tag)[0]) console.log(`note     ${repo}: new major ${any} (pinned ${tag}); review its changes and update by hand`);
    if (!sameMajor || sameMajor === tag) return match;
    const newSha = gh(`repos/${repo}/commits/${sameMajor}`, '--jq', '.sha');
    console.log(`update   ${repo}${sub} ${tag} -> ${sameMajor} in ${path}`);
    changed++;
    return `uses: ${repo}${sub}@${newSha} # ${sameMajor}`;
  });
  if (write && updated !== text) writeFileSync(path, updated);
}
console.log(`${changed} pin(s) ${write ? 'updated' : 'would change (run with --write)'}. Docker image pins (gitleaks, actionlint) and the wrangler version in deploy.yml are checked by hand.`);
