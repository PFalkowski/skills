#!/usr/bin/env python3
"""Validate and score a paired, cluster-level prompt comparison."""

import argparse
import hashlib
import json
import math
import os
import sys


def _number(value, name, *, minimum=None, maximum=None, inclusive_min=True):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a finite number")
    value = float(value)
    if not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number")
    if minimum is not None and (value < minimum if inclusive_min else value <= minimum):
        raise ValueError(f"{name} is below its allowed range")
    if maximum is not None and value > maximum:
        raise ValueError(f"{name} is above its allowed range")
    return value


def _log_binomial_term(n, k, p):
    if p == 0:
        return 0.0 if k == 0 else -math.inf
    if p == 1:
        return 0.0 if k == n else -math.inf
    return (math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)
            + k * math.log(p) + (n - k) * math.log1p(-p))


def _binomial_cdf(n, k, p):
    if k < 0:
        return 0.0
    if k >= n:
        return 1.0
    terms = [_log_binomial_term(n, i, p) for i in range(k + 1)]
    peak = max(terms)
    return math.exp(peak) * sum(math.exp(term - peak) for term in terms)


def _binomial_survival(n, k, p):
    if k <= 0:
        return 1.0
    if k > n:
        return 0.0
    terms = [_log_binomial_term(n, i, p) for i in range(k, n + 1)]
    peak = max(terms)
    return math.exp(peak) * sum(math.exp(term - peak) for term in terms)


def _bisect_increasing(fn, target):
    low, high = 0.0, 1.0
    for _ in range(70):
        mid = (low + high) / 2
        if fn(mid) < target:
            low = mid
        else:
            high = mid
    return (low + high) / 2


def _bisect_decreasing(fn, target):
    low, high = 0.0, 1.0
    for _ in range(70):
        mid = (low + high) / 2
        if fn(mid) > target:
            low = mid
        else:
            high = mid
    return (low + high) / 2


def _cp_interval(successes, n, tail):
    """Two-sided Clopper-Pearson bounds with per-tail probability ``tail``."""
    if successes == 0:
        lower = 0.0
    else:
        lower = _bisect_increasing(
            lambda p: _binomial_survival(n, successes, p), tail)
    if successes == n:
        upper = 1.0
    else:
        upper = _bisect_decreasing(
            lambda p: _binomial_cdf(n, successes, p), tail)
    return lower, upper


def paired_interval(wins, losses, n, alpha):
    """Conservative paired difference interval using union-bound CP limits.

    Wins and losses are counts among all n independent clusters. Each marginal
    interval has confidence 1-alpha/2, allocating alpha/4 to each tail.
    """
    if any(isinstance(x, bool) or not isinstance(x, int) for x in (wins, losses, n)):
        raise ValueError("wins, losses, and n must be integers")
    alpha = _number(alpha, "alpha", minimum=0, maximum=1, inclusive_min=False)
    if alpha >= 1:
        raise ValueError("alpha must be between 0 and 1")
    if n <= 0 or wins < 0 or losses < 0 or wins + losses > n:
        raise ValueError("invalid paired counts")
    tail = alpha / 4
    win_low, win_high = _cp_interval(wins, n, tail)
    loss_low, loss_high = _cp_interval(losses, n, tail)
    return win_low - loss_high, win_high - loss_low


def validate_config(config):
    """Raise ValueError for an invalid manifest config; return it when valid."""
    if (not isinstance(config, dict) or isinstance(config.get("version"), bool)
            or config.get("version") != 1):
        raise ValueError("manifest config version must be 1")
    repeats = config.get("repeats")
    if isinstance(repeats, bool) or not isinstance(repeats, int) or repeats < 1:
        raise ValueError("repeats must be a positive integer")
    decision = config.get("decision")
    if not isinstance(decision, dict):
        raise ValueError("manifest decision settings are required")
    margin = _number(decision.get("margin"), "margin", minimum=0, maximum=1,
                     inclusive_min=False)
    alpha = _number(decision.get("alpha"), "alpha", minimum=0, maximum=1,
                     inclusive_min=False)
    if alpha >= 1:
        raise ValueError("alpha must be between 0 and 1")
    quality_floor = _number(decision.get("quality_floor"), "quality_floor",
                            minimum=0, maximum=1)
    min_clusters = decision.get("min_clusters")
    if isinstance(min_clusters, bool) or not isinstance(min_clusters, int) or min_clusters < 1:
        raise ValueError("min_clusters must be a positive integer")
    sampling = decision.get("sampling")
    if sampling not in ("representative", "curated"):
        raise ValueError("sampling must be representative or curated")
    if not isinstance(decision.get("holdout_frozen"), bool):
        raise ValueError("holdout_frozen must be boolean")
    if not isinstance(decision.get("grader_validated"), bool):
        raise ValueError("grader_validated must be boolean")
    if not isinstance(config.get("model"), str) or not config["model"]:
        raise ValueError("config model must be a nonempty string")
    options = config.get("options")
    if not isinstance(options, dict):
        raise ValueError("config options must be an object")
    for name in ("num_ctx", "num_predict"):
        value = options.get(name)
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError(f"config options.{name} must be a positive integer")
    if not isinstance(config.get("response_format", None), (str, dict, type(None))):
        raise ValueError("response_format must be a string or object")
    cases = config.get("cases")
    if not isinstance(cases, list) or not cases:
        raise ValueError("manifest must declare cases")
    case_by_id = {}
    cluster_splits = {}
    for case in cases:
        if not isinstance(case, dict) or not isinstance(case.get("id"), str) or not case["id"]:
            raise ValueError("each case requires a nonempty id")
        if case["id"] in case_by_id:
            raise ValueError("duplicate case id")
        if not isinstance(case.get("cluster"), str) or not case["cluster"]:
            raise ValueError("each case requires a nonempty cluster")
        if case.get("split") not in ("dev", "test", "gate") or not isinstance(case.get("critical"), bool):
            raise ValueError("case split or critical flag is invalid")
        if not isinstance(case.get("input"), str):
            raise ValueError(f"case {case['id']} requires a string input")
        if case["split"] == "gate" and not case["critical"]:
            raise ValueError("gate cases must be marked critical")
        split = case["split"]
        cluster = case["cluster"]
        if cluster in cluster_splits and cluster_splits[cluster] != split:
            raise ValueError(f"cluster {cluster!r} spans dev and test splits")
        cluster_splits[cluster] = split
        case_by_id[case["id"]] = case
    return config


def _request_hash(request):
    canonical = json.dumps(request, ensure_ascii=False, sort_keys=True,
                           separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _sha256_hex(value):
    return isinstance(value, str) and len(value) == 64 and all(
        char in "0123456789abcdef" for char in value.lower())


def _validate_manifest(manifest):
    """Validate evidence that binds a run to code, model, prompts, and graders."""
    config = manifest.get("config")
    validate_config(config)
    identity = manifest.get("identity")
    if not isinstance(identity, dict):
        raise ValueError("manifest model identity is required")
    identity_fields = ("engine", "version", "model", "digest", "template_hash",
                      "system_hash", "parameters_hash", "model_info_hash", "modelfile_hash")
    if any(not isinstance(identity.get(field), str) or not identity[field]
           for field in identity_fields):
        raise ValueError("manifest model identity is incomplete")
    if identity["engine"] != "ollama" or identity["model"] != config.get("model"):
        raise ValueError("manifest model identity does not match config")
    if any(not _sha256_hex(identity[field]) for field in identity_fields[4:]):
        raise ValueError("manifest model identity contains an invalid hash")
    for key in ("runner_hash", "scorer_hash"):
        if not _sha256_hex(manifest.get(key)):
            raise ValueError(f"manifest {key} must be a SHA-256 hex digest")
    if not isinstance(manifest.get("hardware"), dict):
        raise ValueError("manifest hardware metadata is required")
    snapshots = manifest.get("source_snapshots")
    if not isinstance(snapshots, dict) or set(snapshots) != {"a", "b"}:
        raise ValueError("manifest source_snapshots must contain a and b")
    for arm in ("a", "b"):
        files = snapshots[arm]
        if not isinstance(files, list) or not files:
            raise ValueError(f"source snapshots for arm {arm} must be a nonempty list")
        for source in files:
            if not isinstance(source, dict) or not isinstance(source.get("text"), str):
                raise ValueError(f"source snapshot for arm {arm} is invalid")
            if source.get("sha256") != hashlib.sha256(source["text"].encode("utf-8")).hexdigest():
                raise ValueError(f"source snapshot hash mismatch for arm {arm}")
    grader_hashes = manifest.get("grader_hashes")
    if not isinstance(grader_hashes, dict) or set(grader_hashes) != {
            case["id"] for case in config["cases"]}:
        raise ValueError("manifest grader_hashes must contain every case")
    for case in config["cases"]:
        case_id = case["id"]
        grader = case.get("grader")
        if not isinstance(grader, dict) or grader.get("type") not in ("exact", "json_equal", "python"):
            raise ValueError(f"case {case_id} has an unsupported grader")
        if grader["type"] == "exact" and not isinstance(grader.get("expected"), str):
            raise ValueError(f"case {case_id} exact grader needs a string expected value")
        if grader["type"] == "json_equal" and "expected" not in grader:
            raise ValueError(f"case {case_id} JSON grader needs an expected value")
        actual_hash = grader_hashes[case_id]
        if not _sha256_hex(actual_hash):
            raise ValueError(f"grader hash for {case_id} is invalid")
        if grader["type"] != "python":
            expected_hash = _request_hash(grader)
            if actual_hash != expected_hash:
                raise ValueError(f"built-in grader hash mismatch for {case_id}")
    return config, snapshots, grader_hashes


def _expected_request(config, snapshots, case, arm):
    request = {"model": config["model"],
               "system": "\n\n".join(source["text"] for source in snapshots[arm]),
               "prompt": case["input"], "stream": False,
               "options": config["options"], "keep_alive": 0}
    if config.get("response_format") is not None:
        request["format"] = config["response_format"]
    return request


def _validate_response(config, record, case):
    response = record.get("response")
    if not isinstance(response, dict):
        raise ValueError(f"result {record.get('case_id')} lacks a raw response object")
    output = record.get("output")
    if (not isinstance(output, str) or response.get("response") != output
            or response.get("done") is not True or response.get("done_reason") == "length"):
        raise ValueError(f"result {record.get('case_id')} response does not match output or is incomplete")
    eval_count = response.get("eval_count")
    prompt_count = response.get("prompt_eval_count")
    if any(isinstance(count, bool) or not isinstance(count, int) or count < 0
           for count in (eval_count, prompt_count)):
        raise ValueError(f"result {record.get('case_id')} has invalid token counts")
    options = config["options"]
    if (eval_count >= options["num_predict"]
            or prompt_count + eval_count >= options["num_ctx"] - 256 - options["num_predict"]):
        raise ValueError(f"result {record.get('case_id')} exceeded configured token budget")


def _builtin_grade(case, output):
    grader = case["grader"]
    if grader["type"] == "exact":
        return output.strip() == grader["expected"].strip()
    try:
        return _request_hash(json.loads(output)) == _request_hash(grader["expected"])
    except (json.JSONDecodeError, RecursionError):
        return False


def _validate(records):
    if not isinstance(records, list) or not records:
        raise ValueError("input must contain JSONL records")
    if not isinstance(records[0], dict) or records[0].get("type") != "manifest":
        raise ValueError("first record must be the manifest")
    manifests = [r for r in records if isinstance(r, dict) and r.get("type") == "manifest"]
    footers = [r for r in records if isinstance(r, dict) and r.get("type") == "complete"]
    if len(manifests) != 1:
        raise ValueError("expected exactly one manifest")
    if len(footers) != 1 or records[-1] is not footers[0]:
        raise ValueError("missing or misplaced completion footer")
    config, snapshots, grader_hashes = _validate_manifest(manifests[0])
    repeats = config["repeats"]
    decision = config["decision"]
    margin = float(decision["margin"])
    alpha = float(decision["alpha"])
    quality_floor = float(decision["quality_floor"])
    min_clusters = decision["min_clusters"]
    cases = config["cases"]
    case_by_id = {case["id"]: case for case in cases}
    expected = {(case_id, arm, trial) for case_id in case_by_id
                for arm in ("a", "b") for trial in range(repeats)}
    cells = {}
    requests = {}
    pending_requests = set()
    for record in records:
        if not isinstance(record, dict):
            raise ValueError("every JSONL record must be an object")
        if record.get("type") in ("manifest", "complete"):
            continue
        if record.get("type") == "request":
            key = (record.get("case_id"), record.get("arm"), record.get("trial"))
            if isinstance(key[2], bool) or not isinstance(key[2], int):
                raise ValueError(f"trial must be an integer: {key}")
            if key not in expected:
                raise ValueError(f"extra request cell: {key}")
            if key in requests:
                raise ValueError(f"duplicate request cell: {key}")
            request = record.get("request")
            supplied_hash = record.get("request_hash")
            if (not isinstance(request, dict) or not isinstance(supplied_hash, str)
                    or supplied_hash != _request_hash(request)):
                raise ValueError(f"invalid request or request hash: {key}")
            if request != _expected_request(config, snapshots, case_by_id[key[0]], key[1]):
                raise ValueError(f"request does not match pinned prompt/config for {key}")
            requests[key] = supplied_hash
            pending_requests.add(key)
            continue
        if record.get("type") != "result":
            raise ValueError("unknown JSONL record type")
        key = (record.get("case_id"), record.get("arm"), record.get("trial"))
        if isinstance(key[2], bool) or not isinstance(key[2], int):
            raise ValueError(f"trial must be an integer: {key}")
        if key not in expected:
            raise ValueError(f"extra result cell: {key}")
        if key in cells:
            raise ValueError(f"duplicate result cell: {key}")
        if key not in pending_requests:
            raise ValueError(f"result has no preceding request: {key}")
        if record.get("request_hash") != requests[key]:
            raise ValueError(f"request hash mismatch: {key}")
        pending_requests.remove(key)
        if (not isinstance(record.get("passed"), bool)
                or record.get("valid") is not True
                or not isinstance(record.get("output"), str)):
            raise ValueError(f"invalid result cell: {key}")
        case = case_by_id[key[0]]
        if record.get("cluster") != case["cluster"] or record.get("split") != case["split"]:
            raise ValueError(f"result metadata does not match manifest: {key}")
        _validate_response(config, record, case)
        if case["grader"]["type"] != "python":
            expected_pass = _builtin_grade(case, record["output"])
            if record["passed"] != expected_pass:
                raise ValueError(f"recorded grade does not match built-in grader: {key}")
        cells[key] = record
    if pending_requests:
        raise ValueError(f"{len(pending_requests)} request(s) have no result")
    if set(requests) != expected:
        raise ValueError(f"missing {len(expected.difference(requests))} request cell(s)")
    missing = expected.difference(cells)
    if missing:
        raise ValueError(f"missing {len(missing)} result cell(s)")
    footer = footers[0]
    result_count = footer.get("results")
    if (isinstance(result_count, bool) or not isinstance(result_count, int)
            or result_count != len(expected)):
        raise ValueError("completion footer result count does not match manifest")
    return config, decision, case_by_id, cells, margin, alpha, quality_floor, min_clusters


def _summarize_split(case_by_id, cells, repeats, split):
    selected = {key: case for key, case in case_by_id.items() if case["split"] == split}
    clusters = sorted({case["cluster"] for case in selected.values()})
    outcomes = {}
    for cluster in clusters:
        cases = [case_id for case_id, case in selected.items() if case["cluster"] == cluster]
        reliable = {}
        for arm in ("a", "b"):
            reliable[arm] = all(cells[(case_id, arm, trial)]["passed"]
                               for case_id in cases for trial in range(repeats))
        outcomes[cluster] = reliable
    wins = sum(v["b"] and not v["a"] for v in outcomes.values())
    losses = sum(v["a"] and not v["b"] for v in outcomes.values())
    return {"clusters": len(clusters), "a_reliable_successes": sum(v["a"] for v in outcomes.values()),
            "b_reliable_successes": sum(v["b"] for v in outcomes.values()),
            "wins": wins, "losses": losses,
            "a_success_rate": sum(v["a"] for v in outcomes.values()) / len(clusters) if clusters else None,
            "b_success_rate": sum(v["b"] for v in outcomes.values()) / len(clusters) if clusters else None,
            "outcomes": outcomes}


def analyze(records):
    """Return a report. Malformed/incomplete input is always INVALID."""
    try:
        config, decision, cases, cells, margin, alpha, floor, minimum = _validate(records)
    except (ValueError, TypeError, KeyError) as exc:
        return {"verdict": "INVALID", "errors": [str(exc)]}
    test = _summarize_split(cases, cells, config["repeats"], "test")
    dev = _summarize_split(cases, cells, config["repeats"], "dev")
    gate = _summarize_split(cases, cells, config["repeats"], "gate")
    interval = paired_interval(test["wins"], test["losses"], test["clusters"], alpha) if test["clusters"] else None
    critical_failures = []
    candidate_critical_failures = []
    for case_id, case in cases.items():
        if not case["critical"] or case["split"] not in ("test", "gate"):
            continue
        a_all = all(cells[(case_id, "a", t)]["passed"] for t in range(config["repeats"]))
        b_all = all(cells[(case_id, "b", t)]["passed"] for t in range(config["repeats"]))
        if a_all and not b_all:
            critical_failures.append(case_id)
        if not b_all:
            candidate_critical_failures.append(case_id)
    outputs_same = outputs_different = score_changes = 0
    stable_outputs = {"a": 0, "b": 0}
    unstable_outputs = {"a": 0, "b": 0}
    shared_failures = []
    task_cost_fields = ("total_duration", "load_duration", "prompt_eval_duration",
                        "eval_duration", "eval_count", "prompt_eval_count")
    task_cost = {field: {"sum": 0, "available": 0, "missing": 0}
                 for field in task_cost_fields}
    for case_id, case in cases.items():
        for trial in range(config["repeats"]):
            for arm in ("a", "b"):
                response = cells[(case_id, arm, trial)]["response"]
                for field in task_cost_fields:
                    value = response.get(field)
                    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
                        task_cost[field]["sum"] += value
                        task_cost[field]["available"] += 1
                    else:
                        task_cost[field]["missing"] += 1
        if case["split"] == "test":
            if all(not cells[(case_id, arm, trial)]["passed"]
                   for arm in ("a", "b") for trial in range(config["repeats"])):
                shared_failures.append(case_id)
            for arm in ("a", "b"):
                outputs = {cells[(case_id, arm, trial)]["output"]
                           for trial in range(config["repeats"])}
                (stable_outputs if len(outputs) == 1 else unstable_outputs)[arm] += 1
            for trial in range(config["repeats"]):
                a, b = cells[(case_id, "a", trial)], cells[(case_id, "b", trial)]
                if a["output"] == b["output"]:
                    outputs_same += 1
                else:
                    outputs_different += 1
                score_changes += a["passed"] != b["passed"]
    diagnostics = {"same_outputs": outputs_same, "different_outputs": outputs_different,
                   "score_changes": score_changes,
                   "repeated_output_stability": {"stable_cases": stable_outputs,
                                                  "unstable_cases": unstable_outputs},
                   "shared_failure_case_ids": sorted(shared_failures),
                   "task_cost": task_cost}
    eligible = (decision["holdout_frozen"] and decision["grader_validated"]
                and decision["sampling"] == "representative"
                and test["clusters"] >= minimum)
    floor_met = test["b_success_rate"] is not None and test["b_success_rate"] >= floor
    if critical_failures and decision["grader_validated"]:
        verdict = "REGRESSION"
    elif not eligible:
        verdict = "INCONCLUSIVE"
    elif interval[1] < -margin:
        verdict = "REGRESSION"
    elif not floor_met or candidate_critical_failures:
        verdict = "INCONCLUSIVE"
    elif interval[0] > margin:
        verdict = "IMPROVEMENT"
    elif interval[0] >= -margin and interval[1] <= margin:
        verdict = "NO_MEANINGFUL_CHANGE"
    else:
        verdict = "INCONCLUSIVE"
    for summary in (test, dev, gate):
        summary.pop("outcomes", None)
    point_delta = (test["b_success_rate"] - test["a_success_rate"]
                   if test["clusters"] else None)
    return {"verdict": verdict, "errors": [], "metrics": {"test": test, "dev": dev, "gate": gate},
            "test_point_delta": point_delta,
            "test_delta_interval": list(interval) if interval else None,
            "introduced_critical_failures": sorted(critical_failures),
            "candidate_critical_failures": sorted(candidate_critical_failures),
            "diagnostics": diagnostics,
            "decision_eligible": eligible, "quality_floor_met": floor_met,
            "assumptions": {"margin": margin, "alpha": alpha, "quality_floor": floor,
                            "min_clusters": minimum}}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="JSONL run file")
    parser.add_argument("output", help="JSON report path")
    args = parser.parse_args(argv)
    try:
        if os.path.normcase(os.path.abspath(args.input)) == os.path.normcase(os.path.abspath(args.output)):
            raise ValueError("input and output paths must differ")
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    try:
        with open(args.input, encoding="utf-8") as source:
            records = [json.loads(line) for line in source if line.strip()]
        report = analyze(records)
        with open(args.output, "x", encoding="utf-8") as target:
            json.dump(report, target, indent=2, sort_keys=True)
            target.write("\n")
    except (OSError, ValueError, RecursionError) as exc:
        if isinstance(exc, FileExistsError):
            parser.error(f"report output already exists: {args.output}")
        report = {"verdict": "INVALID", "errors": [str(exc)]}
        try:
            with open(args.output, "x", encoding="utf-8") as target:
                json.dump(report, target, indent=2)
                target.write("\n")
        except OSError:
            pass
    verdict = report["verdict"]
    return 0 if verdict in ("IMPROVEMENT", "NO_MEANINGFUL_CHANGE") else (
        1 if verdict == "REGRESSION" else 3 if verdict == "INVALID" else 2)


if __name__ == "__main__":
    sys.exit(main())
