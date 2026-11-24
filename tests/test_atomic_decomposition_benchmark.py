import contextlib
import copy
import io
import json
import pathlib
import re
import sys
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parents[1] / "benchmarks/atomic-decomposition"
sys.path.insert(0, str(HERE))
import analyze  # noqa: E402
import grade  # noqa: E402
import harness  # noqa: E402

CASES = {c["id"]: c for c in grade.load_cases()}
RUN = grade.EXEMPLAR_COMMANDS

def score(case, report, commands=RUN):
    return grade.grade(case, json.dumps(report), commands)


def other(verdict):
    return "refuted" if verdict == "confirmed" else "confirmed"


def scrub(report, tokens):
    text = json.dumps(report)
    for token in tokens:
        text = re.sub(re.escape(json.dumps(token)[1:-1]), "x", text, flags=re.I)
    return json.loads(text)


class ExemplarTests(unittest.TestCase):
    def test_self_test_passes(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(grade.self_test(), 0)

    def test_every_exemplar_passes(self):
        self.assertEqual(len(CASES), 6)
        for cid, case in CASES.items():
            with self.subTest(cid):
                self.assertTrue(score(case, case["exemplar"])["success"])

    def test_wrong_root_fails(self):
        for cid, case in CASES.items():
            with self.subTest(cid):
                report = copy.deepcopy(case["exemplar"])
                report["root"]["verdict"] = other(case["root"])
                result = score(case, report)
                self.assertFalse(result["checks"]["root"])
                self.assertFalse(result["success"])

    def test_missing_evidence_group_fails(self):
        for cid, case in CASES.items():
            for number, group in enumerate(case["evidence_tokens"]):
                with self.subTest(cid, group=number):
                    result = score(case, scrub(case["exemplar"], group))
                    self.assertFalse(result["checks"]["evidence"])
                    self.assertFalse(result["success"])

    def test_root_against_propagation_fails(self):
        for cid, case in CASES.items():
            with self.subTest(cid):
                report = copy.deepcopy(case["exemplar"])
                report["root"]["verdict"] = next(v for v in sorted(grade.ROOT_VERDICTS)
                                                 if v != case["root"])
                result = score(case, report)
                self.assertFalse(result["checks"]["consistent"])
                self.assertFalse(result["success"])

    def test_inner_parent_against_children_fails(self):
        for cid, case in CASES.items():
            with self.subTest(cid):
                report = copy.deepcopy(case["exemplar"])
                parent = report["atoms"][0]
                parent["op"] = "all"
                report["atoms"].append({"id": "C1", "parent": parent["id"], "claim": "c",
                                        "verdict": other(parent["verdict"]), "evidence": ""})
                result = score(case, report)
                self.assertTrue(result["checks"]["shape"])
                self.assertFalse(result["checks"]["consistent"])
                self.assertFalse(result["success"])

    def test_inner_parent_that_follows_its_children_passes(self):
        for cid, case in CASES.items():
            with self.subTest(cid):
                report = copy.deepcopy(case["exemplar"])
                parent = report["atoms"][0]
                parent["op"] = "all"
                report["atoms"].append({"id": "C1", "parent": parent["id"], "claim": "c",
                                        "verdict": parent["verdict"], "evidence": ""})
                self.assertTrue(score(case, report)["success"])


class GraderRuleTests(unittest.TestCase):
    CASE = {"root": "refuted", "evidence_tokens": [["spoon"], ["3.01", "three oh one"]]}

    def report(self, atoms, verdict="refuted", op="all", claim="c"):
        return {"root": {"claim": claim, "verdict": verdict, "op": op}, "atoms": atoms}

    def atom(self, aid, verdict, parent="root", claim="spoon line", evidence="", op=None):
        atom = {"id": aid, "parent": parent, "claim": claim, "verdict": verdict,
                "evidence": evidence}
        return dict(atom, op=op) if op else atom

    def test_tokens_match_any_case_anywhere_in_the_report(self):
        atoms = [self.atom("A1", "refuted", claim="x", evidence="ran main.py\nSPOONS\n3.01")]
        self.assertTrue(score(self.CASE, self.report(atoms))["success"])
        atoms = [self.atom("A1", "refuted", claim="x", evidence="Three Oh One")]
        self.assertTrue(score(self.CASE, self.report(atoms, claim="the spoon"))["success"])

    def test_every_group_is_needed(self):
        atoms = [self.atom("A1", "refuted", evidence="no total given")]
        self.assertFalse(score(self.CASE, self.report(atoms))["checks"]["evidence"])

    def test_atom_verdict_text_is_not_graded(self):
        atoms = [self.atom("A1", "refuted", claim="spoon costs 3.01", evidence="confirmed")]
        self.assertTrue(score(self.CASE, self.report(atoms))["success"])

    def test_not_checked_children_are_ignored(self):
        atoms = [self.atom("A1", "refuted", evidence="spoon 3.01"),
                 self.atom("A2", "not_checked")]
        self.assertTrue(score(self.CASE, self.report(atoms, op="any"))["checks"]["consistent"])

    def test_no_counted_children_is_unsettled(self):
        atoms = [self.atom("A1", "unsettled", op="all"), self.atom("A2", "not_checked", "A1")]
        self.assertTrue(score(self.CASE, self.report(atoms, "unsettled"))["checks"]["consistent"])

    def test_nested_parent_must_follow_children(self):
        atoms = [self.atom("A1", "confirmed", op="any"), self.atom("A2", "refuted", "A1"),
                 self.atom("A3", "unsettled", "A1")]
        self.assertFalse(score(self.CASE, self.report(atoms, "confirmed"))["checks"]["consistent"])

    def test_shape_failures(self):
        good = [self.atom("A1", "refuted", evidence="spoon 3.01")]
        broken = {
            "missing parent": [self.atom("A1", "refuted", parent="A9")],
            "cycle": good + [self.atom("A2", "refuted", "A3", op="all"),
                             self.atom("A3", "refuted", "A2", op="all")],
            "parent without op": good + [self.atom("A2", "refuted"),
                                         self.atom("A3", "refuted", "A2")],
            "bad verdict": [self.atom("A1", "false")],
            "duplicate id": good + good,
        }
        for name, atoms in broken.items():
            with self.subTest(name):
                self.assertFalse(score(self.CASE, self.report(atoms))["checks"]["shape"])
        self.assertFalse(grade.grade(self.CASE, "not json", [])["checks"]["shape"])
        self.assertFalse(grade.grade(self.CASE, None, [])["success"])
        root_without_op = self.report(good)
        del root_without_op["root"]["op"]
        self.assertFalse(score(self.CASE, root_without_op)["checks"]["shape"])

    def test_refused_command_was_not_run(self):
        use = {"type": "tool_use", "id": "t1", "name": "Bash", "input": {"command": "python3 main.py"}}
        records = [{"type": "assistant", "message": {"content": [use]}},
                   {"type": "system", "subtype": "permission_denied", "tool_use_id": "t1"}]
        self.assertEqual(grade.bash_commands(records), [])
        self.assertEqual(grade.bash_commands(records[:1]), ["python3 main.py"])

    def test_must_run_is_a_loose_substring(self):
        case = dict(self.CASE, must_run=["python3"])
        self.assertTrue(grade.ran(case, ["cd x && PYTHON3 -c 'print(1)'"]))
        self.assertFalse(grade.ran(case, ["cat main.py"]))
        self.assertTrue(grade.ran(self.CASE, []))
        atoms = [self.atom("A1", "refuted", evidence="spoon 3.01")]
        self.assertFalse(score(case, self.report(atoms), ["cat main.py"])["success"])


def write_transcript(path, blocks, stop="end_turn"):
    records = [{"type": "system", "subtype": "init", "model": harness.MODEL,
                "tools": list(harness.TOOLS), "mcp_servers": []},
               {"type": "assistant", "message": {"content": blocks, "stop_reason": "tool_use"}},
               {"type": "result", "subtype": "success", "is_error": False, "stop_reason": stop,
                "total_cost_usd": 0.5, "usage": {"input_tokens": 10, "output_tokens": 5},
                "permission_denials": []}]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(r) for r in records) + "\n", encoding="utf-8")
    path.with_suffix(".exit").write_text("0", encoding="utf-8")


BASH = {"type": "tool_use", "name": "Bash", "input": {"command": "python3 main.py"}}


class HarnessTests(unittest.TestCase):
    def test_prompts(self):
        case = CASES["p-01"]
        task = harness.build(case)
        self.assertIn(f"Claim: {case['claim']}\n", task)
        self.assertNotIn("{claim}", task)
        self.assertEqual(harness.build(case, "S"),
                         "The following skill applies to this task. Follow it.\n\n<skill>\nS\n"
                         "</skill>\n\n" + task)

    def test_clean_transcript_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "t.jsonl"
            write_transcript(path, [BASH])
            self.assertEqual(harness.audit_transcript(path), [])

    def test_disallowed_tool_is_invalid(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "t.jsonl"
            write_transcript(path, [BASH, {"type": "tool_use", "name": "WebFetch", "input": {}}])
            self.assertEqual(harness.audit_transcript(path), ["tool WebFetch"])

    def test_error_stop_rate_limit_and_key_reads_are_invalid(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "t.jsonl"
            write_transcript(path, [{"type": "tool_use", "name": "Read",
                                     "input": {"file_path": "/x/fixtures/a/case.json"}}],
                             stop="max_tokens")
            with path.open("a", encoding="utf-8") as out:
                out.write(json.dumps({"type": "rate_limit_event",
                                      "rate_limit_info": {"status": "rejected"}}) + "\n")
            problems = harness.audit_transcript(path)
            self.assertIn("answer key path touched", problems)
            self.assertIn("rate limited", problems)
            self.assertIn("result success / max_tokens", problems)

    def test_missing_report_and_changed_prompt_are_invalid(self):
        case = CASES["p-01"]
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = pathlib.Path(tmp)
            write_transcript(run_dir / "transcripts/a/p-01.jsonl", [BASH])
            (run_dir / "prompts/a").mkdir(parents=True)
            (run_dir / "prompts/a/p-01.txt").write_text(harness.build(case) + " ",
                                                                  encoding="utf-8")
            self.assertEqual(harness.audit_call(run_dir, "a", case, None),
                             ["missing or empty report.json", "prompt differs from the builder"])

    def test_grade_run_writes_records(self):
        case = CASES["p-01"]
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = pathlib.Path(tmp)
            write_transcript(run_dir / "transcripts/a/p-01.jsonl", [BASH])
            (run_dir / "reports/a").mkdir(parents=True)
            (run_dir / "reports/a/p-01.json").write_text(json.dumps(case["exemplar"]),
                                                                   encoding="utf-8")
            harness.grade_run(run_dir, [("a", case)], {"invalid_calls": {}})
            record = json.loads((run_dir / "grades/a.jsonl").read_text(encoding="utf-8"))
            self.assertTrue(record["valid"] and record["success"])
            self.assertEqual(record["cost_usd"], 0.5)

    def test_arm_b_never_runs_on_dev(self):
        with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
            harness.main(["run", "--arms", "a", "b", "--splits", "dev", "--run-dir", "/nonexistent"])


def synthetic(n_test, a_pass, b_pass, gate_b=True):
    cases = [{"id": f"t{i:02d}", "split": "test", "kind": "k"} for i in range(n_test)]
    cases += [{"id": f"g{i}", "split": "gate", "kind": "unsettled"} for i in range(2)]

    def row(c, ok, arm):
        return {"id": c["id"], "valid": True, "problems": [], "success": ok, "atoms": 3,
                "checks": {k: ok for k in analyze.CHECKS},
                "cost_usd": 0.1, "usage": {"output_tokens": 7}, "permission_denials": 0}

    rows = {"a": [row(c, i < a_pass if c["split"] == "test" else True, "a")
                  for i, c in enumerate(cases)],
            "b": [row(c, i < b_pass if c["split"] == "test" else gate_b, "b")
                  for i, c in enumerate(cases)]}
    return rows, cases


class AnalyzeTests(unittest.TestCase):
    def verdict(self, *args, audit=True, **kwargs):
        rows, cases = synthetic(*args, **kwargs)
        report = analyze.decide(rows, {"valid": audit}, cases)
        return report["verdict"], report["step"], report.get("reason")

    def test_invalid_on_audit_or_missing_grade(self):
        self.assertEqual(self.verdict(24, 12, 12, audit=False)[:2], ("INVALID", 1))
        rows, cases = synthetic(24, 12, 12)
        rows["b"].pop()
        self.assertEqual(analyze.decide(rows, {"valid": True}, cases)["verdict"], "INVALID")
        rows, cases = synthetic(24, 12, 12)
        rows["a"][0]["valid"] = False
        self.assertEqual(analyze.decide(rows, {"valid": True}, cases)["verdict"], "INVALID")

    def test_gate_regression(self):
        self.assertEqual(self.verdict(24, 12, 24, gate_b=False), ("REGRESSION", 2, "critical gate"))

    def test_too_few_clusters(self):
        self.assertEqual(self.verdict(20, 10, 20)[:2], ("INCONCLUSIVE", 3))

    def test_interval_regression(self):
        self.assertEqual(self.verdict(24, 24, 5)[:2], ("REGRESSION", 4))

    def test_floor_effect(self):
        self.assertEqual(self.verdict(24, 4, 24), ("INCONCLUSIVE", 5, "floor effect"))
        self.assertEqual(self.verdict(24, 0, 0), ("INCONCLUSIVE", 5, "floor effect"))

    def test_improvement(self):
        self.assertEqual(self.verdict(24, 5, 24)[:2], ("IMPROVEMENT", 8))

    def test_no_meaningful_change(self):
        self.assertEqual(self.verdict(24, 15, 15)[:2], ("NO_MEANINGFUL_CHANGE", 9))

    def test_ceiling(self):
        self.assertEqual(self.verdict(24, 22, 24), ("INCONCLUSIVE", 10, "ceiling"))

    def test_quality_floor(self):
        self.assertEqual(self.verdict(24, 10, 10)[2],
                         "B below the quality floor or failed a gate fixture")

    def test_interval_crosses_margin(self):
        self.assertEqual(self.verdict(24, 10, 16), ("INCONCLUSIVE", 10, "interval crosses the margin"))

    def test_calibrate(self):
        cases = [{"id": f"d{i}", "split": "dev"} for i in range(10)]
        rows = [{"id": c["id"], "valid": True, "problems": [], "success": i < 4,
                 "checks": {k: True for k in analyze.CHECKS}} for i, c in enumerate(cases)]
        self.assertTrue(analyze.calibrate(rows, cases)["met"])
        rows[5]["success"] = rows[6]["success"] = rows[7]["success"] = True
        self.assertFalse(analyze.calibrate(rows, cases)["met"])
        self.assertFalse(analyze.calibrate(rows[:9], cases)["met"])


if __name__ == "__main__":
    unittest.main()
