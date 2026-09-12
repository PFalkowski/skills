import { test } from 'node:test';
import assert from 'node:assert/strict';

import { screenText, assertNotVacuous, parseDenyList } from './screen-brief.mjs';

const PAD = `Goal: keep a rolling score per country so an operator can triage where to look first.
Behaviour: the score rises when verified events cluster in time and falls back toward a
structural baseline when they stop. Callers observe a bounded integer and a signed movement
against roughly a day earlier. A read that does not complete is reported as a failure and
never as a zero, because a fabricated zero propagates as if it were a measurement.
Acceptance: a quiet country holds its baseline; a burst raises the score within one cycle;
an upstream outage leaves the previous value in place and marks the response degraded.
`;

const ids = (r) => r.findings.map((f) => f.rule);

test('a clean prose brief produces no findings', () => {
  const r = screenText(PAD);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.missingSections, []);
});

test('flags a fenced code block and reports its size', () => {
  const r = screenText(`${PAD}\n\`\`\`ts\nconst x = 1;\nconst y = 2;\n\`\`\`\n`);
  const fence = r.findings.find((f) => f.rule === 'code-fence');
  assert.ok(fence, 'expected a code-fence finding');
  assert.equal(fence.extra, '2 line(s)');
});

test('flags an unclosed fence rather than ignoring it', () => {
  const r = screenText(`${PAD}\n\`\`\`\nsomething\n`);
  assert.equal(r.findings.find((f) => f.rule === 'code-fence').extra, 'unclosed');
});

test('flags a source path', () => {
  const r = screenText(`${PAD}\nThe logic lives in server/intelligence/v1/get-risk-scores.ts today.\n`);
  assert.ok(ids(r).includes('source-path'));
});

test('flags diff markers', () => {
  const r = screenText(`${PAD}\n@@ -1,4 +1,6 @@\n`);
  assert.ok(ids(r).includes('diff-marker'));
});

test('flags lifted-looking identifiers in camel, Pascal and snake shapes', () => {
  for (const token of ['computeCombinedScoreForCountry', 'StrategicRiskRollUp', 'cii_event_multiplier']) {
    const r = screenText(`${PAD}\nIt calls ${token} at the end.\n`);
    assert.ok(ids(r).includes('identifier-shape'), `expected identifier-shape for ${token}`);
  }
});

test('does not flag ordinary two-word camelCase prose artefacts', () => {
  // Two segments is common in normal writing (JavaScript, PortWatch); three is a tell.
  const r = screenText(`${PAD}\nThe upstream is called PortWatch and is free.\n`);
  assert.equal(ids(r).includes('identifier-shape'), false);
});

test('flags an explicit transcription admission', () => {
  const r = screenText(`${PAD}\nThis paragraph is adapted from their methodology note.\n`);
  assert.ok(ids(r).includes('copied-marker'));
});

test('flags a long verbatim quotation', () => {
  const r = screenText(`${PAD}\nThey write: "${'x'.repeat(170)}"\n`);
  assert.ok(ids(r).includes('verbatim-quote'));
});

test('deny-list hits are reported with the offending token and line', () => {
  const r = screenText(`${PAD}\nTheir dashboard calls this the composite index.\n`, ['dashboard']);
  const hit = r.findings.find((f) => f.rule === 'deny-list');
  assert.ok(hit);
  assert.equal(hit.text, 'dashboard');
  assert.equal(hit.severity, 'high');
});

test('deny-list matching is case-insensitive and whole-word', () => {
  assert.equal(screenText(`${PAD}\nWorldMonitor does this.\n`, ['worldmonitor']).findings.length, 1);
  assert.equal(screenText(`${PAD}\nThe cattle grid is fine.\n`, ['cat']).findings.length, 0);
});

test('deny-list tokens containing regex metacharacters are matched literally', () => {
  const r = screenText(`${PAD}\nThe package is world-monitor.app today.\n`, ['world-monitor.app']);
  assert.equal(r.findings.filter((f) => f.rule === 'deny-list').length, 1);
});

test('parseDenyList strips comments and blanks', () => {
  assert.deepEqual(parseDenyList('# header\nfoo\n\n bar # trailing\n'), ['foo', 'bar']);
});

test('missing required sections are reported', () => {
  const r = screenText('A brief that rambles for a while without naming what it is for, at length, repeatedly, and never says what success looks like or what a caller would observe when it runs correctly in practice.');
  assert.deepEqual(r.missingSections.sort(), ['acceptance', 'behaviour', 'goal']);
});

test('a screen with nothing to examine fails instead of passing', () => {
  assert.throws(() => assertNotVacuous(screenText('')), /refusing to report a pass/);
  assert.throws(() => assertNotVacuous(screenText('too short')), /too thin/);
  assert.equal(assertNotVacuous(screenText(PAD)), true);
});

test('counts are reported so a caller can tell the screen examined something', () => {
  const r = screenText(PAD, ['alpha', 'beta']);
  assert.ok(r.wordCount > 50);
  assert.ok(r.lineCount > 1);
  assert.equal(r.denyListSize, 2);
});
