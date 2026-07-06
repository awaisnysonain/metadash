// One-shot helper: adds Tailwind dark: variants to the most common light-only classes
// across the given component files. Skips a token if the same dark variant is already
// present in the same className (rough heuristic: the dark:<mapped> substring appears
// anywhere within 400 chars of the match).
//
// Usage: node scripts/add-dark-variants.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src', 'components');
// These files were hand-tuned earlier; skip so we don't double-apply variants.
const SKIP = new Set(['Sidebar.tsx', 'CommentDetailDrawer.tsx', 'UnifiedInbox.tsx']);

// Ordered from most-specific to least. Longer/prefixed classes must come before their bare siblings.
const RULES = [
  { light: 'hover:bg-slate-50', dark: 'dark:hover:bg-slate-800' },
  { light: 'hover:bg-slate-100', dark: 'dark:hover:bg-slate-800/60' },
  { light: 'hover:bg-slate-200', dark: 'dark:hover:bg-slate-700' },
  { light: 'hover:border-slate-300', dark: 'dark:hover:border-slate-600' },
  { light: 'hover:text-slate-900', dark: 'dark:hover:text-slate-100' },
  { light: 'hover:text-slate-950', dark: 'dark:hover:text-slate-50' },
  { light: 'ring-slate-200', dark: 'dark:ring-slate-700' },
  { light: 'ring-1 ring-slate-200', dark: 'dark:ring-slate-700' },
  { light: 'border-slate-100', dark: 'dark:border-slate-800' },
  { light: 'border-slate-200', dark: 'dark:border-slate-800' },
  { light: 'border-slate-300', dark: 'dark:border-slate-700' },
  { light: 'bg-white/95', dark: 'dark:bg-slate-900/95' },
  { light: 'bg-white/90', dark: 'dark:bg-slate-900/90' },
  { light: 'bg-white/85', dark: 'dark:bg-slate-900/85' },
  { light: 'bg-white/80', dark: 'dark:bg-slate-900/80' },
  { light: 'bg-white', dark: 'dark:bg-slate-900' },
  { light: 'bg-slate-50/60', dark: 'dark:bg-slate-800/40' },
  { light: 'bg-slate-50/70', dark: 'dark:bg-slate-800/40' },
  { light: 'bg-slate-50', dark: 'dark:bg-slate-800/40' },
  { light: 'bg-slate-100', dark: 'dark:bg-slate-800' },
  { light: 'bg-slate-200', dark: 'dark:bg-slate-700' },
  { light: 'bg-slate-900', dark: 'dark:bg-slate-100' },
  { light: 'bg-slate-950', dark: 'dark:bg-slate-100' },
  { light: 'text-slate-950', dark: 'dark:text-slate-50' },
  { light: 'text-slate-900', dark: 'dark:text-slate-100' },
  { light: 'text-slate-800', dark: 'dark:text-slate-200' },
  { light: 'text-slate-700', dark: 'dark:text-slate-200' },
  { light: 'text-slate-600', dark: 'dark:text-slate-300' },
  { light: 'text-slate-500', dark: 'dark:text-slate-400' },
  { light: 'text-slate-400', dark: 'dark:text-slate-500' },
  { light: 'text-slate-300', dark: 'dark:text-slate-600' },
];

// For each rule: replace occurrences of light class not already followed by the paired dark variant
// AND not already prefixed by another dark: modifier (avoid corrupting existing dark:hover:… strings).
function applyRule(content, rule) {
  // Match the light class as a whole token — must be preceded by whitespace/quote and
  // followed by whitespace/quote. Prevents matching inside larger identifiers.
  const boundary = String.raw`(?<=[\s"'\`])`;
  const boundaryAfter = String.raw`(?=[\s"'\`])`;
  // Reject matches that already sit right after a dark: prefix.
  const escaped = rule.light.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${boundary}(?<!dark:)${escaped}${boundaryAfter}`, 'g');

  return content.replace(re, (match, offset, str) => {
    // Look at a small window around the match to see if the paired dark class already exists.
    const window = str.slice(Math.max(0, offset - 200), offset + match.length + 200);
    if (window.includes(rule.dark)) return match;
    return `${match} ${rule.dark}`;
  });
}

let touched = 0;
for (const file of fs.readdirSync(ROOT)) {
  if (!file.endsWith('.tsx')) continue;
  if (SKIP.has(file)) continue;
  const full = path.join(ROOT, file);
  const before = fs.readFileSync(full, 'utf8');
  let after = before;
  for (const rule of RULES) after = applyRule(after, rule);
  if (after !== before) {
    fs.writeFileSync(full, after, 'utf8');
    touched++;
    process.stdout.write(`updated ${file}\n`);
  }
}

process.stdout.write(`\nDone. ${touched} file(s) updated.\n`);
