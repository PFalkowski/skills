import importlib.util
import hashlib
import json
import pathlib
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "compare_prompts_score", ROOT / "compare-prompts" / "scripts" / "score.py"
)
score = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(score)


def records_for(clusters, repeats=2, *, quality_floor=0.0, min_clusters=1,
                frozen=True, validated=True, sampling="representative"):
    cases = []
    records = [{"type": "manifest", "config": {
        "version": 1, "repeats": repeats, "model": "mock:latest",
        "options": {"temperature": 0, "seed": 0, "num_ctx": 4096,
                    "num_predict": 128}, "decision": {
            "margin": 0.05, "alpha": 0.05, "min_clusters": min_clusters,
            "quality_floor": quality_floor, "sampling": sampling,
            "holdout_frozen": frozen, "grader_validated": validated,
        }}}
    ]
    for index, (cluster, a_pass, b_pass) in enumerate(clusters):
        case_id = "case-" + cluster + "-" + str(index)
        grader = {"type": "exact", "expected": "good"}
        cases.append({"id": case_id, "cluster": cluster, "split": "test",
                      "critical": False, "input": "input " + case_id, "grader": grader})
        for trial in range(repeats):
            for arm, passed in (("a", a_pass), ("b", b_pass)):
                output = "good" if passed else "bad"
                request = {"model": "mock:latest", "system": f"prompt {arm}",
                           "prompt": "input " + case_id, "stream": False,
                           "options": records[0]["config"]["options"], "keep_alive": 0}
                request_hash = hashlib.sha256(json.dumps(
                    request, ensure_ascii=False, sort_keys=True,
                    separators=(",", ":")).encode("utf-8")).hexdigest()
                records.append({"type": "request", "case_id": case_id,
                                "arm": arm, "trial": trial,
                                "request_hash": request_hash, "request": request})
                records.append({"type": "result", "case_id": case_id,
                                "arm": arm, "trial": trial,
                                "cluster": cluster, "split": "test",
                                "passed": passed, "valid": True,
                                "request_hash": request_hash,
                                "output": output,
                                "response": {"response": output, "done": True,
                                             "done_reason": "stop", "eval_count": 8,
                                             "prompt_eval_count": 12, "total_duration": 100}})
    records[0]["config"]["cases"] = cases
    snapshots = {arm: [{"text": "prompt " + arm,
                        "sha256": hashlib.sha256(("prompt " + arm).encode()).hexdigest()}]
                 for arm in ("a", "b")}
    grader_hashes = {case["id"]: hashlib.sha256(json.dumps(
        case["grader"], ensure_ascii=False, sort_keys=True,
        separators=(",", ":")).encode()).hexdigest() for case in cases}
    records[0] = {"type": "manifest", "config": records[0]["config"],
                  "identity": {"engine": "ollama", "version": "0.1.0",
                               "model": "mock:latest", "digest": "sha256:mock",
                               "template_hash": "a" * 64, "system_hash": "b" * 64,
                               "parameters_hash": "c" * 64, "model_info_hash": "d" * 64,
                               "modelfile_hash": "e" * 64},
                  "runner_hash": "f" * 64, "scorer_hash": "0" * 64,
                  "hardware": {"platform": "test"},
                  "source_snapshots": snapshots, "grader_hashes": grader_hashes}
    records.append({"type": "complete", "results": len(cases) * 2 * repeats})
    return records


class PairedIntervalTests(unittest.TestCase):
    def test_zero_discordance_has_nonzero_width(self):
        low, high = score.paired_interval(0, 0, 40, 0.05)
        self.assertLess(low, 0)
        self.assertGreater(high, 0)
        self.assertGreater(high - low, 0)

    def test_all_wins_interval_matches_exact_binomial_boundary(self):
        low, high = score.paired_interval(10, 0, 10, 0.05)
        self.assertAlmostEqual(low, 0.2903900, places=6)
        self.assertAlmostEqual(high, 1.0, places=12)

    def test_alpha_must_be_strictly_below_one(self):
        with self.assertRaises(ValueError):
            score.paired_interval(0, 0, 10, 1)


class AnalyzeTests(unittest.TestCase):
    def test_equivalence_requires_enough_independent_evidence(self):
        enough = records_for([(f"c{i}", True, True) for i in range(100)])
        self.assertEqual(score.analyze(enough)["verdict"], "NO_MEANINGFUL_CHANGE")
        small = records_for([(f"c{i}", True, True) for i in range(10)])
        self.assertEqual(score.analyze(small)["verdict"], "INCONCLUSIVE")

    def test_population_regression_without_critical_flags(self):
        data = records_for([(f"c{i}", True, False) for i in range(100)])
        self.assertEqual(score.analyze(data)["verdict"], "REGRESSION")

    def test_unvalidated_critical_grader_cannot_decide(self):
        data = records_for([("x", True, False)], validated=False)
        data[0]["config"]["cases"][0]["critical"] = True
        self.assertEqual(score.analyze(data)["verdict"], "INCONCLUSIVE")

    def test_shared_critical_failure_blocks_promotion(self):
        data = records_for([(f"c{i}", True, True) for i in range(100)] + [("gate", False, False)])
        case = data[0]["config"]["cases"][-1]
        case["split"], case["critical"] = "gate", True
        for row in data:
            if row.get("type") == "result" and row["case_id"] == case["id"]:
                row["split"] = "gate"
        report = score.analyze(data)
        self.assertEqual(report["verdict"], "INCONCLUSIVE")
        self.assertEqual(report["candidate_critical_failures"], [case["id"]])

    def test_json_boolean_is_not_numeric_one(self):
        case = {"grader": {"type": "json_equal", "expected": {"value": 1}}}
        self.assertFalse(score._builtin_grade(case, '{"value":true}'))

    def test_missing_pins_and_corrupt_sources_are_invalid(self):
        data = records_for([("x", True, True)])
        del data[0]["identity"]
        self.assertEqual(score.analyze(data)["verdict"], "INVALID")
        data = records_for([("x", True, True)])
        data[0]["source_snapshots"]["a"][0]["text"] += "different"
        self.assertEqual(score.analyze(data)["verdict"], "INVALID")

    def test_rehashed_wrong_prompt_is_rejected(self):
        data = records_for([("x", True, True)])
        req = next(r for r in data if r["type"] == "request")
        res = next(r for r in data if r["type"] == "result")
        req["request"]["system"] = "Different instructions"
        req["request_hash"] = score._request_hash(req["request"])
        res["request_hash"] = req["request_hash"]
        self.assertEqual(score.analyze(data)["verdict"], "INVALID")

    def test_recorded_grade_must_agree_with_raw_output(self):
        data = records_for([("x", True, True)])
        next(r for r in data if r["type"] == "result")["passed"] = False
        self.assertEqual(score.analyze(data)["verdict"], "INVALID")

    def test_invalid_incomplete_or_duplicate_cells_never_score(self):
        data = records_for([("x", True, True)])
        self.assertEqual(score.analyze(data)["verdict"], "INCONCLUSIVE")
        data.pop()
        self.assertEqual(score.analyze(data)["verdict"], "INVALID")
        data = records_for([("x", True, True)])
        request = next(r for r in data if r["type"] == "request")
        data.insert(-1, dict(request))
        self.assertEqual(score.analyze(data)["verdict"], "INVALID")

    def test_deeply_nested_json_output_fails_the_grade_without_crashing(self):
        case = {"grader": {"type": "json_equal", "expected": {"x": 1}}}
        self.assertFalse(score._builtin_grade(case, "[" * 100000))

    def test_undecodable_input_file_is_invalid_exit_code(self):
        with tempfile.TemporaryDirectory() as temp:
            source = pathlib.Path(temp) / "bad.jsonl"
            source.write_bytes(bytes([0xFF, 0xFE]))
            report = pathlib.Path(temp) / "report.json"
            self.assertEqual(score.main([str(source), str(report)]), 3)
            self.assertEqual(json.loads(report.read_text(encoding="utf-8"))["verdict"], "INVALID")

    def test_invalid_result_is_invalid(self):
        data = records_for([("x", True, True)])
        next(r for r in data if r["type"] == "result")["valid"] = False
        self.assertEqual(score.analyze(data)["verdict"], "INVALID")

    def test_repeated_trials_do_not_inflate_cluster_n(self):
        data = records_for([("x", False, True)], repeats=8)
        report = score.analyze(data)
        self.assertEqual(report["metrics"]["test"]["clusters"], 1)
        self.assertEqual(report["metrics"]["test"]["wins"], 1)

    def test_critical_failure_precedes_mean(self):
        data = records_for([("x", True, False)])
        data[0]["config"]["cases"][0]["critical"] = True
        report = score.analyze(data)
        self.assertEqual(report["verdict"], "REGRESSION")
        self.assertEqual(report["introduced_critical_failures"], ["case-x-0"])

    def test_quality_floor_blocks_nonregression_claims(self):
        data = records_for([("a", False, True), ("b", False, True)],
                           quality_floor=0.9)
        self.assertEqual(score.analyze(data)["verdict"], "INCONCLUSIVE")

    def test_only_representative_frozen_validated_sample_can_claim(self):
        data = records_for([(f"a{i}", False, True) for i in range(40)], min_clusters=30)
        report = score.analyze(data)
        self.assertEqual(report["verdict"], "IMPROVEMENT")
        for key, value in (("frozen", False), ("validated", False),
                           ("sampling", "curated")):
            altered = records_for([(f"a{i}", False, True) for i in range(40)], min_clusters=30,
                                  frozen=False if key == "frozen" else True,
                                  validated=False if key == "validated" else True,
                                  sampling="curated" if key == "sampling" else "representative")
            self.assertEqual(score.analyze(altered)["verdict"], "INCONCLUSIVE")

    def test_identical_bad_results_are_not_an_improvement(self):
        data = records_for([(f"a{i}", False, False) for i in range(40)], min_clusters=30)
        self.assertEqual(score.analyze(data)["verdict"], "INCONCLUSIVE")

    def test_output_diagnostics_are_always_reported(self):
        data = records_for([("x", True, True)])
        report = score.analyze(data)
        self.assertEqual(report["diagnostics"]["same_outputs"], 2)
        self.assertEqual(report["diagnostics"]["different_outputs"], 0)
        self.assertEqual(report["diagnostics"]["score_changes"], 0)

    def test_boolean_is_not_accepted_as_numeric_config(self):
        data = records_for([("x", True, True)])
        data[0]["config"]["decision"]["margin"] = True
        self.assertEqual(score.analyze(data)["verdict"], "INVALID")

    def test_request_must_precede_result_and_hash_must_match(self):
        data = records_for([("x", True, True)])
        request_index = next(i for i, r in enumerate(data) if r["type"] == "request")
        result_index = next(i for i, r in enumerate(data) if r["type"] == "result")
        data[request_index], data[result_index] = data[result_index], data[request_index]
        self.assertEqual(score.analyze(data)["verdict"], "INVALID")
        data = records_for([("x", True, True)])
        next(r for r in data if r["type"] == "result")["request_hash"] = "0" * 64
        self.assertEqual(score.analyze(data)["verdict"], "INVALID")

    def test_trial_float_and_cluster_split_leak_are_invalid(self):
        data = records_for([("x", True, True)])
        next(r for r in data if r["type"] == "result")["trial"] = 0.0
        self.assertEqual(score.analyze(data)["verdict"], "INVALID")
        data = records_for([("x", True, True)])
        data[0]["config"]["cases"].append({"id": "dev-case", "cluster": "x",
                                            "split": "dev", "critical": False})
        with self.assertRaises(ValueError):
            score.validate_config(data[0]["config"])
        self.assertEqual(score.analyze(data)["verdict"], "INVALID")

    def test_footer_result_count_and_new_diagnostics(self):
        data = records_for([("x", False, False)])
        data[-1]["results"] = 3
        self.assertEqual(score.analyze(data)["verdict"], "INVALID")
        data = records_for([("x", False, False)])
        for result in (r for r in data if r["type"] == "result"):
            result["output"] = "same"
            result["response"]["response"] = "same"
        report = score.analyze(data)
        self.assertEqual(report["test_point_delta"], 0)
        self.assertEqual(report["diagnostics"]["shared_failure_case_ids"], ["case-x-0"])
        self.assertEqual(report["diagnostics"]["repeated_output_stability"]["stable_cases"],
                         {"a": 1, "b": 1})

    def test_gate_cases_are_descriptive_and_cannot_inflate_test_n(self):
        data = records_for([(f"c{i}", True, True) for i in range(30)], min_clusters=30)
        grader = {"type": "exact", "expected": "good"}
        case = {"id": "rare-critical", "cluster": "rare", "split": "gate",
                "critical": True, "input": "gate input", "grader": grader}
        data[0]["config"]["cases"].append(case)
        events = []
        for trial in range(2):
            for arm in ("a", "b"):
                request = {"model": "mock:latest", "system": f"prompt {arm}",
                           "prompt": "gate input", "stream": False,
                           "options": data[0]["config"]["options"], "keep_alive": 0}
                request_hash = hashlib.sha256(json.dumps(
                    request, ensure_ascii=False, sort_keys=True,
                    separators=(",", ":")).encode("utf-8")).hexdigest()
                events.append({"type": "request", "case_id": case["id"], "arm": arm,
                               "trial": trial, "request_hash": request_hash,
                               "request": request})
                output = "good" if arm == "a" else "bad"
                events.append({"type": "result", "case_id": case["id"], "arm": arm,
                               "trial": trial, "request_hash": request_hash,
                               "cluster": case["cluster"], "split": case["split"],
                               "passed": arm == "a", "valid": True, "output": output,
                               "response": {"response": output, "done": True,
                                            "done_reason": "stop", "eval_count": 8,
                                            "prompt_eval_count": 12}})
        data[0]["grader_hashes"][case["id"]] = hashlib.sha256(json.dumps(
            grader, ensure_ascii=False, sort_keys=True,
            separators=(",", ":")).encode()).hexdigest()
        data[-1:-1] = events
        data[-1]["results"] = 30 * 2 * 2 + 2 * 2
        report = score.analyze(data)
        self.assertEqual(report["metrics"]["test"]["clusters"], 30)
        self.assertEqual(report["metrics"]["gate"]["clusters"], 1)
        self.assertEqual(report["verdict"], "REGRESSION")
        self.assertEqual(report["introduced_critical_failures"], ["rare-critical"])


if __name__ == "__main__":
    unittest.main()
