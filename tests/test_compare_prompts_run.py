import json
import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT_DIR = Path(__file__).resolve().parents[1] / "compare-prompts" / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))
import run


class FakeOllama(run.Ollama):
    calls = []
    drift = False
    identity_count = 0
    omit_done = False
    omit_response = False
    omit_eval_count = False
    output_text = "ok"

    def __init__(self, host, timeout=120):
        self.host = host

    def request(self, path, body=None):
        self.calls.append((path, body))
        if path == "/api/version":
            return {"version": "0.9.1" if self.drift and self.identity_count >= 4 else "0.9.0"}
        if path == "/api/tags":
            self.identity_count += 1
            digest = "digest-1" if not self.drift or self.identity_count < 4 else "digest-2"
            return {"models": [{"name": "model:latest", "digest": digest, "details": {"family": "qwen"}}]}
        if path == "/api/show":
            return {"template": "template-v1", "parameters": "temperature 0", "model_info": {"size": 4},
                    "modelfile": "FROM model:latest"}
        if path == "/api/ps":
            return {"models": []}
        if path == "/api/generate" and body.get("keep_alive") == 0 and "prompt" not in body:
            return {"done": True}
        if path == "/api/generate":
            result = {"done": True, "response": self.output_text, "eval_count": 1, "prompt_eval_count": 10}
            if self.omit_done:
                result.pop("done")
            if self.omit_response:
                result.pop("response")
            if self.omit_eval_count:
                result.pop("eval_count")
            return result
        raise AssertionError((path, body))


class RunTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "a.md").write_text("prompt A", encoding="utf-8")
        (self.root / "b.md").write_text("prompt B", encoding="utf-8")
        self.config = {
            "version": 1, "arms": {"a": {"files": ["a.md"]}, "b": {"files": ["b.md"]}},
            "model": "model:latest", "host": "http://127.0.0.1:11434", "repeats": 2,
            "cases": [{"id": "one", "cluster": "c1", "split": "test", "critical": False, "input": "say ok",
                       "grader": {"type": "exact", "expected": "ok"}}],
            "decision": {"margin": .05, "alpha": .05, "min_clusters": 1, "quality_floor": .9,
                         "sampling": "representative", "holdout_frozen": True, "grader_validated": True}}
        self.config_path = self.root / "config.json"
        self.config_path.write_text(json.dumps(self.config), encoding="utf-8")
        FakeOllama.calls = []
        FakeOllama.drift = False
        FakeOllama.identity_count = 0
        FakeOllama.omit_done = False
        FakeOllama.omit_response = False
        FakeOllama.omit_eval_count = False
        FakeOllama.output_text = "ok"

    def tearDown(self):
        self.temp.cleanup()

    def test_validate_only_freezes_source_hashes_without_api_or_output(self):
        result = run.run(self.config_path, self.root / "none.jsonl", validate_only=True)
        self.assertTrue(result["valid"])
        self.assertEqual(len(result["source_hashes"]["a"]), 1)
        self.assertFalse((self.root / "none.jsonl").exists())

    @patch.object(run, "Ollama", FakeOllama)
    def test_full_run_writes_manifest_paired_results_and_footer(self):
        output = self.root / "run.jsonl"
        result = run.run(self.config_path, output)
        records = [json.loads(line) for line in output.read_text(encoding="utf-8").splitlines()]
        self.assertEqual(result["type"], "complete")
        self.assertEqual(records[0]["type"], "manifest")
        self.assertEqual(records[0]["identity"]["digest"], "digest-1")
        self.assertEqual(records[0]["identity"]["version"], "0.9.0")
        results = [r for r in records if r["type"] == "result"]
        self.assertEqual([(r["trial"], r["arm"]) for r in results], [(0, "a"), (0, "b"), (1, "b"), (1, "a")])
        self.assertTrue(all(r["passed"] and r["valid"] for r in results))
        self.assertEqual(records[-1]["type"], "complete")
        requests = [r for r in records if r["type"] == "request"]
        self.assertEqual(len(requests), 4)
        self.assertEqual(requests[0]["request"]["options"], run.DEFAULT_OPTIONS)
        self.assertEqual(requests[0]["request"]["prompt"], "say ok")
        self.assertEqual(requests[0]["request"]["system"], "prompt A")
        self.assertNotIn("expected", json.dumps(requests))
        with self.assertRaises(run.RunError):
            run.run(self.config_path, output)

    @patch.object(run, "Ollama", FakeOllama)
    def test_identity_version_and_digest_drift_stops_before_result(self):
        FakeOllama.drift = True
        output = self.root / "drift.jsonl"
        with self.assertRaisesRegex(run.RunError, "identity changed"):
            run.run(self.config_path, output)
        records = [json.loads(line) for line in output.read_text(encoding="utf-8").splitlines()]
        self.assertEqual(records[-1]["type"], "error")
        self.assertFalse(any(r["type"] == "complete" for r in records))

    def test_json_equal_malformed_output_is_an_ordinary_grader_failure(self):
        case = {"input": "x", "grader": {"type": "json_equal", "expected": {"x": True}}}
        passed, valid = run._grader(case, "{oops", self.root, False)
        self.assertFalse(passed)
        self.assertTrue(valid)

    @patch.object(run, "Ollama", FakeOllama)
    def test_missing_done_flag_produces_invalid_run_score(self):
        FakeOllama.omit_done = True
        output = self.root / "invalid.jsonl"
        with self.assertRaisesRegex(run.RunError, "invalid model result"):
            run.run(self.config_path, output)
        records = [json.loads(line) for line in output.read_text(encoding="utf-8").splitlines()]
        import score
        report = score.analyze(records)
        self.assertEqual(report["verdict"], "INVALID")
        self.assertEqual(records[-1]["type"], "error")
        self.assertFalse(any(r["type"] == "complete" for r in records))

    @patch.object(run, "Ollama", FakeOllama)
    def test_missing_response_and_usage_fields_stop_without_completion(self):
        for flag in ("omit_response", "omit_eval_count"):
            with self.subTest(flag=flag):
                setattr(FakeOllama, flag, True)
                output = self.root / f"{flag}.jsonl"
                with self.assertRaisesRegex(run.RunError, "invalid model result"):
                    run.run(self.config_path, output)
                records = [json.loads(line) for line in output.read_text(encoding="utf-8").splitlines()]
                self.assertEqual(records[-1]["type"], "error")
                self.assertFalse(any(r["type"] == "complete" for r in records))
                setattr(FakeOllama, flag, False)

    @patch.object(run, "Ollama", FakeOllama)
    def test_run_records_score_as_valid_and_inconclusive_for_one_cluster(self):
        output = self.root / "scored.jsonl"
        run.run(self.config_path, output)
        records = [json.loads(line) for line in output.read_text(encoding="utf-8").splitlines()]
        import score
        report = score.analyze(records)
        self.assertEqual(report["verdict"], "INCONCLUSIVE")
        self.assertEqual(report["errors"], [])

    @patch.object(run, "Ollama", FakeOllama)
    def test_malformed_json_output_is_scored_as_failed_case_not_invalid_run(self):
        FakeOllama.output_text = "not JSON"
        self.config["cases"][0]["grader"] = {"type": "json_equal", "expected": {"ok": True}}
        self.config_path.write_text(json.dumps(self.config), encoding="utf-8")
        output = self.root / "bad-json.jsonl"
        run.run(self.config_path, output)
        records = [json.loads(line) for line in output.read_text(encoding="utf-8").splitlines()]
        results = [r for r in records if r["type"] == "result"]
        self.assertTrue(all(r["valid"] and not r["passed"] for r in results))
        import score
        self.assertNotEqual(score.analyze(records)["verdict"], "INVALID")

    @patch.object(run, "Ollama", FakeOllama)
    def test_cli_returns_scorer_inconclusive_exit_code(self):
        output = self.root / "cli.jsonl"
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured):
            code = run.main(["--config", str(self.config_path), "--output", str(output)])
        self.assertEqual(code, 2)
        self.assertIn('"verdict": "INCONCLUSIVE"', captured.getvalue())

    def test_config_rejects_remote_host(self):
        self.config["host"] = "http://example.com:11434"
        self.config_path.write_text(json.dumps(self.config), encoding="utf-8")
        with self.assertRaisesRegex(run.RunError, "loopback"):
            run.validate(self.config_path)


if __name__ == "__main__":
    unittest.main()
