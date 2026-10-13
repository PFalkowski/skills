"""Paired, cold-start Ollama skill probes with deterministic scoring."""
import argparse
import hashlib
import json
import pathlib
import platform
import subprocess
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
OPTIONS = dict(temperature=0, seed=0, num_ctx=32768, num_predict=64,
               top_k=1, top_p=1, repeat_penalty=1)


def digest(value):
    data = value if isinstance(value, bytes) else json.dumps(value, sort_keys=True).encode()
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args]).decode('utf-8')


def validate_host(host):
    url = urllib.parse.urlparse(host)
    if (url.scheme != 'http' or url.hostname not in {'localhost', '127.0.0.1', '::1'}
            or url.username or url.password or url.path not in {'', '/'} or url.query or url.fragment):
        raise ValueError('Host must be a loopback HTTP Ollama endpoint')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Local API redirects are forbidden')


def api(host, path, payload=None):
    validate_host(host)
    request = urllib.request.Request(host.rstrip('/') + '/api/' + path,
                                    data=None if payload is None else json.dumps(payload).encode(),
                                    headers={'Content-Type': 'application/json'})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=1800) as response:
        return json.load(response)


def source(ref, path):
    if path.startswith('/') or '..' in pathlib.PurePosixPath(path).parts:
        raise ValueError('Invalid repository reference path')
    return git('show', f'{ref}:{path}')


def context(ref, case, variant):
    if case['kind'] == 'routing':
        paths = [p.removeprefix('./') + '/SKILL.md' for p in
                 json.loads(source(ref, '.claude-plugin/plugin.json'))['skills']]
        entries = []
        for path in sorted(paths):
            if path.count('/') == 1 and path.endswith('/SKILL.md'):
                text = source(ref, path)
                description = next(line.partition(':')[2].strip() for line in text.splitlines()
                                   if line.startswith('description:'))
                entries.append(f'{path.split("/")[0]}: {description}')
        return '\n'.join(entries)
    references = case.get('references', [])
    if isinstance(references, dict):
        references = references[variant]
    paths = [case['skill'] + '/SKILL.md', *references]
    return '\n\n'.join(f'--- {path} ---\n{source(ref, path)}' for path in paths)


def make_prompt(case, skill_context):
    return [dict(role='system', content='Apply the supplied skill material to the task. Select the best option. '
                 'Return only a JSON object with the key choice and the chosen option ID.\n\n' + skill_context),
            dict(role='user', content=case['prompt'] + '\n\nOptions:\n' + '\n'.join(
                f'{item["id"]}: {item["text"]}' for item in case['choices']))]


def parse_choice(raw, ids):
    try:
        value = json.loads(raw)
        if isinstance(value, dict) and set(value) == {'choice'} and value['choice'] in ids:
            return value['choice']
    except (ValueError, TypeError):
        pass
    return None


def summarize(cases, rows, repeats):
    groups = {(v, c['id']): [r for r in rows if r['variant'] == v and r['case'] == c['id']]
              for v in ['baseline', 'candidate'] for c in cases}
    complete = all(len(rs) == repeats and {r['repeat'] for r in rs} == set(range(repeats))
                   for rs in groups.values())
    passed = {(v, c['id']): len(groups[v, c['id']]) == repeats and all(
        r['choice'] == c['expected'] and not r['truncated'] for r in groups[v, c['id']])
        for v in ['baseline', 'candidate'] for c in cases}
    return dict(complete=complete, cases=len(cases), requests=len(rows),
                scores={v: sum(passed[v, c['id']] for c in cases) for v in ['baseline', 'candidate']},
                scores_by_kind={k: {v: sum(passed[v, c['id']] for c in cases if c.get('kind') == k)
                                    for v in ['baseline', 'candidate']} for k in ['behavior', 'routing']},
                shared_failures=[c['id'] for c in cases if not passed['baseline', c['id']] and not passed['candidate', c['id']]],
                pass_to_fail=[c['id'] for c in cases if passed['baseline', c['id']] and not passed['candidate', c['id']]],
                fail_to_pass=[c['id'] for c in cases if not passed['baseline', c['id']] and passed['candidate', c['id']]],
                nonrepeatable=[f'{v}:{cid}' for (v, cid), rs in groups.items()
                               if len({r['raw'] for r in rs}) > 1])


def identity(host, model):
    matches = [m for m in api(host, 'tags')['models'] if m['name'] == model]
    if len(matches) != 1:
        raise ValueError(f'Installed model not found by exact name: {model}')
    show = api(host, 'show', {'model': model})
    return dict(engine=api(host, 'version')['version'], model=model, digest=matches[0]['digest'],
                template_hash=digest(show.get('template', '')), parameters=show.get('parameters'),
                model_info=show.get('model_info'), details=show.get('details'))


def hardware():
    result = dict(platform=platform.platform(), processor=platform.processor())
    try:
        result['gpu'] = subprocess.check_output(['nvidia-smi', '--query-gpu=name,driver_version,memory.total',
                                                 '--format=csv,noheader'], timeout=10).decode().strip()
    except (OSError, subprocess.SubprocessError) as error:
        result['gpu_unavailable'] = type(error).__name__
    return result


def unload(host, model, model_digest):
    api(host, 'generate', dict(model=model, keep_alive=0))
    deadline = time.monotonic() + 30
    while any(m.get('name') == model or m.get('digest') == model_digest
              for m in api(host, 'ps')['models']):
        if time.monotonic() >= deadline:
            raise RuntimeError('Selected model failed to unload within 30 seconds')
        time.sleep(0.25)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', default='3d40574')
    parser.add_argument('--candidate', default='8cfe3ec')
    parser.add_argument('--cases', type=pathlib.Path, required=True)
    parser.add_argument('--model', default='qwen2.5-coder:7b')
    parser.add_argument('--host', default='http://127.0.0.1:11434')
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--repeats', type=int, default=2)
    parser.add_argument('--limit', type=int)
    args = parser.parse_args()
    validate_host(args.host)
    output = args.output.resolve()
    if output.is_relative_to(ROOT) or args.repeats < 2 or (args.limit is not None and args.limit < 1):
        parser.error('Output must be outside repository; repeats >= 2 and limit >= 1')
    cases_bytes = args.cases.read_bytes()
    all_cases = json.loads(cases_bytes)
    cases = all_cases[:args.limit] if args.limit else all_cases
    if not cases or len({c['id'] for c in all_cases}) != len(all_cases):
        raise ValueError('Cases must be nonempty with unique IDs')
    for case in cases:
        ids = [item['id'] for item in case['choices']]
        if case['kind'] not in {'behavior', 'routing'} or case['expected'] not in ids or len(set(ids)) != len(ids):
            raise ValueError(f'Invalid case: {case["id"]}')
    refs = {v: git('rev-parse', '--verify', f'{getattr(args, v)}^{{commit}}').strip()
            for v in ['baseline', 'candidate']}
    prompts = {(v, c['id']): make_prompt(c, context(ref, c, v)) for v, ref in refs.items() for c in cases}
    initial = identity(args.host, args.model)
    output.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    run_error = None
    with output.open('x', encoding='utf-8') as stream:
        def record(value):
            stream.write(json.dumps(value, ensure_ascii=False) + '\n')
            stream.flush()
        record(dict(type='metadata', refs=refs, identity=initial, options=OPTIONS,
                    fixtures=all_cases, hardware=hardware(),
                    fixtures_hash=digest(cases_bytes), script_hash=digest(pathlib.Path(__file__).read_bytes()),
                    repeats=args.repeats, selected_cases=len(cases), total_cases=len(all_cases)))
        try:
            for case in cases:
                for repeat in range(args.repeats):
                    for variant in ['baseline', 'candidate']:
                        if identity(args.host, args.model) != initial:
                            raise RuntimeError('Engine or model identity drift')
                        unload(args.host, args.model, initial['digest'])
                        ids = [item['id'] for item in case['choices']]
                        request = dict(model=args.model, messages=prompts[variant, case['id']], stream=False,
                                       keep_alive=0, options=OPTIONS, format=dict(type='object',
                                       properties=dict(choice=dict(type='string', enum=ids)),
                                       required=['choice'], additionalProperties=False))
                        record(dict(type='request', case=case['id'], variant=variant, repeat=repeat,
                                    request=request, request_hash=digest(request)))
                        started = time.monotonic()
                        response = api(args.host, 'chat', request)
                        raw = response.get('message', {}).get('content', '')
                        truncated = (response.get('done_reason') == 'length' or not response.get('done')
                                     or 'prompt_eval_count' not in response
                                     or response['prompt_eval_count'] + OPTIONS['num_predict'] + 256 >= OPTIONS['num_ctx'])
                        row = dict(type='result', case=case['id'], variant=variant, repeat=repeat,
                                   choice=parse_choice(raw, ids), raw=raw, truncated=truncated,
                                   seconds=time.monotonic() - started, response=response)
                        rows.append(row)
                        record(row)
                        print(f'{case["id"]} {variant} {repeat + 1}: {row["choice"]}', flush=True)
                        if identity(args.host, args.model) != initial:
                            raise RuntimeError('Engine or model identity drift')
                        if truncated:
                            raise RuntimeError('Output limit or suspected context saturation; run invalid')
        except Exception as error:
            run_error = str(error)
            record(dict(type='error', error=str(error)))
            raise
        finally:
            summary = summarize(cases, rows, args.repeats)
            summary['valid'] = run_error is None
            summary['full_coverage'] = summary['complete'] and len(cases) == len(all_cases)
            record(dict(type='summary', **summary))
            print(json.dumps(summary, indent=2), flush=True)
    return 0 if summary['full_coverage'] and not summary['pass_to_fail'] and not summary['nonrepeatable'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
