import importlib.util
import pathlib
import sys
import unittest
from unittest.mock import patch

PATH = pathlib.Path(__file__).resolve().parents[1] / 'benchmarks/skill-context/benchmark.py'
spec = importlib.util.spec_from_file_location('benchmark', PATH)
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
sys.path.insert(0, str(PATH.parent))
import report


class BenchmarkTests(unittest.TestCase):
    def test_prompt_does_not_leak_answer_or_assertion(self):
        case = dict(prompt='Task', choices=[dict(id='A', text='Do it')], expected='SECRET', assertion='HIDDEN')
        prompt = b.make_prompt(case, 'SKILL TEXT')
        self.assertNotIn('SECRET', str(prompt))
        self.assertNotIn('HIDDEN', str(prompt))
        self.assertIn('SKILL TEXT', str(prompt))

    def test_parser_rejects_extra_fields_and_unknown_choices(self):
        self.assertEqual(b.parse_choice('{"choice":"A"}', ['A']), 'A')
        for value in ['{"choice":"B"}', '{"choice":"A","extra":1}', 'A', 'null']:
            self.assertIsNone(b.parse_choice(value, ['A']))

    def test_incomplete_and_nonrepeatable_are_reported(self):
        cases = [dict(id='one', expected='A')]
        rows = [dict(case='one', variant=v, repeat=r, choice=c, raw=c, truncated=False)
                for v, r, c in [('baseline', 0, 'A'), ('baseline', 1, 'A'), ('candidate', 0, 'B'), ('candidate', 1, 'A')]]
        report = b.summarize(cases, rows, 2)
        self.assertEqual(report['pass_to_fail'], ['one'])
        self.assertEqual(report['nonrepeatable'], ['candidate:one'])
        self.assertTrue(report['complete'])
        self.assertFalse(b.summarize(cases, rows[:-1], 2)['complete'])

    def test_only_loopback_is_allowed(self):
        for host in ['http://127.0.0.1:11434', 'http://localhost:11434', 'http://[::1]:11434']:
            b.validate_host(host)
        for host in ['https://example.com', 'http://127.0.0.1.example.com', 'http://user:pw@localhost']:
            with self.assertRaises(ValueError):
                b.validate_host(host)

    def test_moved_references_use_variant_paths_without_changing_case(self):
        case = dict(kind='behavior', skill='example', references={
            'baseline': ['example/old.md'], 'candidate': ['example/references/new.md']})
        with patch.object(b, 'source', side_effect=lambda ref, path: path) as read:
            b.context('immutable', case, 'candidate')
        self.assertEqual([call.args for call in read.call_args_list], [
            ('immutable', 'example/SKILL.md'), ('immutable', 'example/references/new.md')])

    def test_truncated_correct_choice_is_not_a_pass(self):
        rows = [dict(case='one', variant=v, repeat=r, choice='A', raw='A', truncated=True)
                for v in ['baseline', 'candidate'] for r in range(2)]
        self.assertEqual(b.summarize([dict(id='one', expected='A')], rows, 2)['scores'],
                         dict(baseline=0, candidate=0))

    def test_malformed_choice_fails_both_arms(self):
        rows = [dict(case='one', variant=v, repeat=r, choice=None, raw='bad', truncated=False)
                for v in ['baseline', 'candidate'] for r in range(2)]
        summary = b.summarize([dict(id='one', expected='A', kind='behavior')], rows, 2)
        self.assertEqual(summary['shared_failures'], ['one'])
        self.assertEqual(summary['scores_by_kind']['behavior'], dict(baseline=0, candidate=0))

    def test_routing_reads_only_manifest_skills(self):
        def read(ref, path):
            return '{"skills":["./one"]}' if path.endswith('plugin.json') else '---\ndescription: Example\n---\nSECRET BODY'
        with patch.object(b, 'source', side_effect=read):
            result = b.context('ref', dict(kind='routing'), 'baseline')
        self.assertEqual(result, 'one: Example')

    def test_unload_waits_for_selected_digest(self):
        with patch.object(b, 'api', side_effect=[{}, {'models': [{'digest': 'd'}]}, {'models': []}]), \
                patch.object(b.time, 'sleep') as sleep:
            b.unload('http://localhost:11434', 'model', 'd')
        sleep.assert_called_once_with(0.25)


class SegmentTests(unittest.TestCase):
    def setUp(self):
        self.case = dict(id='one', kind='behavior', expected='A', choices=[dict(id='A', text='Act')])
        self.meta = dict(type='metadata', refs={}, identity={}, options={}, script_hash='fixed',
                         hardware={}, repeats=2, fixtures=[self.case])
        self.rows = [self.meta]
        for variant in ['baseline', 'candidate']:
            for repeat in range(2):
                key = dict(case='one', variant=variant, repeat=repeat)
                self.rows.append(dict(type='request', **key, request={}, request_hash=b.digest({})))
                self.rows.append(dict(type='result', **key, choice='A', raw='{"choice":"A"}',
                                      truncated=False, seconds=1, response=dict(prompt_eval_count=10)))

    def test_interrupted_case_is_replaced_whole_not_counted_twice(self):
        partial = self.rows[:5] + [dict(type='error', error='HTTP Error 500: Internal Server Error')]
        summary = report.combine([self.case], [partial, self.rows])
        self.assertTrue(summary['complete'])
        self.assertEqual(summary['requests'], 4)
        self.assertEqual(len(summary['interruptions']), 1)

    def test_incompatible_model_and_changed_fixture_are_rejected(self):
        for field, value in [('identity', {'digest': 'different'}),
                             ('fixtures', [dict(self.case, expected='B')])]:
            changed = [dict(self.meta, **{field: value}), *self.rows[1:]]
            with self.assertRaises(ValueError):
                report.combine([self.case], [self.rows, changed])

    def test_duplicate_complete_cases_cannot_hide_different_answers(self):
        changed = [dict(r) for r in self.rows]
        changed[-1]['choice'] = None
        changed[-1]['raw'] = 'invalid'
        with self.assertRaisesRegex(ValueError, 'cherry-pick'):
            report.combine([self.case], [self.rows, changed])


if __name__ == '__main__':
    unittest.main()
