#!/usr/bin/env node
/**
 * mine-permissions.mjs — derive a permission allowlist from what has actually been run.
 *
 * Streams every Claude Code session transcript, extracts Bash/PowerShell commands, splits them on
 * shell separators, and reports `tool subcommand` pairs by frequency — classified read-only /
 * mutating / dangerous. The read-only column is the only one you should turn into allow rules.
 *
 * Cross-platform, no dependencies, Node 18+.
 *
 *   node mine-permissions.mjs
 *   node mine-permissions.mjs --top 60
 *   node mine-permissions.mjs --json > usage.json
 *   node mine-permissions.mjs --dir /custom/path/to/projects
 */

import { readdir, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const TOP = Number(flag('top', 80))
const AS_JSON = argv.includes('--json')
const ROOT = resolve(flag('dir', join(homedir(), '.claude', 'projects')))

// Commands Claude Code already treats as read-only and never prompts for. Allowlisting these is
// wasted config, so they are dropped from the report entirely.
const BUILT_IN_READONLY = new Set([
  'ls', 'cat', 'echo', 'pwd', 'head', 'tail', 'grep', 'find', 'wc',
  'which', 'diff', 'stat', 'du', 'cd', 'sort', 'uniq', 'cut', 'tr',
])

const TOOLS = [
  'git', 'gh', 'dotnet', 'az', 'docker', 'npm', 'npx', 'pnpm', 'yarn', 'cargo',
  'python', 'python3', 'py', 'node', 'terraform', 'kubectl', 'helm', 'jq', 'rg',
  'uv', 'go', 'make', 'curl', 'wget', 'sqlcmd', 'psql', 'aws', 'gcloud',
]

// Subcommand classification. Anything unmatched falls through to "mutating", on the principle that
// an unrecognised command is not assumed safe.
const READONLY = {
  git: /^(log|diff|status|show|branch|rev-parse|ls-files|ls-tree|merge-base|rev-list|cat-file|check-ignore|describe|blame|shortlog|grep|ls-remote|symbolic-ref|merge-tree|count-objects|whatchanged|reflog)$/,
  gh: /^(browse|search)$/,
  dotnet: /^(--version|--list-sdks|--list-runtimes|--info)$/,
  docker: /^(ps|images|image|inspect|logs|version|info|history|stats|port|top|diff|events)$/,
  az: /^(account|version)$/,
  terraform: /^(plan|validate|fmt|show|output|version|providers|console)$/,
  kubectl: /^(get|describe|logs|explain|api-resources|version|top)$/,
  npm: /^(ls|list|view|outdated|audit|why)$/,
  cargo: /^(tree|metadata|--version)$/,
  go: /^(list|version|env|vet)$/,
  jq: /.*/,
  rg: /.*/,
}

const DANGEROUS = [
  /^git\s+push\s*$/, /--force/, /^git\s+reset$/, /^git\s+clean$/, /^git\s+filter-branch$/,
  /^gh\s+release$/, /^gh\s+repo$/,
  /^(dotnet\s+nuget|nuget|npm|pnpm|cargo)\s+publish$/, /^dotnet\s+nuget$/,
  /^terraform\s+(apply|destroy)$/,
  /^docker\s+(push|rm|rmi|prune)$/,
  /^kubectl\s+delete$/,
  /^az\s+(group|sql|postgres|functionapp|storage|webapp)$/,
  /^(rm|sudo|chmod|chown)\b/,
]

// Global flags that sit between a tool and its real subcommand. `git -C <path> status` must be
// reported as `git status`, not as the meaningless rule `Bash(git -C:*)`.
const GLOBAL_FLAGS = {
  git: /^(?:-C\s+\S+|--no-pager|--git-dir\s+\S+|--work-tree\s+\S+|-c\s+\S+)(?:\s+|$)/,
  docker: /^(?:--context\s+\S+|-H\s+\S+)(?:\s+|$)/,
  dotnet: /^(?:--verbosity\s+\S+)(?:\s+|$)/,
}

// Captures up to three tokens after the tool so a global flag plus its argument can be stripped
// and still leave the real subcommand behind.
const SEPARATOR = /(?:^|\||;|&&|\|\||\$\(|`|\n)\s*(?:sudo\s+)?([A-Za-z][A-Za-z0-9._-]{0,24})\s+((?:[^\s|;&]+)(?:\s+[^\s|;&]+){0,2})/g
const COMMAND_FIELD = /"command"\s*:\s*"((?:[^"\\]|\\.){0,8000})"/g

const unescape = (s) =>
  s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')

async function* walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) yield* walk(full)
    else if (e.name.endsWith('.jsonl')) yield full
  }
}

function classify(tool, sub) {
  const pair = `${tool} ${sub}`
  if (DANGEROUS.some((re) => re.test(pair) || re.test(tool))) return 'dangerous'
  const re = READONLY[tool]
  if (re && re.test(sub)) return 'readonly'
  return 'mutating'
}

const counts = new Map()

async function scan(file) {
  const rl = createInterface({
    input: createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    if (line.length < 40 || !line.includes('"command"')) continue
    COMMAND_FIELD.lastIndex = 0
    let m
    while ((m = COMMAND_FIELD.exec(line)) !== null) {
      const cmd = unescape(m[1])
      const seen = new Set()
      SEPARATOR.lastIndex = 0
      let t
      while ((t = SEPARATOR.exec(cmd)) !== null) {
        const tool = t[1]
        if (BUILT_IN_READONLY.has(tool) || !TOOLS.includes(tool)) continue
        let rest = (t[2] || '').trim()
        const globals = GLOBAL_FLAGS[tool]
        // Loop: `git -c a.b=c --no-pager log` stacks more than one global flag.
        if (globals) while (globals.test(rest)) rest = rest.replace(globals, '')
        // Keep only the first token as the subcommand; the second was captured to let a global
        // flag and its argument be stripped above.
        const sub = rest.split(/\s+/)[0]
        // `-` is stdin (`python - <<EOF`); `$`/quote starts an interpolation, not a subcommand.
        if (!sub || sub === '-' || sub.startsWith('$') || sub.startsWith('"')) continue
        const key = `${tool} ${sub}`
        if (seen.has(key)) continue
        seen.add(key)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
}

async function main() {
  try {
    await stat(ROOT)
  } catch {
    console.error(`No transcripts found at ${ROOT}`)
    console.error('Pass --dir if your Claude config lives elsewhere (CLAUDE_CONFIG_DIR).')
    process.exit(1)
  }

  let files = 0
  for await (const f of walk(ROOT)) {
    files++
    await scan(f)
  }

  const rows = [...counts.entries()]
    .map(([key, n]) => {
      const [tool, ...rest] = key.split(' ')
      return { tool, sub: rest.join(' '), n, kind: classify(tool, rest.join(' ')) }
    })
    .sort((a, b) => b.n - a.n)
    .slice(0, TOP)

  if (AS_JSON) {
    console.log(JSON.stringify({ root: ROOT, files, rows }, null, 2))
    return
  }

  console.log(`Scanned ${files} transcripts under ${ROOT}\n`)
  for (const kind of ['readonly', 'mutating', 'dangerous']) {
    const group = rows.filter((r) => r.kind === kind)
    if (!group.length) continue
    const header = {
      readonly: 'READ-ONLY — safe to allowlist',
      mutating: 'MUTATING — per-repo settings only, decide each one',
      dangerous: 'DANGEROUS — candidates for the deny list, not the allowlist',
    }[kind]
    console.log(`=== ${header} ===`)
    for (const r of group) {
      const rule = `Bash(${r.tool} ${r.sub}:*)`
      console.log(`${String(r.n).padStart(6)}  ${rule}`)
    }
    console.log()
  }
  console.log('Frequency shows what to consider, never what to grant.')
  console.log('Built-in read-only commands (ls, cat, grep, git log...) are omitted — they never prompt.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
