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

FALSE_CLAIMS = {
    "any-ways-01": "validate.check rejects the 10:00 to 9:30 booking",
    "any-ways-02": "The merge step removes the repeated customer 7",
    "any-ways-03": "check_weight refuses the 31 kg parcel",
    "any-ways-04": "The idle limit expires the session at time 2700",
    "any-ways-05": "The hold pickup route enforces the fine limit",
    "any-ways-06": "orders.place calls rules.positive on the quantity",
    "any-ways-07": "Passing 90s makes cli.py print 90",
    "any-ways-08": "The unique constraint rejects the second INV-2 insert",
    "compound-01": "Every item in the catalog is charged 25 cents a day when late",
    "compound-02": "Merging the two summaries gives the same figures as the joined file",
    "compound-03": "The parser accepts every old v1 message",
    "compound-05": "Staff members pay no late fee",
    "compound-06": "Old v1 settings files are no longer loaded",
    "compound-07": "The report lists the biggest total first",
    "compound-08": "A booking that starts exactly when another ends is rejected",
    "executable-01": "Three spoons are billed at 3.02",
    "executable-02": "The caller's list is never mutated by trail()",
    "executable-03": "latest(VERSIONS) returns 1.10.0",
    "executable-04": "normalise strips the trailing newline",
    "executable-05": "Each Basket gets its own list of lines",
    "executable-07": "Every line that keeps its trailing newline is rejected",
    "executable-08": "0.3 is counted in bucket 3",
    "lying-doc-01": "A book 30 days late is charged 5.00",
    "lying-doc-02": "slugify keeps the accented letters",
    "lying-doc-03": "retry waits 1, 2 and then 4 seconds",
    "lying-doc-04": "available() raises KeyError for an unknown SKU",
    "lying-doc-05": "The free shipping threshold checks the total after the coupon",
    "lying-doc-06": "nightly-sync uses the default of 3 retries",
    "lying-doc-07": "Putting a again makes it most recently used",
    "lying-doc-08": "The tax on the 10.50 line is 0.53",
    "unsettled-01": "The production RETENTION_DAYS is 30",
    "unsettled-02": "line_total rounds half up",
    "unsettled-03": "The export works on the ops host's python3",
    "unsettled-04": "At production volume the import finishes within 300 seconds",
    "unsettled-05": "In production the sender gives up after 3 failed attempts",
    "unsettled-06": "The nightly export will not trip the row limit on the full table",
    "unsettled-07": "The deployed MIN_PRICE_PERCENT is 70",
    "unsettled-08": "The deployed job window covers every event",
}


def score(case, report, commands=RUN):
    return grade.grade(case, json.dumps(report), commands)


def other(verdict):
    return "refuted" if verdict == "confirmed" else "confirmed"


def matches(entry, atom):
    text = f"{grade.flat(atom['claim'])} {grade.flat(atom.get('evidence'))}"
    return atom["verdict"] == entry["verdict"] and re.search(entry["pattern"], text, re.I)


class ExemplarTests(unittest.TestCase):
    def test_self_test_passes(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(grade.self_test(), 0)

    def test_every_exemplar_passes(self):
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

    def test_deciding_atom_with_wrong_verdict_fails(self):
        for cid, case in CASES.items():
            with self.subTest(cid):
                report = copy.deepcopy(case["exemplar"])
                entry = case["deciding"][0]
                for atom in report["atoms"]:
                    if matches(entry, atom):
                        atom["verdict"] = other(entry["verdict"])
                result = score(case, report)
                self.assertFalse(result["checks"]["deciding"])
                self.assertFalse(result["success"])

    def test_false_confirm_fails(self):
        self.assertEqual(set(FALSE_CLAIMS), {i for i, c in CASES.items() if c["false_confirms"]})
        for cid, claim in FALSE_CLAIMS.items():
            with self.subTest(cid):
                report = copy.deepcopy(CASES[cid]["exemplar"])
                report["atoms"].append({"id": "FC", "parent": "root", "claim": claim,
                                        "verdict": "confirmed", "evidence": "read the code"})
                result = score(CASES[cid], report)
                self.assertEqual(result["false_confirmed"], ["FC"])
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

    def test_correct_calibration_answers_pass(self):
        compound = CASES["compound-02"]
        self.assertEqual(grade.false_confirmed(compound, [{
            "id": "A3", "verdict": "confirmed",
            "claim": "Counts, class counters, buckets and slowest merge exactly"}]), [])
        self.assertTrue(grade.ran(compound, [
            "cd /tmp/x; python3 -c \"\nfrom summary import Summary\na=Summary()\na.merge(b)\""]))
        unsettled = copy.deepcopy(CASES["unsettled-01"]["exemplar"])
        unsettled["atoms"] = [a for a in unsettled["atoms"] if a["id"] != "A2"]
        self.assertTrue(score(CASES["unsettled-01"], unsettled)["success"])
        booking = copy.deepcopy(CASES["any-ways-01"]["exemplar"])
        booking["atoms"][0].update(verdict="confirmed", claim="validate.check does not catch it: "
                                   "string comparison '9:30' < '10:00' is False, so check passes")
        self.assertTrue(score(CASES["any-ways-01"], booking)["success"])
        self.assertEqual(grade.false_confirmed(CASES["any-ways-01"], [{
            "id": "A3", "verdict": "confirmed",
            "claim": "check() passes the 10:00/9:30 booking (string comparison '9:30' < '10:00' "
                     "is False), but save() rejects it"}]), [])
        trail = copy.deepcopy(CASES["executable-02"]["exemplar"])
        trail["atoms"][1]["claim"] = "Running two consecutive no-arg calls gives identical output"
        self.assertTrue(score(CASES["executable-02"], trail)["success"])

    def test_running_main_by_import_or_multiline_code_counts(self):
        for cid, case in CASES.items():
            if case["must_run"]:
                with self.subTest(cid):
                    self.assertTrue(grade.ran(case, ["python3 -I -c \"\nimport sys\nimport main\""]))
        self.assertTrue(grade.ran(CASES["executable-01"], ["python3 -I -c \"\nprint(1.005*3)\""]))
        self.assertTrue(grade.ran(CASES["executable-04"], ["python3 -c \"\nimport re\nre.fullmatch\""]))

    def test_program_not_run_fails(self):
        for cid, case in CASES.items():
            if case["must_run"]:
                with self.subTest(cid):
                    result = score(case, case["exemplar"], ["cat main.py"])
                    self.assertFalse(result["checks"]["ran"])


class GraderRuleTests(unittest.TestCase):
    CASE = {"root": "refuted", "deciding": [{"verdict": "refuted", "pattern": "spoon.*3\\.01"}],
            "false_confirms": ["spoon.*3\\.02"], "must_run": []}

    def report(self, atoms, verdict="refuted", op="all"):
        return {"root": {"claim": "c", "verdict": verdict, "op": op}, "atoms": atoms}

    def atom(self, aid, verdict, parent="root", claim="spoon line", evidence="", op=None):
        atom = {"id": aid, "parent": parent, "claim": claim, "verdict": verdict,
                "evidence": evidence}
        return dict(atom, op=op) if op else atom

    def test_evidence_across_lines_counts(self):
        atoms = [self.atom("A1", "refuted", evidence="ran main.py\nspoons\n3.01")]
        self.assertTrue(score(self.CASE, self.report(atoms))["success"])

    def test_false_confirm_reads_claim_only(self):
        atoms = [self.atom("A1", "refuted", evidence="spoon 3.01"),
                 self.atom("A2", "confirmed", evidence="README says spoon 3.02")]
        self.assertTrue(score(self.CASE, self.report(atoms))["checks"]["no_false_confirm"])

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

    def test_deciding_entry_accepts_its_alternatives(self):
        case = dict(self.CASE, deciding=[{"verdict": "refuted", "pattern": "check rejects",
                                          "or": [{"verdict": "confirmed",
                                                  "pattern": "check does not reject"}]}])
        for verdict, claim, expected in [("refuted", "check rejects it", True),
                                         ("confirmed", "check does not reject it", True),
                                         ("confirmed", "check rejects it", False),
                                         ("unsettled", "check does not reject it", False)]:
            with self.subTest(claim=claim, verdict=verdict):
                self.assertEqual(grade.deciding_ok(case, [self.atom("A1", verdict, claim=claim)]),
                                 expected)

    def test_must_run_reads_every_line_of_a_command(self):
        case = dict(self.CASE, must_run=["python3? *-$"])
        self.assertTrue(grade.ran(case, ["python3 -\nprint(1)"]))
        self.assertFalse(grade.ran(case, ["python3 -c 'print(1)'"]))


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
        case = CASES["executable-06"]
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
        case = CASES["executable-06"]
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = pathlib.Path(tmp)
            write_transcript(run_dir / "transcripts/a/executable-06.jsonl", [BASH])
            (run_dir / "prompts/a").mkdir(parents=True)
            (run_dir / "prompts/a/executable-06.txt").write_text(harness.build(case) + " ",
                                                                  encoding="utf-8")
            self.assertEqual(harness.audit_call(run_dir, "a", case, None),
                             ["missing or empty report.json", "prompt differs from the builder"])

    def test_grade_run_writes_records(self):
        case = CASES["executable-06"]
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = pathlib.Path(tmp)
            write_transcript(run_dir / "transcripts/a/executable-06.jsonl", [BASH])
            (run_dir / "reports/a").mkdir(parents=True)
            (run_dir / "reports/a/executable-06.json").write_text(json.dumps(case["exemplar"]),
                                                                   encoding="utf-8")
            harness.grade_run(run_dir, [("a", case)], {"invalid_calls": {}})
            record = json.loads((run_dir / "grades/a.jsonl").read_text(encoding="utf-8"))
            self.assertTrue(record["valid"] and record["success"])
            self.assertEqual(record["cost_usd"], 0.5)

    def test_arm_b_never_runs_on_dev(self):
        with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
            harness.main(["run", "--arms", "a", "b", "--splits", "dev", "--run-dir", "/nonexistent"])


def synthetic(n_test, a_pass, b_pass, gate_b=True, false_b=False):
    cases = [{"id": f"t{i:02d}", "split": "test", "kind": "k"} for i in range(n_test)]
    cases += [{"id": f"g{i}", "split": "gate", "kind": "unsettled"} for i in range(2)]

    def row(c, ok, arm):
        fc = not (arm == "b" and false_b and c["id"] == "t00")
        return {"id": c["id"], "valid": True, "problems": [], "success": ok and fc, "atoms": 3,
                "checks": {k: ok for k in analyze.CHECKS} | {"no_false_confirm": fc},
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

    def test_false_confirm_regression(self):
        self.assertEqual(self.verdict(24, 12, 24, false_b=True), ("REGRESSION", 2, "critical gate"))

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
