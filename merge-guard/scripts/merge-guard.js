// PreToolUse(Bash|PowerShell) guard: `gh pr merge` runs only once a code review has seen the PR's head.
// code-review-grill opens each summary with `Reviewed at <sha>`; a commit after it needs a re-review of its delta.
const { execFileSync } = require('node:child_process');

const MERGE = /\bgh(?:\.exe)?\s+pr\s+merge\b([^;&|\n]*)/g;
const VALUED = new Set(['-A', '--author-email', '-b', '--body', '-F', '--body-file', '--match-head-commit', '-t', '--subject']);
const REVIEWED = /^[#>*\s]*Reviewed at\s+`?([0-9a-f]{7,40})\b/im;
const PROSE = ' If this text is prose rather than a command, pass it through a file instead.';

function target(args) {
  const words = (args.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((word) => word.replace(/^(["'])(.*)\1$/s, '$2'));
  let number, repo;
  for (let i = 0; i < words.length; i++) {
    const [flag, value] = words[i].split(/=(.*)/s);
    if (flag === '-R' || flag === '--repo') repo = value ?? words[++i];
    else if (VALUED.has(flag)) { if (value === undefined) i++; }
    else if (!flag.startsWith('-') && !/^\d*[<>]/.test(flag)) number ??= words[i].replace(/[)"']+$/, '');
  }
  return { number, repo, auto: words.includes('--auto') };
}

function reason(command, view) {
  for (const [, args] of command.matchAll(MERGE)) {
    const { number, repo, auto } = target(args);
    if (!number || number.startsWith('$')) return 'merge-guard: name the PR literally (`gh pr merge <number|url>`), so the guard can check that its head was reviewed.' + PROSE;
    if (auto) return 'merge-guard: `--auto` would also merge commits pushed after the review. Merge without it once the review of the final head is in.' + PROSE;
    let pr;
    try { pr = view(number, repo); } catch (error) { return `merge-guard could not read PR ${number}: ${error.message}`; }
    const reviewed = [...pr.comments.map((c) => [c.createdAt, c.body]), ...pr.reviews.map((r) => [r.submittedAt, r.body])]
      .sort(([a], [b]) => (a ?? '').localeCompare(b ?? ''))
      .map(([, body]) => REVIEWED.exec(body ?? '')?.[1].toLowerCase())
      .filter(Boolean);
    if (reviewed.some((sha) => pr.headRefOid.startsWith(sha))) continue;
    const head = pr.headRefOid.slice(0, 12);
    if (!reviewed.length) return `PR ${number} has no "Reviewed at <sha>" summary. Run code-review-grill on head ${head} and post its summary before merging.` + PROSE;
    const last = reviewed.at(-1).slice(0, 12);
    return `PR ${number} was last reviewed at ${last}, but its head is ${head}. A verdict covers only the head it reviewed: ` +
      `re-review ${last}..${head} with code-review-grill, post its summary, then merge.` + PROSE;
  }
  return null;
}

const view = (number, repo) => JSON.parse(execFileSync('gh',
  ['pr', 'view', number, ...(repo ? ['--repo', repo] : []), '--json', 'headRefOid,comments,reviews'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (chunk) => (raw += chunk));
  process.stdin.on('end', () => {
    let command;
    try { command = JSON.parse(raw).tool_input?.command ?? ''; } catch { return; }
    const why = reason(command, view);
    if (why) process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: why },
    }));
  });
}

module.exports = { reason };
