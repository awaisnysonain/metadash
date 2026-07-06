// One-shot: strips every `dark:...` Tailwind variant token from src/ .tsx / .ts / .css files.
// Conservative — only touches the token itself and the single whitespace before it. Extra
// spaces inside a className are harmless for Tailwind; better than risking source damage.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');
// `<space>dark:<non-whitespace and non-quote>` — the common form inside className strings.
const DARK_TOKEN_RE = / dark:[^\s"'`]+/g;
// `dark:foo ` at the very start of a className string (right after the opening quote).
const DARK_LEADING_RE = /(["'`])dark:[^\s"'`]+ ?/g;

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts|css)$/.test(name)) out.push(full);
  }
  return out;
}

let touched = 0;
for (const file of walk(ROOT)) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(DARK_TOKEN_RE, '').replace(DARK_LEADING_RE, '$1');
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    touched++;
    process.stdout.write(`stripped ${path.relative(process.cwd(), file)}\n`);
  }
}
process.stdout.write(`\nDone. ${touched} file(s) updated.\n`);
