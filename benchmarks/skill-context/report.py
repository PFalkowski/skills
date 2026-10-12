"""Validate and combine complete cases from interrupted local benchmark segments."""
import argparse
import json
import pathlib

import benchmark as b


def combine(cases, segments):
    canonical = {c['id']: c for c in cases}
    pins = ('refs', 'identity', 'options', 'script_hash', 'hardware', 'repeats')
    first = segments[0][0]
    selected = {}
    interruptions = []
    for records in segments:
        meta = records[0]
        if meta.get('type') != 'metadata' or any(meta[k] != first[k] for k in pins):
            raise ValueError('Incompatible segment pins')
        if any(c != canonical.get(c['id']) for c in meta['fixtures']):
            raise ValueError('Fixture changed between segments')
        errors = [r['error'] for r in records if r['type'] == 'error']
        if any(e != 'HTTP Error 500: Internal Server Error' for e in errors):
            raise ValueError('Only interrupted HTTP 500 runs can be continued')
        interruptions.extend(errors)
        rows = [r for r in records if r['type'] == 'result']
        requests = {}
        for r in records:
            if r['type'] not in {'request', 'result'}:
                continue
            key = (r['case'], r['variant'], r['repeat'])
            if r['type'] == 'request':
                if b.digest(r['request']) != r['request_hash']:
                    raise ValueError('Corrupt request hash')
                requests[key] = r
            else:
                if key not in requests or r['truncated']:
                    raise ValueError('Missing request or truncated result')
                ids = [c['id'] for c in canonical[r['case']]['choices']]
                if r['choice'] != b.parse_choice(r['raw'], ids):
                    raise ValueError('Score does not match raw response')
        for case in meta['fixtures']:
            part = [r for r in rows if r['case'] == case['id']]
            if not b.summarize([case], part, meta['repeats'])['complete']:
                continue
            signature = {(r['variant'], r['repeat']): r['raw'] for r in part}
            if case['id'] in selected:
                old = {(r['variant'], r['repeat']): r['raw'] for r in selected[case['id']]}
                if signature != old:
                    raise ValueError('Repeated complete case differs; do not cherry-pick')
            else:
                selected[case['id']] = part
    rows = [r for case in cases for r in selected.get(case['id'], [])]
    summary = b.summarize(cases, rows, first['repeats'])
    summary['interruptions'] = interruptions
    summary['input_tokens'] = {v: sum(r['response']['prompt_eval_count'] for r in rows if r['variant'] == v)
                               for v in ['baseline', 'candidate']}
    summary['seconds'] = {v: round(sum(r['seconds'] for r in rows if r['variant'] == v), 2)
                         for v in ['baseline', 'candidate']}
    return summary


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--cases', type=pathlib.Path, required=True)
    p.add_argument('segments', type=pathlib.Path, nargs='+')
    args = p.parse_args()
    cases = json.loads(args.cases.read_text(encoding='utf-8'))
    segments = [[json.loads(line) for line in path.read_text(encoding='utf-8').splitlines()]
                for path in args.segments]
    summary = combine(cases, segments)
    summary['evidence'] = [{'file': path.name, 'sha256': b.digest(path.read_bytes())} for path in args.segments]
    print(json.dumps(summary, indent=2))
    return 0 if summary['complete'] and not summary['pass_to_fail'] and not summary['nonrepeatable'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
