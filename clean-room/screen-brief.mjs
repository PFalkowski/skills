#!/usr/bin/env node
// Mechanical leakage screen for a clean-room brief.
//
//   node screen-brief.mjs --brief <path> [--deny-list <path>] [--json]
//
// Exit 0 = no findings, exit 1 = findings (or the screen could not run).
//
// This is a FLOOR, not a verdict. It cannot detect a paraphrased
// implementation — that is the human read described in SKILL.md §2. What it
// can do is refuse to pass silently: it fails when it has nothing to examine,
// because a screen with an empty input satisfies every "no violations found"
// assertion perfectly.

import { readFileSync, existsSync } from 'node:fs';

const RULES = [
  {
    id: 'code-fence',
    severity: 'high',
    why: 'A brief describes behaviour; it never shows construction. A fenced block is expression, whatever language it is in.',
    scan(lines) {
      const hits = [];
      let open = null;
      lines.forEach((line, i) => {
        if (/^\s*(```|~~~)/.test(line)) {
          if (open === null) open = i;
          else {
            hits.push({ line: open + 1, text: lines[open].trim(), extra: `${i - open - 1} line(s)` });
            open = null;
          }
        }
      });
      if (open !== null) hits.push({ line: open + 1, text: lines[open].trim(), extra: 'unclosed' });
      return hits;
    },
  },
  {
    id: 'source-path',
    severity: 'high',
    why: 'A file path names their layout. Layout is expression and it is the easiest tell to spot in a diff.',
    pattern: /(?:^|[\s(`"'])(?:\.{0,2}\/)?(?:[\w.-]+\/){1,}[\w.-]+\.(?:[jt]sx?|mjs|cjs|cs|py|go|rb|rs|java|kt|swift|php|scala|c|h|cpp|hpp|vue|svelte|proto|sql)\b/,
  },
  {
    id: 'diff-marker',
    severity: 'high',
    why: 'Diff hunks are verbatim source with punctuation.',
    pattern: /^(?:@@ |diff --git |index [0-9a-f]{7,}|[+-]{3} [ab]\/)/,
  },
  {
    id: 'identifier-shape',
    severity: 'medium',
    why: 'Their names must not survive. Rename to your own vocabulary or describe the concept in words.',
    pattern: /(?:^|[\s(`"'])(?:[a-z]+(?:[A-Z][a-z0-9]+){2,}|[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+){2,}|[a-z][a-z0-9]*(?:_[a-z0-9]+){2,})\b/,
  },
  {
    id: 'copied-marker',
    severity: 'high',
    why: 'An explicit admission of transcription.',
    pattern: /\b(?:copied|lifted|taken|adapted|ported|transcribed)\s+(?:verbatim\s+)?from\b/i,
  },
  {
    id: 'verbatim-quote',
    severity: 'medium',
    why: 'A long quoted run is their prose, not your description of their behaviour.',
    pattern: /["“][^"”]{160,}["”]/,
  },
];

const REQUIRED_SECTIONS = ['goal', 'behaviour', 'acceptance'];

export function screenText(text, denyList = []) {
  const lines = text.split(/\r?\n/);
  const findings = [];

  for (const rule of RULES) {
    if (rule.scan) {
      for (const hit of rule.scan(lines)) {
        findings.push({ rule: rule.id, severity: rule.severity, why: rule.why, ...hit });
      }
      continue;
    }
    lines.forEach((line, i) => {
      const m = rule.pattern.exec(line);
      if (m) {
        findings.push({
          rule: rule.id,
          severity: rule.severity,
          why: rule.why,
          line: i + 1,
          text: m[0].trim(),
        });
      }
    });
  }

  for (const token of denyList) {
    const re = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    lines.forEach((line, i) => {
      if (re.test(line)) {
        findings.push({
          rule: 'deny-list',
          severity: 'high',
          why: `"${token}" was declared at preflight as a token that must not cross.`,
          line: i + 1,
          text: token,
        });
      }
    });
  }

  const lower = text.toLowerCase();
  const missingSections = REQUIRED_SECTIONS.filter((s) => !lower.includes(s));

  return {
    lineCount: lines.length,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    denyListSize: denyList.length,
    findings,
    missingSections,
  };
}

/** A screen that examined nothing must fail, not pass. */
export function assertNotVacuous(result) {
  if (result.wordCount < 50) {
    throw new Error(
      `Brief is ${result.wordCount} words — too thin to have been screened meaningfully. ` +
        'An empty input satisfies every "no violations" check; refusing to report a pass.',
    );
  }
  return true;
}

export function parseDenyList(raw) {
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.brief) {
    process.stderr.write('usage: screen-brief.mjs --brief <path> [--deny-list <path>] [--json]\n');
    process.exitCode = 1;
    return;
  }
  if (!existsSync(args.brief)) {
    process.stderr.write(`FAIL: brief not found: ${args.brief}\n`);
    process.exitCode = 1;
    return;
  }

  const text = readFileSync(args.brief, 'utf8');
  let denyList = [];
  if (typeof args['deny-list'] === 'string') {
    if (!existsSync(args['deny-list'])) {
      process.stderr.write(`FAIL: deny list not found: ${args['deny-list']}\n`);
      process.exitCode = 1;
      return;
    }
    denyList = parseDenyList(readFileSync(args['deny-list'], 'utf8'));
  }

  const result = screenText(text, denyList);
  try {
    assertNotVacuous(result);
  } catch (err) {
    process.stderr.write(`FAIL (vacuous): ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(
      `screened ${args.brief}: ${result.lineCount} lines, ${result.wordCount} words, ` +
        `${result.denyListSize} deny-list token(s)\n`,
    );
    if (result.denyListSize === 0) {
      process.stdout.write('  note: deny list is empty — declare the source package name and its distinctive identifiers at preflight\n');
    }
    if (result.missingSections.length) {
      process.stdout.write(`  note: brief mentions no ${result.missingSections.join(' / ')} section\n`);
    }
    for (const f of result.findings) {
      process.stdout.write(`  [${f.severity}] ${f.rule} line ${f.line}: ${f.text}${f.extra ? ` (${f.extra})` : ''}\n      ${f.why}\n`);
    }
    process.stdout.write(
      result.findings.length
        ? `\n${result.findings.length} finding(s) — cut them before the brief crosses.\n`
        : '\nNo mechanical findings. Now read it yourself: does any sentence describe how they built it?\n',
    );
  }

  process.exitCode = result.findings.length ? 1 : 0;
}

if (process.argv[1]?.endsWith('screen-brief.mjs')) main();
