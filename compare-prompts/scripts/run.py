#!/usr/bin/env python3
"""Paired, local-only prompt comparison runner for Ollama."""
from __future__ import annotations

import argparse
import hashlib
import ipaddress
import importlib
import json
import random
import socket
import subprocess
import sys
import tempfile
import time
import platform
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

VERSION = 1
DEFAULT_HOST = "http://127.0.0.1:11434"
DEFAULT_OPTIONS = {"temperature": 0, "seed": 0, "num_ctx": 32768, "num_predict": 256,
                   "top_k": 1, "top_p": 1, "repeat_penalty": 1}
MAX_RESPONSE = 32 * 1024 * 1024


class RunError(Exception):
    pass


def canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_snapshot(path: Path) -> dict[str, Any]:
    try:
        data = path.read_bytes()
    except OSError as exc:
        raise RunError(f"cannot read source file {path}: {exc}") from exc
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RunError(f"source file is not UTF-8: {path}") from exc
    return {"path": str(path), "name": path.name, "sha256": sha(data), "text": text}


def _local_url(host: str) -> str:
    parsed = urllib.parse.urlsplit(host)
    if parsed.scheme != "http" or not parsed.hostname or parsed.username or parsed.password:
        raise RunError("host must be a plain http URL on a loopback address")
    try:
        address = ipaddress.ip_address(parsed.hostname)
    except ValueError as exc:
        raise RunError("host must be a loopback IP literal") from exc
    if not address.is_loopback:
        raise RunError("host must be a loopback IP literal")
    return host.rstrip("/")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RunError(f"refusing HTTP redirect to {newurl}")


class Ollama:
    def __init__(self, host: str, timeout: float = 120):
        self.host = _local_url(host)
        self.timeout = timeout
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(self, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        data = None if body is None else canonical(body)
        req = urllib.request.Request(self.host + path, data=data,
                                     headers={"Content-Type": "application/json"} if data is not None else {})
        try:
            with self.opener.open(req, timeout=self.timeout) as response:
                raw = response.read(MAX_RESPONSE + 1)
        except (OSError, urllib.error.URLError, TimeoutError) as exc:
            raise RunError(f"Ollama transport error: {exc}") from exc
        if len(raw) > MAX_RESPONSE:
            raise RunError("Ollama response exceeded size limit")
        try:
            parsed = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RunError("Ollama returned invalid JSON") from exc
        if not isinstance(parsed, dict):
            raise RunError("Ollama returned a non-object response")
        return parsed


def validate(config_path: Path, allow_python: bool = False) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]], dict[str, str]]:
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RunError(f"cannot load config JSON: {exc}") from exc
    if not isinstance(config, dict) or config.get("version") != VERSION:
        raise RunError("config version must be 1")
    arms = config.get("arms")
    if not isinstance(arms, dict) or set(arms) != {"a", "b"}:
        raise RunError("arms must contain exactly a and b")
    base = config_path.resolve().parent
    snapshots: dict[str, list[dict[str, Any]]] = {}
    for arm in ("a", "b"):
        files = arms[arm].get("files") if isinstance(arms[arm], dict) else None
        if not isinstance(files, list) or not files or not all(isinstance(x, str) and x for x in files):
            raise RunError(f"arms.{arm}.files must be a nonempty list of paths")
        snapshots[arm] = [file_snapshot((base / x).resolve()) for x in files]
    model = config.get("model")
    if not isinstance(model, str) or not model.strip():
        raise RunError("model must be a nonempty string")
    config.setdefault("host", DEFAULT_HOST)
    _local_url(config["host"])
    options = config.setdefault("options", {})
    if not isinstance(options, dict):
        raise RunError("options must be an object")
    merged = dict(DEFAULT_OPTIONS)
    merged.update(options)
    if any(not isinstance(v, (str, int, float, bool)) for v in merged.values()):
        raise RunError("Ollama option values must be scalar")
    for key, value in merged.items():
        if isinstance(value, float) and not (float("-inf") < value < float("inf")):
            raise RunError(f"option {key} must be finite")
    integer_options = {"num_ctx", "num_predict", "seed", "top_k", "mirostat"}
    numeric_options = {"temperature", "top_p", "repeat_penalty", "presence_penalty", "frequency_penalty",
                       "tfs_z", "typical_p", "mirostat_eta", "mirostat_tau"}
    for key in integer_options:
        if key in merged and (isinstance(merged[key], bool) or not isinstance(merged[key], int)):
            raise RunError(f"option {key} must be an integer")
    for key in numeric_options:
        if key in merged and (isinstance(merged[key], bool) or not isinstance(merged[key], (int, float))):
            raise RunError(f"option {key} must be numeric")
    config["options"] = merged
    if (isinstance(merged["num_ctx"], bool) or not isinstance(merged["num_ctx"], int)
            or merged["num_ctx"] < 512 or isinstance(merged["num_predict"], bool)
            or not isinstance(merged["num_predict"], int) or merged["num_predict"] < 1
            or merged["num_predict"] >= merged["num_ctx"] - 256):
        raise RunError("num_ctx and num_predict must be integers with room for the output budget")
    repeats = config.setdefault("repeats", 2)
    if not isinstance(repeats, int) or isinstance(repeats, bool) or repeats < 1 or repeats > 100:
        raise RunError("repeats must be an integer from 1 to 100")
    seed = config.setdefault("order_seed", 123)
    if not isinstance(seed, int) or isinstance(seed, bool):
        raise RunError("order_seed must be an integer")
    cases = config.get("cases")
    if not isinstance(cases, list) or not cases:
        raise RunError("cases must be a nonempty list")
    ids: set[str] = set()
    for case in cases:
        if not isinstance(case, dict) or not isinstance(case.get("id"), str) or not case["id"] or case["id"] in ids:
            raise RunError("each case needs a unique nonempty string id")
        ids.add(case["id"])
        if not isinstance(case.get("cluster"), str) or not case["cluster"]:
            raise RunError(f"case {case['id']} needs a nonempty cluster")
        if (case.get("split") not in ("dev", "test", "gate") or not isinstance(case.get("input"), str)
                or not isinstance(case.get("critical", False), bool)):
            raise RunError(f"case {case['id']} needs split dev/test/gate and string input")
        case.setdefault("critical", False)
        if case["split"] == "gate" and not case["critical"]:
            raise RunError(f"case {case['id']} gate cases must be critical")
        grader = case.get("grader")
        if not isinstance(grader, dict) or grader.get("type") not in ("exact", "json_equal", "python"):
            raise RunError(f"case {case['id']} has an unsupported grader")
        if grader["type"] == "exact" and not isinstance(grader.get("expected"), str):
            raise RunError(f"case {case['id']} exact grader expected must be a string")
        if grader["type"] == "json_equal" and "expected" not in grader:
            raise RunError(f"case {case['id']} grader needs expected")
        if grader["type"] == "python":
            if not allow_python:
                raise RunError("python graders require --allow-python-graders")
            if not isinstance(grader.get("path"), str):
                raise RunError(f"case {case['id']} python grader needs path")
            path = (base / grader["path"]).resolve()
            if not path.is_file():
                raise RunError(f"python grader not found: {path}")
    if "response_format" in config and not isinstance(config["response_format"], (dict, str)):
        raise RunError("response_format must be a string or object")
    if not isinstance(config.get("decision"), dict):
        raise RunError("decision must be an object")
    try:
        score = importlib.import_module("score")
        if hasattr(score, "validate_config"):
            score.validate_config(config)
    except (ImportError, ValueError, TypeError) as exc:
        if isinstance(exc, ImportError):
            raise RunError("sibling score module is required to validate decision config") from exc
        raise RunError(f"invalid decision config: {exc}") from exc
    graders = {}
    for case in cases:
        grader = case["grader"]
        graders[case["id"]] = (sha((base / grader["path"]).resolve().read_bytes())
                                if grader["type"] == "python" else sha(canonical(grader)))
    return config, snapshots, graders


def _grader(case: dict[str, Any], output: str, base: Path, allow_python: bool,
            expected_script_hash: str | None = None) -> tuple[bool, bool]:
    g = case["grader"]
    if g["type"] == "exact":
        return output.strip() == str(g["expected"]).strip(), True
    if g["type"] == "json_equal":
        try:
            actual = json.loads(output)
        except json.JSONDecodeError:
            return False, True
        return canonical(actual) == canonical(g["expected"]), True
    if not allow_python:
        raise RunError("python graders require --allow-python-graders")
    script = (base / g["path"]).resolve()
    digest = sha(script.read_bytes())
    if expected_script_hash is not None and digest != expected_script_hash:
        raise RunError("python grader changed during run")
    with tempfile.TemporaryDirectory(prefix="compare-prompts-grader-") as grader_cwd:
        proc = subprocess.run([sys.executable, str(script)],
                              input=json.dumps({"input": case["input"], "output": output}),
                              text=True, capture_output=True, timeout=30, shell=False, cwd=grader_cwd)
    if proc.returncode != 0:
        raise RunError(f"python grader failed ({digest}): {proc.stderr[:500]}")
    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RunError("python grader must emit JSON {\"passed\": bool}") from exc
    if not isinstance(result, dict) or not isinstance(result.get("passed"), bool):
        raise RunError("python grader must emit JSON {\"passed\": bool}")
    return result["passed"], True


def _prompt(sources: list[dict[str, Any]]) -> str:
    return "\n\n".join(s["text"] for s in sources)


def _model_identity(api: Ollama, model: str) -> dict[str, Any]:
    version = api.request("/api/version").get("version")
    if not isinstance(version, str) or not version:
        raise RunError("Ollama /api/version did not return a version")
    tags = api.request("/api/tags")
    match = next((m for m in tags.get("models", []) if m.get("name") == model or m.get("model") == model), None)
    if match is None:
        raise RunError(f"model {model!r} is not present in Ollama /api/tags")
    show = api.request("/api/show", {"model": model})
    digest = match.get("digest")
    if not isinstance(digest, str) or not digest:
        raise RunError("Ollama did not provide a model digest to pin")
    return {"engine": "ollama", "version": version, "model": model, "digest": match.get("digest"),
            "template_hash": sha(str(show.get("template", "")).encode("utf-8")),
            "system_hash": sha(str(show.get("system", "")).encode("utf-8")),
            "parameters_hash": sha(str(show.get("parameters", "")).encode("utf-8")),
            "model_info_hash": sha(canonical(show.get("model_info", {}))),
            "modelfile_hash": sha(str(show.get("modelfile", "")).encode("utf-8")),
            "details": match.get("details", {})}


def _unload(api: Ollama, model: str) -> None:
    api.request("/api/generate", {"model": model, "keep_alive": 0})
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        ps = api.request("/api/ps")
        if not any(x.get("name") == model or x.get("model") == model for x in ps.get("models", [])):
            return
        time.sleep(0.25)
    raise RunError("timed out waiting for model unload")


def _check_identity(api: Ollama, model: str, expected: dict[str, Any]) -> None:
    actual = _model_identity(api, model)
    if actual != expected:
        raise RunError("Ollama model identity changed during run")


def _hardware() -> dict[str, Any]:
    info: dict[str, Any] = {"platform": platform.platform(), "machine": platform.machine()}
    try:
        proc = subprocess.run(["nvidia-smi", "--query-gpu=name,driver_version,memory.total",
                              "--format=csv,noheader,nounits"], capture_output=True, text=True,
                             timeout=3, shell=False)
        if proc.returncode == 0:
            info["nvidia_gpus"] = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
    except (OSError, subprocess.TimeoutExpired):
        pass
    return info


def _request(model: str, prompt: str, case: dict[str, Any], options: dict[str, Any],
             response_format: Any = None) -> tuple[dict[str, Any], str]:
    payload: dict[str, Any] = {"model": model, "system": prompt, "prompt": case["input"], "stream": False,
                               "options": options, "keep_alive": 0}
    if response_format is not None:
        payload["format"] = response_format
    request_hash = sha(canonical(payload))
    return payload, request_hash


def run(config_path: Path, output_path: Path, allow_python: bool = False, validate_only: bool = False) -> dict[str, Any]:
    config, snapshots, grader_hashes = validate(config_path, allow_python)
    if validate_only:
        return {"valid": True, "cases": len(config["cases"]), "arms": list(snapshots),
                "source_hashes": {a: [s["sha256"] for s in v] for a, v in snapshots.items()}}
    output_path = output_path.resolve()
    tool_root = Path(__file__).resolve().parents[1]
    if output_path == tool_root or tool_root in output_path.parents:
        raise RunError("output must be outside the compare-prompts skill folder")
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        stream = output_path.open("x", encoding="utf-8", newline="\n")
    except OSError as exc:
        raise RunError(f"cannot exclusively create output file: {exc}") from exc
    base = config_path.resolve().parent
    api = Ollama(config["host"])
    records: list[dict[str, Any]] = []
    try:
        identity = _model_identity(api, config["model"])
        manifest = {"type": "manifest", "config": config, "identity": identity,
                    "source_snapshots": {k: v for k, v in snapshots.items()}, "grader_hashes": grader_hashes,
                    "runner_hash": sha(Path(__file__).read_bytes()),
                    "scorer_hash": sha(Path(__file__).resolve().with_name("score.py").read_bytes()),
                    "hardware": _hardware()}
        stream.write(json.dumps(manifest, ensure_ascii=False) + "\n"); stream.flush()
        rng = random.Random(config["order_seed"])
        cases = config["cases"]
        initial_order = {case["id"]: rng.choice((("a", "b"), ("b", "a"))) for case in cases}
        for trial in range(config["repeats"]):
            trial_cases = list(cases)
            rng.shuffle(trial_cases)
            for case in trial_cases:
                order = initial_order[case["id"]]
                if trial % 2:
                    order = tuple(reversed(order))
                for arm in order:
                    _check_identity(api, config["model"], identity)
                    _unload(api, config["model"])
                    _check_identity(api, config["model"], identity)
                    payload, request_hash = _request(config["model"], _prompt(snapshots[arm]), case,
                                                     config["options"], config.get("response_format"))
                    request_record = {"type": "request", "case_id": case["id"], "arm": arm,
                                      "trial": trial, "request_hash": request_hash, "request": payload}
                    stream.write(json.dumps(request_record, ensure_ascii=False) + "\n"); stream.flush()
                    response = api.request("/api/generate", payload)
                    _check_identity(api, config["model"], identity)
                    output = response.get("response")
                    eval_count = response.get("eval_count")
                    prompt_count = response.get("prompt_eval_count")
                    valid = ("response" in response and isinstance(output, str)
                             and response.get("done") is True and response.get("done_reason") != "length"
                             and isinstance(eval_count, int) and not isinstance(eval_count, bool) and eval_count >= 0
                             and isinstance(prompt_count, int) and not isinstance(prompt_count, bool) and prompt_count >= 0
                             and eval_count < config["options"]["num_predict"]
                             and prompt_count + eval_count < (config["options"]["num_ctx"] - 256
                                                               - config["options"]["num_predict"]))
                    passed, grade_valid = (_grader(case, output, base, allow_python, grader_hashes[case["id"]])
                                           if valid else (False, False))
                    valid = valid and grade_valid
                    record = {"type": "result", "case_id": case["id"], "cluster": case["cluster"],
                              "split": case["split"], "arm": arm, "trial": trial, "passed": bool(passed),
                              "valid": bool(valid), "output": output, "response": response,
                              "request_hash": request_hash}
                    stream.write(json.dumps(record, ensure_ascii=False) + "\n"); stream.flush()
                    records.append(record)
                    if not valid:
                        raise RunError(f"invalid model result for case {case['id']} arm {arm} trial {trial}")
        _check_identity(api, config["model"], identity)
        footer = {"type": "complete", "results": len(records), "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        stream.write(json.dumps(footer) + "\n"); stream.flush()
        return footer
    except Exception as exc:
        error = {"type": "error", "error": str(exc), "results": len(records)}
        stream.write(json.dumps(error, ensure_ascii=False) + "\n"); stream.flush()
        if isinstance(exc, RunError):
            raise
        raise RunError(str(exc)) from exc
    finally:
        stream.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--allow-python-graders", action="store_true")
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args(argv)
    if not args.validate_only and args.output is None:
        parser.error("--output is required unless --validate-only is used")
    try:
        result = run(args.config, args.output or Path("unused.jsonl"), args.allow_python_graders, args.validate_only)
        print(json.dumps(result, indent=2))
        if args.validate_only:
            return 0
        with args.output.open("r", encoding="utf-8") as result_file:
            records = [json.loads(line) for line in result_file if line.strip()]
        report = importlib.import_module("score").analyze(records)
        print(json.dumps(report, indent=2))
        return {"IMPROVEMENT": 0, "NO_MEANINGFUL_CHANGE": 0, "REGRESSION": 1,
                "INCONCLUSIVE": 2, "INVALID": 3}.get(report.get("verdict"), 3)
    except RunError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
