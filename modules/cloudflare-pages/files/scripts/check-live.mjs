// After a deploy, checks that {{SITE_URL}} serves exactly the files we built: Cloudflare features
// (email obfuscation, Web Analytics, …) rewrite pages and inject scripts. Pages are requested like
// a browser, since some injections only target browsers. One injection is known and tolerated: the
// bot detection snippet of the Free plan, which cannot be switched off there and which a CSP with
// `script-src 'self'` stops before it runs. When Cloudflare changes its text, this check fails
// until the new version is reviewed and added below. Run from the repository root after the build:
// `node scripts/check-live.mjs` (plain JavaScript, so it runs in any stack).
import { readFileSync } from 'node:fs';

/**
 * Cloudflare's JavaScript detections snippet, appended before `</body>`, in the versions seen so
 * far; edges may serve either while Cloudflare rolls one out. Only `r` and `t` vary (`R`, `T`
 * here); the newer one repeats `r` as `ray` in the script's address.
 */
/** @type {readonly string[]} */
const BOT_DETECTION_SNIPPETS = [
  // Served until late October 2026.
  `<script>(function(){function c(){var b=a.contentDocument||(a.contentWindow&&a.contentWindow.document);if(b){var d=b.createElement('script');d.innerHTML="window.__CF$cv$params={r:'R',t:'T'};var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);";b.getElementsByTagName('head')[0].appendChild(d)}}if(document.body){var a=document.createElement('iframe');a.height=1;a.width=1;a.style.position='absolute';a.style.top=0;a.style.left=0;a.style.border='none';a.style.visibility='hidden';document.body.appendChild(a);if('loading'!==document.readyState)c();else if(window.addEventListener)document.addEventListener('DOMContentLoaded',c);else{var e=document.onreadystatechange||function(){};document.onreadystatechange=function(b){e(b);'loading'!==document.readyState&&(document.onreadystatechange=e,c())}}}})();</script>`,
  // Served from 2026-10-30: builds the address from the page's origin and adds `?ray=`.
  `<script>(function(){function c(){var b=a.contentDocument||(a.contentWindow&&a.contentWindow.document);if(b){var d=b.createElement('script');d.innerHTML="window.__CF$cv$params={r:'R',t:'T'};var l=window.parent.location,o;try{o=new URL(l.origin).origin}catch(e){try{o=new URL(new URL(l.href).origin).origin}catch(e){o=''}}var u='/cdn-cgi/challenge-platform/scripts/jsd/main.js?ray=R',a=document.createElement('script');a.src=o?new URL(u,o).href:u;document.getElementsByTagName('head')[0].appendChild(a);";b.getElementsByTagName('head')[0].appendChild(d)}}if(document.body){var a=document.createElement('iframe');a.height=1;a.width=1;a.style.position='absolute';a.style.top=0;a.style.left=0;a.style.border='none';a.style.visibility='hidden';document.body.appendChild(a);if('loading'!==document.readyState)c();else if(window.addEventListener)document.addEventListener('DOMContentLoaded',c);else{var e=document.onreadystatechange||function(){};document.onreadystatechange=function(b){e(b);'loading'!==document.readyState&&(document.onreadystatechange=e,c())}}}})();</script>`,
];

/** @param {string} text */
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A snippet exactly, with its per-request values (`ray` equal to `r`), directly before `</body>`. */
const TOLERATED = BOT_DETECTION_SNIPPETS.map(
  (snippet) =>
    new RegExp(
      escapeRegExp(snippet)
        .replace("r:'R'", "r:'([0-9a-f]{1,32})'")
        .replace('ray=R', 'ray=\\1')
        .replace("t:'T'", "t:'[A-Za-z0-9+/=]{1,64}'") + '(?=</body>)',
    ),
);

/** The live page without one tolerated snippet; anything else stays. @param {string} html */
export function withoutToleratedInjection(html) {
  const known = TOLERATED.find((pattern) => pattern.test(html));
  return known ? html.replace(known, '') : html;
}

/** Live URL and the built file it must equal. Add every page the site has. */
/** @type {readonly (readonly [string, string])[]} */
const PAGES = [
  ['{{SITE_URL}}/', '{{DIST_DIR}}/index.html'],
]

const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
};

/** @param {string} url @param {string} file @returns {Promise<boolean>} */
async function matches(url, file) {
  const built = readFileSync(file, 'utf8');
  // A fresh deploy can take a few seconds to reach every edge.
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(`${url}?deploy-check=${String(Date.now())}`, { headers: BROWSER, cache: 'no-store' });
    if (response.ok && withoutToleratedInjection(await response.text()) === built) return true;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  return false;
}

async function main() {
  for (const [url, file] of PAGES) {
    if (await matches(url, file)) console.log(`ok ${url}`);
    else {
      console.error(`::error::${url} is not the page we built (${file}): Cloudflare rewrites it. Look for /cdn-cgi/ or cloudflareinsights in it.`);
      process.exitCode = 1;
    }
  }
}

if (import.meta.main) await main();
