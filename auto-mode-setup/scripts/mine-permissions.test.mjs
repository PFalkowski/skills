import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const MINER = join(import.meta.dirname, 'mine-permissions.mjs');

function mine(commands) {
  const dir = mkdtempSync(join(tmpdir(), 'miner-'));
  try {
    const lines = commands.map((c) =>
      JSON.stringify({ type: 'tool_use', input: { command: c }, pad: 'x'.repeat(20) }),
    );
    writeFileSync(join(dir, 's.jsonl'), lines.join('\n') + '\n');
    const out = execFileSync('node', [MINER, '--dir', dir, '--json'], { encoding: 'utf8' });
    return Object.fromEntries(JSON.parse(out).rows.map((r) => [`${r.tool} ${r.sub}`, r.kind]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('git grep, git ls-remote and jq are not classed read-only', () => {
  const kinds = mine(['git grep -O foo', 'git ls-remote origin', 'jq . file.json']);
  for (const key of ['git grep', 'git ls-remote', 'jq .']) {
    assert.ok(key in kinds, `${key} missing from report`);
    assert.notEqual(kinds[key], 'readonly', key);
  }
});

test('plain read-only git subcommands stay read-only', () => {
  const kinds = mine(['git log --oneline', 'git status -s']);
  assert.equal(kinds['git log'], 'readonly');
  assert.equal(kinds['git status'], 'readonly');
});
