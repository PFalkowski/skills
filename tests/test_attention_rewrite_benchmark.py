import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

BENCH = pathlib.Path(__file__).resolve().parents[1] / 'benchmarks/attention-rewrite'
sys.path.insert(0, str(BENCH / 'harness'))
import buildtest
import common
import dbcompat
import gitutil
import lifecycle
import parity
import scorecard


def load(name):
    spec = importlib.util.spec_from_file_location(name, BENCH / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


setup_mod = load('setup')
score_mod = load('score')
blind_mod = load('blind')


def write(path, text=''):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')
    return path


def git(repo, *args):
    subprocess.run(['git', '-C', str(repo), '-c', 'user.name=t', '-c', 'user.email=t@example.com', *args],
                   check=True, capture_output=True)


class SpecTests(unittest.TestCase):
    def test_spec_splits_name_cwd_and_tokens(self):
        self.assertEqual(common.parse_spec('X=/some/dir::dotnet|a.dll|--database|{db}'),
                         ('X', '/some/dir', ['dotnet', 'a.dll', '--database', '{db}']))

    def test_bad_specs_are_rejected(self):
        for spec in ['nocolon', 'x=dir', '=dir::cmd', 'x=::cmd', 'x=dir::']:
            with self.assertRaises(ValueError, msg=spec):
                common.parse_spec(spec)

    def test_real_databases_are_refused(self):
        for path in ['/repo/.data/inbox.db', '/anywhere/inbox.db', 'C:/r/.data/x.db']:
            with self.assertRaises(ValueError, msg=path):
                common.assert_safe_db(path)
        common.assert_safe_db('/tmp/run/candidate.db')


class HostDiscoveryTests(unittest.TestCase):
    def tree(self, root):
        write(root / 'src/Inbox/Inbox.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>')
        write(root / 'src/Server/Server.csproj',
              '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType>'
              '<AssemblyName>App.Server</AssemblyName></PropertyGroup></Project>')
        write(root / 'src/Tests/T.csproj',
              '<Project><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup>'
              '<ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" /></ItemGroup></Project>')
        write(root / 'src/Server/obj/Ghost.csproj', '<OutputType>Exe</OutputType>')

    def test_finds_the_one_executable_and_skips_tests_and_obj(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            self.tree(root)
            found = buildtest.discover_hosts(root)
            self.assertEqual([(p.name, stem) for p, stem in found], [('Server.csproj', 'App.Server')])

    def test_built_dll_is_returned_only_when_present(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            self.tree(root)
            project, dll = buildtest.find_host(root)
            self.assertIsNone(dll)
            built = write(root / 'src/Server/bin/Debug/net10.0/App.Server.dll')
            self.assertEqual(buildtest.find_host(root)[1], built)

    def test_web_sdk_counts_as_executable(self):
        with tempfile.TemporaryDirectory() as d:
            write(pathlib.Path(d) / 'src/Web/Web.csproj', '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>')
            self.assertEqual(len(buildtest.discover_hosts(d)), 1)

    def test_two_executables_need_a_name_hint_or_override(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            for n in ('A', 'B'):
                write(root / f'src/{n}/{n}.csproj', '<Project><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>')
            with self.assertRaises(buildtest.DiscoveryError):
                buildtest.find_host(root)
            for n in ('HostA', 'HostB'):
                write(root / f'src/{n}/{n}.csproj', '<Project><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>')
            with self.assertRaises(buildtest.DiscoveryError):
                buildtest.find_host(root)
            for n in ('A', 'B', 'HostB'):
                (root / f'src/{n}/{n}.csproj').unlink()
            self.assertEqual(buildtest.find_host(root)[0].stem, 'HostA')

    def test_no_src_folder_means_no_host(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(buildtest.DiscoveryError):
                buildtest.find_host(d)

    def test_candidate_cmd_must_carry_a_database_placeholder(self):
        with self.assertRaises(score_mod.ScoreError):
            score_mod.candidate_tokens('.', 'dotnet app.dll --port 0', '.', True)
        tokens, _, reason = score_mod.candidate_tokens('.', 'dotnet app.dll --database {db}', '.', True)
        self.assertEqual(tokens[:2], ['dotnet', 'app.dll'])
        self.assertIsNone(reason)

    def test_solution_file_choice(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            with self.assertRaises(buildtest.DiscoveryError):
                buildtest.find_solution(root)
            write(root / 'A.sln')
            write(root / 'A.slnx')
            self.assertEqual(buildtest.find_solution(root).name, 'A.slnx')
            write(root / 'B.slnx')
            with self.assertRaises(buildtest.DiscoveryError):
                buildtest.find_solution(root)

    def test_parent_build_files_are_reported(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d) / 'a' / 'cand'
            root.mkdir(parents=True)
            self.assertEqual([p for p in buildtest.ancestor_build_files(root) if str(p).startswith(d)], [])
            props = write(pathlib.Path(d) / 'Directory.Packages.props', '<Project/>')
            self.assertIn(props.resolve(), [p.resolve() for p in buildtest.ancestor_build_files(root)])


class OutputParsingTests(unittest.TestCase):
    VSTEST = ('Passed!  - Failed:     0, Passed:    26, Skipped:     0, Total:    26, Duration: 1 s - A.dll (net10.0)\n'
              'Passed!  - Failed:     0, Passed:    49, Skipped:     1, Total:    50, Duration: 3 s - B.dll (net10.0)\n'
              'Build succeeded.\n    0 Warning(s)\n    0 Error(s)\n')

    def test_counts_are_summed_over_test_projects(self):
        r = buildtest.parse_test_output(self.VSTEST)
        self.assertEqual((r['passed'], r['failed'], r['skipped'], r['total'], r['test_projects']), (75, 0, 1, 76, 2))

    def test_failures_are_counted(self):
        r = buildtest.parse_test_output('Failed!  - Failed:     2, Passed:     5, Skipped:     0, Total:     7, Duration: 1 s')
        self.assertEqual((r['passed'], r['failed']), (5, 2))

    def test_newer_runner_summary_is_understood(self):
        r = buildtest.parse_test_output('Test run summary: Passed!\n  total: 99\n  failed: 0\n  succeeded: 99\n  skipped: 0\n')
        self.assertEqual((r['passed'], r['failed'], r['skipped']), (99, 0, 0))

    def test_no_summary_gives_zero_projects(self):
        self.assertEqual(buildtest.parse_test_output('restore failed')['test_projects'], 0)

    def test_build_warnings_use_the_last_summary(self):
        text = '    3 Warning(s)\n    0 Error(s)\n    1 Warning(s)\n    2 Error(s)\n'
        self.assertEqual(buildtest.parse_build_output(text), {'warnings': 1, 'errors': 2})
        self.assertEqual(buildtest.parse_build_output('nothing'), {'warnings': None, 'errors': None})


def result(case, status=200, body=None, server='x', ctype='application/json'):
    return {'case': case, 'status': status, 'body': {'json': body},
            'headers': {'content-type': ctype, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
                        'content-security-policy': 'default-src', 'server': server}}


class ParityTests(unittest.TestCase):
    def test_script_has_129_requests_and_no_embedded_answers(self):
        steps = list(parity.script(1234, {'ids': {}}))
        self.assertEqual(len(steps), 129)
        self.assertEqual(len({name for name, _ in steps}), 129)

    def test_compare_counts_each_category_once_per_case(self):
        ref = [result('a'), result('b', body={'k': 1}), result('c'), result('d')]
        oth = [result('a'), result('b', body={'k': 2}), result('c', status=500), result('d', ctype='text/html')]
        r = parity.compare(ref, oth)
        self.assertEqual((r['cases'], r['status_differs'], r['body_differs'], r['headers_differ']), (4, 1, 1, 1))
        self.assertEqual([row['case'] for row in r['rows']], ['b', 'c', 'd'])

    def test_generated_ids_in_different_order_are_not_a_difference(self):
        ref = [result('a', body={'id': '<id1>'}), result('b', body={'id': '<id2>'})]
        oth = [result('a', body={'id': '<id2>'}), result('b', body={'id': '<id1>'})]
        self.assertEqual(parity.compare(ref, oth)['body_differs'], 0)

    def test_server_header_is_reported_not_counted(self):
        r = parity.compare([result('a', server='py')], [result('a', server='kestrel')])
        self.assertEqual(r['status_differs'] + r['body_differs'] + r['headers_differ'], 0)
        self.assertEqual(r['server_headers'], ['kestrel'])

    def test_case_mismatch_is_refused(self):
        with self.assertRaises(ValueError):
            parity.compare([result('a')], [result('b')])

    def test_field_diffs_name_the_field(self):
        ref = [result('x', body={'item': {'state': 'running', 'n': 1}})]
        oth = [result('x', body={'item': {'state': 'queued', 'n': 1}})]
        found = parity.field_diffs(ref, oth)
        self.assertEqual([(f['case'], f['path']) for f in found], [('x', '.json.item.state')])
        self.assertEqual(parity.field_diffs(ref, [result('x', status=400, body={'e': 1})]), [])


def life_rows(idle_exit=0, flight_exit=0, saved=True):
    return [{'case': 'idle interrupt', 'exit': idle_exit}, {'case': 'in-flight request', 'exit': flight_exit, 'response': 'HTTP/1.1 200 OK'},
            {'case': 'after restart', 'in-flight item persisted': saved}]


class LifecycleTests(unittest.TestCase):
    def test_server_that_stops_is_recognised(self):
        v = lifecycle.verdict(life_rows())
        self.assertEqual((v['stops_when_idle'], v['idle_exit_code'], v['exits_with_request_in_flight']), (True, 0, True))

    def test_server_that_ignores_the_signal_is_recognised(self):
        v = lifecycle.verdict(life_rows('did not exit (killed)', 'did not exit (killed)'))
        self.assertEqual((v['stops_when_idle'], v['idle_exit_code'], v['exits_with_request_in_flight']), (False, None, False))


def card(**over):
    base = {
        'label': 'demo', 'candidate_source': 'somewhere', 'pins': {'start': 'abc'}, 'environment': {'os': 'test'},
        'tests': {'solution': 'A.slnx', 'build': {'exit': 0, 'ok': True, 'warnings': 0, 'errors': 0},
                  'dotnet_test': {'exit': 0, 'passed': 98, 'failed': 0, 'skipped': 1, 'total': 99, 'test_projects': 4},
                  'node_check': {'status': 'pass'}},
        'parity': {'cases': 129, 'status_differs': 5, 'body_differs': 17, 'headers_differ': 11, 'server_headers': ['None'],
                   'reference_server_headers': ['py'], 'rows': [], 'field_diffs': [],
                   'stale_guard': {'steps': ['a'], 'reference': [200], 'candidate': [200]}},
        'dbcompat': {'schemas_equal': True,
                     'reference_to_candidate': {'pair': 'r2c', **{c: True for c in dbcompat.CHECKS}},
                     'candidate_to_reference': {'pair': 'c2r', **{c: True for c in dbcompat.CHECKS}}},
        'lifecycle': {'candidate': {'stops_when_idle': True, 'idle_exit_code': 0, 'exits_with_request_in_flight': True,
                                    'in_flight_response': 'HTTP/1.1 200 OK', 'in_flight_item_saved': True},
                      'reference': {'stops_when_idle': True, 'idle_exit_code': 1, 'exits_with_request_in_flight': True,
                                    'in_flight_response': 'reset', 'in_flight_item_saved': False}},
    }
    base.update(over)
    return base


class ScorecardTests(unittest.TestCase):
    def test_summary_holds_the_headline_numbers(self):
        s = scorecard.summarize(card())
        self.assertEqual((s['tests'], s['parity'], s['dbcompat_all_yes'], s['stale_guard_ok']), ('98 / 0 / 1', '5 / 17 / 11', True, True))
        self.assertEqual(s['lifecycle'], 'stops, exit 0')

    def test_summary_flags_a_stuck_server_and_the_stale_bug(self):
        c = card()
        c['lifecycle']['candidate'].update(stops_when_idle=False, idle_exit_code=None)
        c['parity']['stale_guard']['candidate'] = [200, 500]
        c['dbcompat']['candidate_to_reference']['action_works'] = False
        s = scorecard.summarize(c)
        self.assertEqual((s['lifecycle'], s['stale_guard_ok'], s['dbcompat_all_yes']), ('does not stop on interrupt', False, False))

    def test_summary_of_a_run_that_stopped_after_the_build(self):
        self.assertEqual(scorecard.summarize({'tests': {}, 'skipped': {'parity': 'no host'}}), {})

    def test_markdown_is_plain_text_with_the_sections(self):
        c = card()
        c['skipped'] = {'docker': 'not requested'}
        text = scorecard.render_markdown(c)
        for needle in ('# Scorecard: demo', '98 / 0 / 1', '5', 'Database compatibility', 'Lifecycle', '- docker: not requested'):
            self.assertIn(needle, text)
        json.dumps(c)


class ScoreOutputTests(unittest.TestCase):
    def test_out_inside_candidate_or_private_clone_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            cand, priv = pathlib.Path(d) / 'cand', pathlib.Path(d) / 'priv'
            cand.mkdir(); priv.mkdir()
            for bad in (cand / 'out', priv / 'x' / 'out', cand):
                with self.assertRaises(score_mod.ScoreError, msg=str(bad)):
                    score_mod.check_out(bad, cand, priv)
            made = score_mod.check_out(pathlib.Path(d) / 'out', cand, priv)
            self.assertTrue(made.is_dir())

    def test_non_empty_out_is_refused(self):
        with tempfile.TemporaryDirectory() as d, tempfile.TemporaryDirectory() as e:
            write(pathlib.Path(d) / 'old.txt', 'x')
            with self.assertRaises(score_mod.ScoreError):
                score_mod.check_out(d, e + '/c', e + '/p')


class BlindTests(unittest.TestCase):
    def test_assignment_is_repeatable_and_covers_every_subject_once(self):
        a = blind_mod.assign(7, True, 'cfg')
        self.assertEqual(a, blind_mod.assign(7, True, 'cfg'))
        self.assertEqual(sorted(a), ['A', 'B', 'C'])
        self.assertEqual(sorted(a.values()), ['anchor-x', 'anchor-y', 'cfg'])
        self.assertEqual(sorted(blind_mod.assign(1, False, 'cfg').values()), ['anchor-x', 'cfg'])

    def test_different_seeds_do_not_always_agree(self):
        self.assertGreater(len({tuple(blind_mod.assign(s, False).values()) for s in range(20)}), 1)

    def test_every_label_is_read_first_in_some_dimension(self):
        order = blind_mod.orders(blind_mod.assign(3, True))
        self.assertEqual({o[0] for o in order.values()}, {'A', 'B', 'C'})
        self.assertTrue(all(sorted(o) == ['A', 'B', 'C'] for o in order.values()))

    def test_mapping_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            out = pathlib.Path(d) / 'map.json'
            self.assertEqual(blind_mod.main(['--candidate', 'c', '--seed', '1', '--out', str(out)]), 0)
            first = out.read_text(encoding='utf-8')
            self.assertEqual(blind_mod.main(['--candidate', 'c', '--seed', '2', '--out', str(out)]), 2)
            self.assertEqual(out.read_text(encoding='utf-8'), first)


class SetupTests(unittest.TestCase):
    PINS = {'start': {'tag': 't/start', 'commit': None}, 'anchor-x': {'tag': 't/anchor-x', 'commit': None},
            'anchor-y': {'tag': 't/anchor-y', 'commit': None}, 'fixtures': {'tag': 't/fixtures', 'commit': None}}

    def make_private(self, root, with_fixtures=True):
        repo = root / 'private'
        repo.mkdir()
        git(repo, 'init', '--quiet', '--initial-branch=main')
        write(repo / 'server.py', 'start')
        git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'start'); git(repo, 'tag', '-a', 't/start', '-m', 's')
        write(repo / 'answer.txt', 'x')
        git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'x'); git(repo, 'tag', '-a', 't/anchor-x', '-m', 'x')
        write(repo / 'answer.txt', 'y')
        git(repo, 'commit', '-qam', 'y'); git(repo, 'tag', '-a', 't/anchor-y', '-m', 'y')
        if with_fixtures:
            git(repo, 'checkout', '-q', '--orphan', 'fix')
            git(repo, 'rm', '-rfq', '.')
            write(repo / 'ISSUE.md', 'issue text'); write(repo / 'PROMPT.md', 'prompt text')
            git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'fixtures'); git(repo, 'tag', '-a', 't/fixtures', '-m', 'f')
            git(repo, 'checkout', '-q', 'main')
        return repo

    def test_non_empty_or_nested_output_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            full = root / 'full'
            write(full / 'file.txt', 'x')
            with self.assertRaises(setup_mod.SetupError):
                setup_mod.check_output_folder(full, root / 'priv')
            with self.assertRaises(setup_mod.SetupError):
                setup_mod.check_output_folder(root / 'priv' / 'out', root / 'priv')
            setup_mod.check_output_folder(root / 'fresh', root / 'priv')
            (root / 'empty').mkdir()
            setup_mod.check_output_folder(root / 'empty', root / 'priv')

    def test_sandbox_holds_only_the_start_history(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            private = self.make_private(root)
            made = setup_mod.build(private, root / 'out', self.PINS)
            repo = made['repo']
            self.assertEqual(gitutil.git(repo, 'for-each-ref', '--format=%(refname)'), 'refs/heads/main')
            self.assertEqual(gitutil.git(repo, 'remote'), '')
            self.assertEqual(gitutil.git(repo, 'rev-list', '--count', 'HEAD'), '1')
            self.assertFalse((repo / 'answer.txt').exists())
            self.assertEqual((made['task'] / 'PROMPT.md').read_text(encoding='utf-8'), 'prompt text')
            self.assertFalse((made['task'].resolve().parent / 'repo' / 'PROMPT.md').exists())
            with self.assertRaises(setup_mod.SetupError):
                setup_mod.build(private, root / 'out', self.PINS)

    def test_isolation_check_catches_a_leaked_commit_ref_or_remote(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            private = self.make_private(root)
            made = setup_mod.build(private, root / 'out', self.PINS)
            repo = made['repo']
            commits = gitutil.resolve(private, self.PINS)
            setup_mod.check_isolation(repo, [commits['anchor-x']], commits['start'])
            git(repo, 'fetch', '-q', '--no-tags', str(private), commits['anchor-x'])
            with self.assertRaises(setup_mod.SetupError):
                setup_mod.check_isolation(repo, [commits['anchor-x']], commits['start'])
            git(repo, 'branch', 'leak', commits['anchor-x'])
            with self.assertRaises(setup_mod.SetupError):
                setup_mod.check_isolation(repo, [], commits['start'])
            git(repo, 'branch', '-D', 'leak')
            git(repo, 'remote', 'add', 'origin', str(private))
            with self.assertRaises(setup_mod.SetupError):
                setup_mod.check_isolation(repo, [], commits['start'])

    def test_sandbox_never_names_the_private_clone(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            private = self.make_private(root)
            made = setup_mod.build(private, root / 'out', self.PINS)
            repo = made['repo']
            fetch_head = repo / '.git' / 'FETCH_HEAD'
            self.assertFalse(fetch_head.exists())
            self.assertEqual(setup_mod.names_the_source(repo, private), [])
            commits = gitutil.resolve(private, self.PINS)
            for spelling in (str(private), private.as_posix()):
                fetch_head.write_text('abc\tnot-for-merge\t of ' + spelling + '\n', encoding='utf-8')
                with self.assertRaises(setup_mod.SetupError):
                    setup_mod.check_isolation(repo, [], commits['start'], private)
            fetch_head.unlink()
            setup_mod.check_isolation(repo, [], commits['start'], private)

    def test_missing_or_moved_pin_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            private = self.make_private(root, with_fixtures=False)
            with self.assertRaises(setup_mod.SetupError):
                setup_mod.build(private, root / 'out', self.PINS)
            moved = {**self.PINS, 'start': {'tag': 't/start', 'commit': 'deadbee'}}
            with self.assertRaises(setup_mod.SetupError):
                setup_mod.build(private, root / 'out2', moved)

    def test_archive_exports_a_ref_without_a_git_folder(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            private = self.make_private(root)
            out = gitutil.archive(private, 't/anchor-x', root / 'export')
            self.assertEqual((out / 'answer.txt').read_text(encoding='utf-8'), 'x')
            self.assertFalse((out / '.git').exists())


class RoundTwoTests(unittest.TestCase):
    def test_flaky_one_megabyte_case_is_reported_not_counted(self):
        ref = [result('a'), result('POST 1MB', status='EXC aborted')]
        for other_status in (400, 'EXC ConnectionAbortedError'):
            oth = [result('a'), result('POST 1MB', status=other_status)]
            r = parity.compare(ref, oth)
            self.assertEqual((r['status_differs'], r['body_differs'], r['headers_differ'], r['counted']), (0, 0, 0, 1))
            self.assertEqual([e['case'] for e in r['excluded']], ['POST 1MB'])

    def test_summary_carries_build_state_and_flags_zero_tests(self):
        c = card()
        c['tests']['dotnet_test'].update(total=0, test_projects=0, passed=0, skipped=0)
        s = scorecard.summarize(c)
        self.assertEqual((s['build_exit'], s['build_ok']), (0, True))
        self.assertEqual(s['flags'], ['no test projects ran'])
        c['tests']['build'].update(exit=1, ok=False)
        self.assertFalse(scorecard.summarize(c)['build_ok'])

    def test_a_failed_build_is_never_scored(self):
        tokens, _, reason = score_mod.candidate_tokens('.', 'dotnet app.dll --database {db}', '.', False)
        self.assertIsNone(tokens)
        self.assertIn('build failed', reason)

    def test_old_build_output_is_ignored(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            write(root / 'src/App/App.csproj', '<Project><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>')
            dll = write(root / 'src/App/bin/Debug/net10.0/App.dll')
            self.assertEqual(buildtest.find_host(root, os.path.getmtime(dll) - 1)[1], dll)
            self.assertIsNone(buildtest.find_host(root, os.path.getmtime(dll) + 100)[1])
            buildtest.clean_outputs(root)
            self.assertFalse((root / 'src/App/bin').exists())

    def test_meta_and_warnings_show_in_the_scorecard(self):
        self.assertEqual(score_mod.parse_meta(['model=x', 'effort=a=b']), {'model': 'x', 'effort': 'a=b'})
        with self.assertRaises(score_mod.ScoreError):
            score_mod.parse_meta(['nokey'])
        c = card(meta={'model': 'm-1'}, warnings=['no pin is verified'], pins={'start': 'abc123'},
                 candidate_commit='def456', candidate_pin='anchor-x')
        text = scorecard.render_markdown(c)
        for needle in ('m-1', 'no pin is verified', 'abc123', 'def456', 'anchor-x'):
            self.assertIn(needle, text)

    def test_excluded_case_line_is_rendered(self):
        c = card()
        c['parity']['excluded'] = [{'case': 'POST 1MB', 'reference_status': '400', 'status': '400'}]
        self.assertIn('Left out of the counts', scorecard.render_markdown(c))

    def test_taskkill_failure_is_logged_for_a_live_process(self):
        proc = mock.Mock(pid=4242)
        proc.poll.return_value = None
        proc.wait.return_value = 0
        with mock.patch.object(common, 'WINDOWS', True), \
                mock.patch.object(common.subprocess, 'run', return_value=mock.Mock(returncode=5, stderr='denied')), \
                mock.patch('sys.stderr') as err:
            common.kill_tree(proc)
        self.assertIn('denied', ''.join(str(c) for c in err.write.call_args_list))

    def test_a_timed_out_command_is_killed(self):
        with tempfile.TemporaryDirectory() as d:
            log = pathlib.Path(d) / 'l.log'
            code, out, _ = buildtest.run_logged([sys.executable, '-c', 'import time; time.sleep(60)'], d, log, timeout=1)
            self.assertEqual(code, 'timeout')
            self.assertIn('timed out', log.read_text(encoding='utf-8'))


FAKE_HOST = """
import os, signal, sys, time
from http.server import BaseHTTPRequestHandler, HTTPServer
mode = sys.argv[1]
with open(os.environ["FAKE_PIDS"], "a") as f:
    f.write(str(os.getpid()) + chr(10))
if mode == "exit":
    print("fake host crashed", flush=True)
    sys.exit(3)
if mode == "silent":
    time.sleep(300)
class H(BaseHTTPRequestHandler):
    def reply(self):
        self.send_response(200)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"{}")
    do_GET = do_POST = reply
    def log_message(self, *a):
        pass
srv = HTTPServer(("127.0.0.1", 0), H)
print("http://127.0.0.1:%d" % srv.server_port, flush=True)
if mode == "deaf":
    signal.signal(signal.SIGINT, signal.SIG_IGN)
try:
    srv.serve_forever()
except KeyboardInterrupt:
    pass
"""


def pid_alive(pid):
    if os.name == 'nt':
        out = subprocess.run(['tasklist', '/FI', f'PID eq {pid}', '/NH', '/FO', 'CSV'], capture_output=True, text=True).stdout
        return f'"{pid}"' in out
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


class FragileHostTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self.tmp.name)
        self.script = write(self.dir / 'fake.py', FAKE_HOST)
        self.pids = self.dir / 'pids.txt'
        patches = [mock.patch.dict(os.environ, {'FAKE_PIDS': str(self.pids)}),
                   mock.patch.object(common, 'START_TIMEOUT', 1), mock.patch.object(lifecycle, 'EXIT_TIMEOUT', 1)]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        common.kill_all()
        self.tmp.cleanup()

    def spec(self, mode):
        return (str(self.dir), [sys.executable, str(self.script), mode, '--database', '{db}'])

    def assert_nothing_left(self):
        self.assertEqual(common._STARTED, [])
        pids = [int(x) for x in self.pids.read_text().split()]
        self.assertTrue(pids)
        for pid in pids:
            self.assertFalse(pid_alive(pid), f'process {pid} is still running')

    def check_failed_start(self, mode):
        out = self.dir / 'out'
        out.mkdir()
        c = {'label': 'fake', 'skipped': {}, 'warnings': [], 'meta': {}, 'pins': {}, 'environment': {},
             'tests': {'solution': 'x.sln', 'build': {'exit': 0, 'ok': True, 'warnings': 0, 'errors': 0},
                       'dotnet_test': {'exit': 0, 'passed': 3, 'failed': 0, 'skipped': 0, 'total': 3, 'test_projects': 1},
                       'node_check': {'status': 'pass'}}}
        failure = score_mod.run_server_checks(c, self.spec('ok'), self.spec(mode), out)
        score_mod.finish(c, out)
        self.assertIn('host failed to start', failure)
        self.assertIn('host failed to start', c['skipped']['parity'])
        self.assertIn('not run', c['skipped']['dbcompat'])
        self.assertIn('not run', c['skipped']['lifecycle'])
        self.assertIn('3 / 0 / 0', (out / 'scorecard.md').read_text(encoding='utf-8'))
        self.assertEqual(json.loads((out / 'scorecard.json').read_text(encoding='utf-8'))['summary']['tests'], '3 / 0 / 0')
        self.assert_nothing_left()

    def test_host_that_exits_early_still_gives_a_scorecard(self):
        self.check_failed_start('exit')

    def test_host_that_never_prints_its_address_still_gives_a_scorecard(self):
        self.check_failed_start('silent')

    def test_host_that_ignores_the_interrupt_is_reported_and_killed(self):
        result = lifecycle.run_lifecycle(self.spec('ok'), self.spec('deaf'), self.dir / 'life')
        self.assertFalse(result['candidate']['stops_when_idle'])
        self.assertFalse(result['candidate']['exits_with_request_in_flight'])
        self.assert_nothing_left()


if __name__ == '__main__':
    unittest.main()
