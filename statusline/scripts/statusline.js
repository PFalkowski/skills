#!/usr/bin/env node
// Claude Code status line:
//   📁 worktree · 🌿 branch · 🧠💡🌟🌌 model (by tier) · effort · 🪟 tokens
//   · ⏳ limit · 📝 churn · 🕐 time · $ cost
// Reads the status JSON payload on stdin, prints one line on stdout.

const fs = require('fs');
const path = require('path');

const R = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RED = '\x1b[31m';

const SEP = `${DIM} · ${R}`;

// Swap any glyph here to restyle the line; set CLAUDE_STATUSLINE_ICONS=0 to
// drop them all (useful over ssh or in a font without emoji fallback).
const ICONS = {
  worktree: '📁',
  branch: '🌿',
  model: '🧠', // fallback only — see MODEL_ICONS
  fast: '⚡',
  tokens: '🪟', // the number is context *window* occupancy
  limit: '⏳',
  churn: '📝',
  time: '🕐',
  cost: '', // money() already prints the $ — a 💰 in front just doubles it
};

// Expanding brain, one rung per tier: bare brain → lit → radiating → cosmic.
// Matched against id and display name together, so `claude-opus-5[1m]` and
// "Opus 5 (1M context)" both land on the same rung. Ordered most- to
// least-specific; first hit wins.
const MODEL_ICONS = [
  [/fable/, '🌌'],
  [/opus/, '🌟'],
  [/sonnet/, '💡'],
  [/haiku/, '🧠'],
];

const SHOW_ICONS = process.env.CLAUDE_STATUSLINE_ICONS !== '0';

function ico(key) {
  return SHOW_ICONS && ICONS[key] ? ICONS[key] + ' ' : '';
}

function modelIcon(model) {
  if (!SHOW_ICONS) return '';
  const hay = `${model?.id || ''} ${model?.display_name || ''}`.toLowerCase();
  const hit = MODEL_ICONS.find(([re]) => re.test(hay));
  return (hit ? hit[1] : ICONS.model) + ' ';
}

function compact(n) {
  if (!Number.isFinite(n)) return '?';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function money(n) {
  if (!Number.isFinite(n)) return '$?';
  if (n >= 100) return '$' + n.toFixed(0);
  if (n >= 1) return '$' + n.toFixed(2);
  if (n >= 0.01) return '$' + n.toFixed(2);
  return '$' + n.toFixed(3);
}

function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
}

// Context fill: calm below 60%, worth noticing by 80%, urgent past 90%.
function heat(pct) {
  if (!Number.isFinite(pct)) return BLUE;
  if (pct >= 90) return RED;
  if (pct >= 80) return YELLOW;
  if (pct >= 60) return CYAN;
  return BLUE;
}

const WINDOW_SECONDS = { five_hour: 5 * 3600, seven_day: 7 * 86400 };

// How far through the window we are, 0..1. `resets_at` is a unix timestamp, so
// elapsed = length - remaining. Clamped, because a stale payload can put the
// reset in the past.
function elapsedFraction(resetsAt, windowSeconds) {
  if (!Number.isFinite(resetsAt) || !Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    return null;
  }
  const remaining = resetsAt - Date.now() / 1000;
  return Math.min(1, Math.max(0, (windowSeconds - remaining) / windowSeconds));
}

// Where this window lands at reset if the current burn rate holds. 30% spent
// one day into the week projects to 210% and should scream; 30% spent on the
// last day projects to ~30% and is fine. Below 5% elapsed the divisor is tiny
// and the projection explodes on a single request, so we decline to guess.
function project(pct, frac) {
  if (!Number.isFinite(pct) || frac === null || frac < 0.05) return null;
  return Math.min(999, pct / frac);
}

// Quota gauges run a green→yellow→red fuel scale, distinct from the context
// colours so the two never read as the same number. It ramps earlier than
// heat() because running a window dry is a hard stop, not just a compaction.
// Used only when pace is unknowable; otherwise paceFuel() takes over.
function fuel(pct) {
  if (!Number.isFinite(pct)) return DIM;
  if (pct >= 90) return BOLD + RED;
  if (pct >= 80) return RED;
  if (pct >= 60) return YELLOW;
  return GREEN;
}

// Colour on the projection, floored by what is already spent: 95% used is
// urgent even when the window is nearly over and the pace looks fine.
function paceFuel(pct, projected) {
  if (projected === null) return fuel(pct);
  if (projected >= 110 || pct >= 90) return BOLD + RED;
  if (projected >= 90 || pct >= 80) return RED;
  if (projected >= 70 || pct >= 60) return YELLOW;
  return GREEN;
}

// Resolve worktree name + branch by reading .git directly — no subprocess.
// Handles the main worktree, linked worktrees (.git is a file), detached HEAD,
// and unborn branches (fresh repo with no commits).
function gitInfo(startDir) {
  if (!startDir) return {};
  let dir;
  try {
    dir = path.resolve(startDir);
  } catch {
    return {};
  }

  let root = null;
  let dotGit = null;
  for (let i = 0; i < 64; i++) {
    const candidate = path.join(dir, '.git');
    let st;
    try {
      st = fs.statSync(candidate);
    } catch {
      st = null;
    }
    if (st) {
      root = dir;
      dotGit = candidate;
      if (st.isFile()) {
        // "gitdir: <path>" — linked worktree or submodule
        try {
          const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(candidate, 'utf8'));
          dotGit = m ? path.resolve(dir, m[1].trim()) : null;
        } catch {
          dotGit = null;
        }
      }
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (!root) return {};

  const name = path.basename(root);

  let branch = null;
  if (dotGit) {
    try {
      const head = fs.readFileSync(path.join(dotGit, 'HEAD'), 'utf8').trim();
      const m = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
      if (m) branch = m[1];
      else if (/^[0-9a-f]{7,40}$/i.test(head)) branch = head.slice(0, 7); // detached
    } catch {
      /* leave branch null */
    }
  }
  return { name, branch };
}

function render(d) {
  const parts = [];

  // worktree + branch — prefer the payload (Claude-managed worktree), else read .git
  const wt = d?.worktree || d?.workspace?.git_worktree;
  const cwd = d?.workspace?.current_dir || d?.cwd;
  const git = wt?.name && wt?.branch ? { name: wt.name, branch: wt.branch } : gitInfo(cwd);

  if (git.name) parts.push(`${ico('worktree')}${YELLOW}${git.name}${R}`);
  if (git.branch) parts.push(`${ico('branch')}${MAGENTA}${git.branch}${R}`);

  // model — icon escalates with the tier
  const model = d?.model?.display_name || d?.model?.id;
  if (model) parts.push(`${modelIcon(d.model)}${CYAN}${model}${R}`);

  // effort (absent on models that do not support it) + fast mode
  const effort = d?.effort?.level;
  if (effort) parts.push(`${DIM}${effort}${R}`);
  if (d?.fast_mode) parts.push(`${ico('fast')}${YELLOW}fast${R}`);

  // tokens (context window usage)
  const cw = d?.context_window;
  if (cw && Number.isFinite(cw.total_input_tokens)) {
    const used = cw.total_input_tokens;
    const size = cw.context_window_size;
    const pct = Number.isFinite(cw.used_percentage)
      ? cw.used_percentage
      : (Number.isFinite(size) && size > 0 ? (used / size) * 100 : NaN);
    const color = heat(pct);
    let tok = compact(used);
    if (Number.isFinite(size) && size > 0) tok += `${DIM}/${compact(size)}${R}${color}`;
    if (Number.isFinite(pct)) tok += ` ${pct.toFixed(0)}%`;
    parts.push(`${ico('tokens')}${color}${tok}${R}`);
  }

  // rate limits — both windows, always, each coloured by burn rate against how
  // much of its window has elapsed, not by raw percentage
  const rl = d?.rate_limits;
  const windows = [
    { label: '5h', key: 'five_hour' },
    { label: '7d', key: 'seven_day' },
  ]
    .map((w) => ({ ...w, ...(rl?.[w.key] || {}) }))
    .filter((w) => Number.isFinite(w.used_percentage));
  if (windows.length) {
    const gauges = windows
      .map((w) => {
        const pct = w.used_percentage;
        const proj = project(pct, elapsedFraction(w.resets_at, WINDOW_SECONDS[w.key]));
        const color = paceFuel(pct, proj);
        let text = `${color}${pct.toFixed(0)}%${R}`;
        // Only surface the projection when it is both worrying and worse than
        // what is already spent — otherwise it is noise.
        if (proj !== null && proj >= 70 && Math.round(proj) > Math.round(pct)) {
          text += `${DIM}→${R}${color}${proj.toFixed(0)}%${R}`;
        }
        return `${DIM}${w.label}${R} ${text}`;
      })
      .join(`${DIM} | ${R}`);
    parts.push(`${ico('limit')}${DIM}limit${R} ${gauges}`);
  }

  // churn — silent until the session has actually edited something
  const added = d?.cost?.total_lines_added;
  const removed = d?.cost?.total_lines_removed;
  if (added || removed) {
    parts.push(`${ico('churn')}${GREEN}+${added || 0}${R}${DIM}/${R}${RED}-${removed || 0}${R}`);
  }

  // wall-clock time in this session
  const dur = duration(d?.cost?.total_duration_ms);
  if (dur) parts.push(`${ico('time')}${DIM}${dur}${R}`);

  // cost
  const cost = d?.cost?.total_cost_usd;
  if (Number.isFinite(cost)) parts.push(`${ico('cost')}${GREEN}${money(cost)}${R}`);

  return parts.join(SEP);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    process.stdout.write('');
    return;
  }
  try {
    process.stdout.write(render(data));
  } catch {
    process.stdout.write('');
  }
});
