import json
import pathlib
import sys
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parents[1] / "benchmarks/unslop/real-prose"
sys.path.insert(0, str(HERE))
import analyze  # noqa: E402
import build_pool  # noqa: E402
import grade_real  # noqa: E402
import harness  # noqa: E402

CASE = {"id": "x", "split": "test", "facts": ["gh pr merge"],
        "rules": [{"id": "R1", "rule": "never force-push", "patterns": [r"(never|do not).{0,20}force.?push"]}],
        "text": "Never force-push a shared branch. Merge it with `gh pr merge` once checks pass "
                "and the review is done and the branch is clean and nobody objects to it."}


def record(cid, split, ok, gate=None, kept=True):
    hits = {"original": {"p16": 0}, "current": {"p16": 0, "p13": 0}}
    return {"id": cid, "split": split, "gate": gate, "valid": True, "facts_kept": kept,
            "rules_kept": True, "success": {"original": ok, "current": ok},
            "hits_rewrite": hits, "hits_source": hits, "residual": {"original": 0, "current": 0}}


def arms_from(control, a, b, gate=(True, True, True)):
    arms = {}
    for name, passes, g in zip(("control", "a", "b"), (control, a, b), gate):
        arm = {f"t{i:02d}": record(f"t{i:02d}", "test", ok) for i, ok in enumerate(passes)}
        arm["g01"] = record("g01", "gate", g, gate="clean")
        arms[name] = arm
    return arms


class GradeTests(unittest.TestCase):
    def test_faithful_rewrite_passes_both_lists(self):
        rewrite = ("Never force-push a shared branch. Once checks pass, the review is done, "
                   "the branch is clean and nobody objects, merge it with `gh pr merge`.")
        r = grade_real.grade(CASE, rewrite)
        self.assertEqual(r["success"], {"original": True, "current": True})

    def test_dropped_rule_fails(self):
        rewrite = ("Merge the branch with `gh pr merge` once checks pass and the review is done "
                   "and the branch is clean and nobody objects to it at all.")
        r = grade_real.grade(CASE, rewrite)
        self.assertEqual(r["rules_missing"], ["R1"])
        self.assertFalse(r["success"]["original"])

    def test_current_only_pattern_counts_only_on_current_list(self):
        rewrite = CASE["text"] + " This load-bearing step is honestly key. It's a gate, not a hint."
        r = grade_real.grade(CASE, rewrite)
        self.assertEqual(r["residual"]["original"], 0)
        self.assertEqual(r["residual"]["current"], 3)

    def test_code_is_not_counted(self):
        text = "Run it:\n\n```\necho a — b\n```\n\nUse `x — y` here."
        self.assertEqual(grade_real.hits(text, [])["current"]["p16"], 0)

    def test_clean_gate_needs_ratio_above_085(self):
        case = dict(CASE, gate="clean")
        short = "Never force-push a shared branch. Merge with `gh pr merge` when checks pass."
        self.assertFalse(grade_real.grade(case, short)["success"]["original"])

    def test_missing_output_is_invalid(self):
        self.assertFalse(grade_real.grade(CASE, None)["valid"])


class PoolTests(unittest.TestCase):
    def test_sections_split_at_headings_and_keep_code_whole(self):
        lines = ["# A", "one two", "", "```", "# not a heading", "```", "## B", "three"]
        units = build_pool.units(lines, 0)
        self.assertEqual([u[2] for u in units], ["heading", "text", "code", "heading", "text"])
        self.assertEqual(len(list(build_pool.sections(units))), 2)

    def test_long_section_yields_runs_in_band(self):
        section = [(i, i + 1, "text", 50) for i in range(10)]
        runs = list(build_pool.runs(section, 120, 250))
        self.assertTrue(all(120 <= sum(u[3] for u in r) <= 250 for r in runs))
        self.assertEqual(len(runs), 3)

    def test_front_matter_is_skipped(self):
        self.assertEqual(build_pool.strip_front_matter(["---", "name: x", "---", "body"]), 3)


class AuditTests(unittest.TestCase):
    def transcript(self, folder, tool="Write", path=None, stop="end_turn", exit_code="0"):
        out = folder / "x.md"
        out.write_text("text", encoding="utf-8")
        lines = [{"type": "system", "subtype": "init", "model": harness.MODEL},
                 {"type": "assistant", "message": {"content": [
                     {"type": "tool_use", "name": tool, "input": {"file_path": path or str(out)}}]}},
                 {"type": "result", "subtype": "success", "is_error": False, "stop_reason": stop}]
        t = folder / "x.jsonl"
        t.write_text("\n".join(json.dumps(r) for r in lines), encoding="utf-8")
        t.with_suffix(".exit").write_text(exit_code, encoding="utf-8")
        return t, out

    def test_clean_call_passes(self):
        with tempfile.TemporaryDirectory() as d:
            t, out = self.transcript(pathlib.Path(d))
            self.assertEqual(harness.audit(t, out), [])

    def test_other_tool_extra_path_truncation_and_exit_fail(self):
        with tempfile.TemporaryDirectory() as d:
            folder = pathlib.Path(d)
            for kwargs in ({"tool": "Bash"}, {"path": "/elsewhere.md"}, {"stop": "max_tokens"},
                           {"exit_code": "1"}):
                t, out = self.transcript(folder, **kwargs)
                self.assertTrue(harness.audit(t, out), kwargs)


class DecideTests(unittest.TestCase):
    audit = {"valid": True}

    def test_invalid_audit(self):
        arms = arms_from([False] * 30, [True] * 15 + [False] * 15, [True] * 15 + [False] * 15)
        self.assertEqual(analyze.decide(arms, {"valid": False})["verdict"], "INVALID")

    def test_no_meaningful_change(self):
        arms = arms_from([False] * 30, [True] * 22 + [False] * 8, [True] * 22 + [False] * 8)
        report = analyze.decide(arms, self.audit)
        self.assertEqual(report["verdict"], "NO_MEANINGFUL_CHANGE")

    def test_b_below_quality_floor_is_inconclusive(self):
        arms = arms_from([False] * 30, [True] * 15 + [False] * 15, [True] * 15 + [False] * 15)
        report = analyze.decide(arms, self.audit)
        self.assertEqual((report["verdict"], report["step"]), ("INCONCLUSIVE", 10))

    def test_rule_fact_gate_blocks(self):
        arms = arms_from([False] * 30, [True] * 15 + [False] * 15, [True] * 15 + [False] * 15)
        arms["b"]["t03"]["facts_kept"] = False
        report = analyze.decide(arms, self.audit)
        self.assertEqual((report["verdict"], report["critical"]["rule_fact"]),
                         ("REGRESSION", ["t03"]))

    def test_gate_case_a_passed_b_failed_blocks(self):
        arms = arms_from([False] * 30, [True] * 15 + [False] * 15, [True] * 15 + [False] * 15,
                         gate=(True, True, False))
        self.assertEqual(analyze.decide(arms, self.audit)["verdict"], "REGRESSION")

    def test_skill_not_visible(self):
        arms = arms_from([True] * 12 + [False] * 18, [True] * 15 + [False] * 15,
                         [True] * 15 + [False] * 15)
        self.assertEqual(analyze.decide(arms, self.audit)["reason"], "skill not visible")

    def test_ceiling_on_last_suite_goes_on(self):
        arms = arms_from([False] * 30, [True] * 27 + [False] * 3, [True] * 27 + [False] * 3)
        report = analyze.decide(arms, self.audit)
        self.assertTrue(report["ceiling"])
        self.assertEqual(report["verdict"], "NO_MEANINGFUL_CHANGE")

    def test_ceiling_before_last_suite_climbs(self):
        arms = arms_from([False] * 30, [True] * 27 + [False] * 3, [True] * 27 + [False] * 3)
        report = analyze.decide(arms, self.audit, last_suite=False)
        self.assertEqual(report["next_step"], "run the next rung")

    def test_floor_on_last_suite(self):
        arms = arms_from([False] * 30, [True] * 5 + [False] * 25, [True] * 5 + [False] * 25)
        self.assertEqual(analyze.decide(arms, self.audit)["reason"], "floor effect")

    def test_regression_by_interval(self):
        arms = arms_from([False] * 30, [True] * 24 + [False] * 6, [False] * 30)
        report = analyze.decide(arms, self.audit)
        self.assertEqual((report["verdict"], report["step"]), ("REGRESSION", 4))

    def test_calibration_target(self):
        control = {f"d{i}": record(f"d{i}", "dev", i < 1) for i in range(8)}
        a = {f"d{i}": record(f"d{i}", "dev", i < 4) for i in range(8)}
        self.assertTrue(analyze.calibrate(control, a)["met"])
        a = {f"d{i}": record(f"d{i}", "dev", i < 7) for i in range(8)}
        self.assertFalse(analyze.calibrate(control, a)["met"])


if __name__ == "__main__":
    unittest.main()
