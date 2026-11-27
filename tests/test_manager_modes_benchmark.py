import importlib.util
import json
import unittest
from pathlib import Path

BENCH = Path(__file__).resolve().parent.parent / "benchmarks" / "manager-modes"


def load(name):
    spec = importlib.util.spec_from_file_location(name, BENCH / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


score, prepare = load("score"), load("prepare")

DECISION = {"margin": 0.10, "alpha": 0.05, "min_clusters": 20, "quality_floor": 0.60, "ceiling_rate": 0.90,
            "last_allowed_suite": True, "earlier_suite_effects": [], "sampling": "representative",
            "holdout_frozen": True, "grader_validated": True}


def decide(**over):
    base = dict(n=20, wins=0, losses=0, a_rate=0.5, b_rate=0.5, decision=DECISION, critical_regression=False,
                b_fails_critical=False, control_effect=0.5)
    base.update(over)
    return score.decide(**base)[:2]


def case(case_id, split="test", critical=False):
    return {"id": case_id, "cluster": case_id, "split": split, "critical": critical,
            "criteria": [{"id": "c1", "pass_when": True}, {"id": "c2", "pass_when": False}]}


CONFIG = {"arms": {"main": "x", "new": "y", "control": "x"}, "control": "control", "trials": 2,
          "comparisons": [["main", "new"]], "decision": DECISION}


def cells(cases, passing):
    """passing: arm -> set of case ids that pass every trial."""
    out = {}
    for c in cases:
        for arm in CONFIG["arms"]:
            for trial in range(2):
                ok = c["id"] in passing[arm]
                out[(c["id"], arm, trial)] = {"c1": ok, "c2": False}
    return out


class Decide(unittest.TestCase):
    def test_many_wins_and_no_loss_is_improvement(self):
        self.assertEqual(decide(wins=13, a_rate=0.3, b_rate=0.95)[0], "IMPROVEMENT")

    def test_a_few_wins_are_not_decisive(self):
        self.assertEqual(decide(wins=6, a_rate=0.5, b_rate=0.8), ("INCONCLUSIVE", "interval not decisive"))

    def test_many_losses_are_a_regression(self):
        self.assertEqual(decide(losses=13, a_rate=0.9 - 0.05, b_rate=0.2)[0], "REGRESSION")

    def test_a_critical_case_lost_is_a_regression_whatever_the_interval(self):
        self.assertEqual(decide(wins=13, critical_regression=True)[0], "REGRESSION")

    def test_an_unvalidated_grader_cannot_call_a_regression(self):
        loose = dict(DECISION, grader_validated=False)
        self.assertEqual(decide(losses=13, critical_regression=True, decision=loose)[0], "INCONCLUSIVE")

    def test_too_few_clusters_is_inconclusive(self):
        self.assertEqual(decide(n=12, wins=12, a_rate=0.0 + 0.2)[0], "INCONCLUSIVE")

    def test_a_floor_effect_on_the_last_suite_is_inconclusive(self):
        self.assertEqual(decide(wins=13, a_rate=0.10), ("INCONCLUSIVE", "floor effect"))

    def test_a_ceiling_before_the_last_suite_asks_for_the_next_rung(self):
        ladder = dict(DECISION, last_allowed_suite=False)
        self.assertEqual(decide(a_rate=0.95, decision=ladder), ("INCONCLUSIVE", "run the next rung"))

    def test_a_skill_the_control_matches_is_not_visible(self):
        self.assertEqual(decide(wins=13, a_rate=0.3, control_effect=0.10), ("INCONCLUSIVE", "skill not visible"))

    def test_improvement_needs_the_quality_floor_and_every_critical_case(self):
        self.assertEqual(decide(wins=13, a_rate=0.3, b_rate=0.55)[0], "INCONCLUSIVE")
        self.assertEqual(decide(wins=13, a_rate=0.3, b_rate=0.95, b_fails_critical=True)[0], "INCONCLUSIVE")

    def test_a_ceiling_rate_within_twice_the_margin_is_invalid(self):
        self.assertEqual(decide(decision=dict(DECISION, ceiling_rate=0.2))[0], "INVALID")


class Analyze(unittest.TestCase):
    def setUp(self):
        self.cases = [case(f"t{i:02d}") for i in range(20)] + [case("g01", "gate", True)]
        self.ids = {c["id"] for c in self.cases}

    def test_counts_clusters_only_one_arm_passed(self):
        passing = {"main": {f"t{i:02d}" for i in range(6)} | {"g01"}, "new": self.ids, "control": set()}
        report = score.analyze(CONFIG, self.cases, cells(self.cases, passing))
        comparison = report["comparisons"][0]
        self.assertEqual((comparison["wins"], comparison["losses"], comparison["n"]), (14, 0, 20))
        self.assertEqual(comparison["verdict"], "IMPROVEMENT")
        self.assertEqual(report["reliable_success"], {"main": 0.3, "new": 1.0, "control": 0.0})

    def test_gate_cases_do_not_count_in_the_estimate(self):
        passing = {"main": {"g01"}, "new": {"g01"}, "control": set()}
        self.assertEqual(score.analyze(CONFIG, self.cases, cells(self.cases, passing))["test_clusters"], 20)

    def test_one_failed_trial_fails_the_cluster(self):
        parsed = cells(self.cases, {"main": self.ids, "new": self.ids, "control": set()})
        parsed[("t00", "new", 1)] = {"c1": False, "c2": False}
        self.assertEqual(score.analyze(CONFIG, self.cases, parsed)["reliable_success"]["new"], 0.95)

    def test_a_criterion_passes_on_its_keyed_answer_not_on_yes(self):
        parsed = cells(self.cases, {"main": self.ids, "new": self.ids, "control": set()})
        parsed[("t00", "new", 0)] = {"c1": True, "c2": True}
        self.assertEqual(score.analyze(CONFIG, self.cases, parsed)["per_case"]["t00"]["new"], 1)

    def test_a_missing_cell_makes_the_run_invalid(self):
        parsed = cells(self.cases, {"main": self.ids, "new": self.ids, "control": set()})
        parsed[("t03", "new", 1)] = None
        report = score.analyze(CONFIG, self.cases, parsed)
        self.assertEqual(report["verdict"], "INVALID")
        self.assertIn("t03 new trial 1: no result", report["invalid"])

    def test_an_ungraded_criterion_makes_the_run_invalid(self):
        parsed = cells(self.cases, {"main": self.ids, "new": self.ids, "control": set()})
        parsed[("t03", "new", 1)] = {"c1": True}
        self.assertEqual(score.analyze(CONFIG, self.cases, parsed)["verdict"], "INVALID")

    def test_contamination_makes_the_run_invalid(self):
        parsed = cells(self.cases, {"main": self.ids, "new": self.ids, "control": set()})
        self.assertEqual(score.analyze(CONFIG, self.cases, parsed, ["s|t01|v1|0: used ['Bash']"])["verdict"], "INVALID")

    def test_the_tables_show_each_arm_rule_and_comparison(self):
        for c in self.cases:
            c["rule"] = "P" if c["split"] == "gate" else ("R1" if c["id"] < "t06" else "P")
        passing = {"main": {f"t{i:02d}" for i in range(6, 20)} | {"g01"}, "new": self.ids, "control": set()}
        table = score.render(score.analyze(CONFIG, self.cases, cells(self.cases, passing)), self.cases, CONFIG)
        self.assertIn("| Arm | Reliable success (20 test clusters) | P (14) | R1 (6) | Gates passed (1) |", table)
        self.assertIn("| main | 0.70 | 14 | 0 | 1 |", table)
        self.assertIn("| new | 1.00 | 14 | 6 | 1 |", table)
        self.assertIn("| main to new | 6 | 0 | +0.30 |", table)
        self.assertIn("| t00 | R1 | 0/2 | 2/2 | 0/2 |", table)

    def test_a_criterion_answered_twice_makes_the_run_invalid(self):
        parsed = cells(self.cases, {"main": self.ids, "new": self.ids, "control": set()})
        parsed.update(score.parse_cells(["t03|new|1|c1=1,c2=0,c1=0"]))
        report = score.analyze(CONFIG, self.cases, parsed)
        self.assertEqual(report["verdict"], "INVALID")
        self.assertIn("t03 new trial 1", report["invalid"][0])

    def test_the_report_names_a_ceiling_whatever_step_decides(self):
        passing = {"main": self.ids - {"t00"}, "new": self.ids, "control": set()}
        comparison = score.analyze(CONFIG, self.cases, cells(self.cases, passing))["comparisons"][0]
        self.assertIs(comparison["a_at_ceiling"], True)
        passing["main"] = {"g01"}
        self.assertIs(score.analyze(CONFIG, self.cases, cells(self.cases, passing))["comparisons"][0]["a_at_ceiling"], False)

    def test_parse_cells_reads_answers_and_missing(self):
        parsed = score.parse_cells(["t01|v1|0|c1=1,c2=0", "t01|v2|0|MISSING_GRADE"])
        self.assertEqual(parsed, {("t01", "v1", 0): {"c1": True, "c2": False}, ("t01", "v2", 0): None})


class Contamination(unittest.TestCase):
    ALLOWED = ("/s/arms/v1", "/s/subject/cases/t01.md")

    def fault(self, name, **tool_input):
        return score.tool_fault(name, tool_input, self.ALLOWED)

    def test_an_agent_may_read_its_own_files(self):
        self.assertIsNone(self.fault("Read", file_path="/s/arms/v1/manager/SKILL.md"))
        self.assertIsNone(self.fault("Read", file_path="/s/arms/v1/manager"))
        self.assertIsNone(self.fault("Read", file_path="/s/subject/cases/t01.md"))
        self.assertIsNone(self.fault("StructuredOutput"))

    def test_reading_anything_else_is_a_fault_however_the_path_is_spelt(self):
        self.assertEqual(self.fault("Read", file_path="/s/arms/v10/manager/SKILL.md"), "read /s/arms/v10/manager/SKILL.md")
        self.assertEqual(self.fault("Read", file_path="/s/grader/t01.json"), "read /s/grader/t01.json")
        self.assertEqual(self.fault("Read", file_path="/s/arms/v1/../v2/manager/SKILL.md"), "read /s/arms/v2/manager/SKILL.md")
        self.assertEqual(self.fault("Read", file_path="/s/arms/v1/../../private/arms.json"), "read /s/private/arms.json")

    def test_any_other_tool_is_a_fault(self):
        self.assertEqual(self.fault("Bash", command="ls /s/arms/v1"), "used Bash")
        self.assertEqual(self.fault("Bash", command="find /s/arms/v1 -delete"), "used Bash")
        self.assertEqual(self.fault("Glob", path="/s/arms/v1", pattern="**/*.md"), "used Glob")
        self.assertEqual(self.fault("Edit", file_path="/s/arms/v1/manager/SKILL.md"), "used Edit")
        self.assertEqual(self.fault("Skill", skill="manager"), "used Skill")

    def test_the_journal_names_subjects_and_graders_outside_their_fence(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            run = Path(tmp)
            journal = run / "journal.jsonl"
            lines = [{"type": "started", "agentId": "a", "label": "s|t01|v1|0"},
                     {"type": "started", "agentId": "b", "label": "s|t01|v2|0"},
                     {"type": "started", "agentId": "g", "label": "g|t01|0"},
                     {"type": "started", "agentId": "h", "label": "g|t02|0"},
                     {"type": "started", "agentId": "m", "label": "s|t01|v3|0"}]
            journal.write_text("\n".join(json.dumps(x) for x in lines), encoding="utf-8")
            use = lambda name, **tool_input: json.dumps({"message": {"content": [
                {"type": "tool_use", "name": name, "input": tool_input}]}})
            (run / "agent-a.jsonl").write_text(
                use("Read", file_path="/s/arms/v1/manager/SKILL.md") + "\n" + use("Read", file_path="/s/grader/t01.json"),
                encoding="utf-8")
            (run / "agent-b.jsonl").write_text(use("Read", file_path="/s/arms/v2/manager/SKILL.md"), encoding="utf-8")
            (run / "agent-g.jsonl").write_text(use("Read", file_path="/s/grader/t01.json"), encoding="utf-8")
            (run / "agent-h.jsonl").write_text(
                use("Read", file_path="/s/grader/t02.json") + "\n" + use("Read", file_path="/repo/cases/test/t02.json"),
                encoding="utf-8")
            found = score.contamination(journal, "/s")
        self.assertEqual(found, ["s|t01|v1|0: read /s/grader/t01.json", "g|t02|0: read /repo/cases/test/t02.json",
                                 "s|t01|v3|0: no transcript"])


class Prepare(unittest.TestCase):
    def test_labels_are_blind_and_stable(self):
        names = ["main", "pr1", "control"]
        labels = prepare.blind_labels(names, 7)
        self.assertEqual(labels, prepare.blind_labels(names, 7))
        self.assertEqual(sorted(labels.values()), ["v1", "v2", "v3"])

    def test_the_control_keeps_only_the_frontmatter(self):
        self.assertEqual(prepare.frontmatter_only("---\nname: x\n---\n\n# Body\nrule\n"), "---\nname: x\n---\n")

    def test_the_grader_view_never_holds_the_answer_key(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            prepare.write_views(Path(tmp), [{"id": "t01", "situation": "S",
                                             "criteria": [{"id": "c1", "question": "Q?", "pass_when": False}]}])
            self.assertNotIn("pass_when", (Path(tmp) / "grader" / "t01.json").read_text())
            self.assertEqual((Path(tmp) / "subject" / "cases" / "t01.md").read_text(), "S\n")


if __name__ == "__main__":
    unittest.main()
