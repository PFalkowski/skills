#!/usr/bin/env node
// PreToolUse hook for Bash and PowerShell. Blocks the command shapes that make Claude Code
// unable to resolve a path statically and therefore prompt a human even in auto mode:
// a `cd` chained with a file-reading/search/git command, or with an output redirect.
// Runs under node on every OS; reads the hook JSON on stdin; exit 2 blocks and feeds stderr
// back to the agent as the tool error.

const READERS = new Set([
  'rg', 'grep', 'egrep', 'fgrep', 'ugrep', 'ag', 'ack',
  'cat', 'head', 'tail', 'sed', 'awk', 'wc', 'less', 'more', 'nl', 'cut', 'sort', 'uniq', 'diff',
  'find', 'fd', 'fdfind', 'ls', 'tree', 'stat', 'file', 'du',
  'git',
  'Get-Content', 'Get-ChildItem', 'Select-String', 'gc', 'gci', 'sls', 'cat', 'dir', 'type',
]);

function firstWord(segment) {
  const s = segment.trim().replace(/^(\w+=\S+\s+)+/, '').replace(/^(sudo|timeout \S+|time|nice|nohup)\s+/, '');
  const m = s.match(/^([\w.\-]+)/);
  return m ? m[1] : '';
}

function offendingChain(command) {
  const segments = command.split(/\s*(?:&&|\|\||;|\n)\s*/);
  for (let i = 0; i < segments.length - 1; i++) {
    const w = firstWord(segments[i]);
    if (w !== 'cd' && w !== 'Set-Location' && w !== 'pushd' && w !== 'Push-Location') continue;
    const rest = segments.slice(i + 1);
    const redirect = rest.some(s => /(^|[^&\d])>{1,2}\s*(?!\/dev\/null|\$null)\S/.test(s));
    const reader = rest.map(firstWord).find(x => READERS.has(x));
    if (redirect || reader) return { cd: segments[i].trim(), next: reader || 'an output redirect' };
  }
  return null;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { raw += d; });
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  const command = input?.tool_input?.command;
  if (typeof command !== 'string') process.exit(0);
  const hit = offendingChain(command);
  if (!hit) process.exit(0);
  process.stderr.write(
    `Blocked by the auto-mode baseline: "${hit.cd}" chained with ${hit.next}. ` +
    `After a cd, Claude Code cannot resolve which directory the next command reads, so with Read deny rules ` +
    `configured it stops and asks a human, which stalls unattended runs. ` +
    `Re-run WITHOUT the cd: pass the absolute path as an argument instead ` +
    `(rg PATTERN /abs/dir; git -C /abs/dir ...; cat /abs/dir/file; dotnet build /abs/dir/x.sln), ` +
    `or use a redirect target that is absolute.\n`);
  process.exit(2);
});
