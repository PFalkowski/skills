"""Build, test and Host discovery for a candidate tree."""
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common

SKIP_DIRS = {"bin", "obj", ".git", "node_modules", ".data"}
VSTEST = re.compile(r"(?:Passed|Failed)!\s+-\s+Failed:\s+(\d+),\s+Passed:\s+(\d+),\s+Skipped:\s+(\d+),\s+Total:\s+(\d+)")
MTP_BLOCK = re.compile(r"total:\s+(\d+)\s+failed:\s+(\d+)\s+succeeded:\s+(\d+)\s+skipped:\s+(\d+)", re.I)
WARNINGS = re.compile(r"^\s*(\d+) Warning\(s\)", re.M)
ERRORS = re.compile(r"^\s*(\d+) Error\(s\)", re.M)
EXE = re.compile(r"<OutputType>\s*(?:Exe|WinExe)\s*</OutputType>", re.I)
WEB = re.compile(r'Sdk="Microsoft\.NET\.Sdk\.Web"', re.I)
TEST_PROJECT = re.compile(r"Microsoft\.NET\.Test\.Sdk|<IsTestProject>\s*true", re.I)
ASSEMBLY = re.compile(r"<AssemblyName>\s*([^<\s]+)\s*</AssemblyName>")


class DiscoveryError(Exception):
    pass


def find_solution(root):
    """The one .sln or .slnx in the root. A .slnx wins if both exist."""
    root = Path(root)
    found = sorted(root.glob("*.slnx")) or sorted(root.glob("*.sln"))
    if not found:
        raise DiscoveryError(f"no .sln or .slnx in {root}")
    if len(found) > 1:
        raise DiscoveryError(f"more than one solution file in {root}: {[f.name for f in found]}")
    return found[0]


INHERITED = ("Directory.Build.props", "Directory.Build.targets", "Directory.Packages.props", "global.json")


def ancestor_build_files(root):
    """MSBuild and the SDK read these from every parent folder. They would change the candidate's build."""
    found = []
    for parent in Path(root).resolve().parents:
        found += [parent / name for name in INHERITED if (parent / name).is_file()]
    return found


def parse_test_output(text):
    """Sum pass, fail and skip counts over every test project in `dotnet test` output."""
    passed = failed = skipped = total = 0
    runs = 0
    for m in VSTEST.finditer(text):
        failed += int(m.group(1)); passed += int(m.group(2)); skipped += int(m.group(3)); total += int(m.group(4))
        runs += 1
    if not runs:
        for m in MTP_BLOCK.finditer(text):
            total += int(m.group(1)); failed += int(m.group(2)); passed += int(m.group(3)); skipped += int(m.group(4))
            runs += 1
    return {"passed": passed, "failed": failed, "skipped": skipped, "total": total, "test_projects": runs}


def parse_build_output(text):
    """Warning and error counts from the last build summary in the output."""
    w = WARNINGS.findall(text)
    e = ERRORS.findall(text)
    return {"warnings": int(w[-1]) if w else None, "errors": int(e[-1]) if e else None}


def discover_hosts(root):
    """Executable projects under src/, as (csproj path, expected dll stem). Test projects are skipped."""
    src = Path(root) / "src"
    hosts = []
    if not src.is_dir():
        return hosts
    for dirpath, dirnames, filenames in os.walk(src):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if not name.endswith(".csproj"):
                continue
            path = Path(dirpath) / name
            text = path.read_text(encoding="utf-8", errors="replace")
            if TEST_PROJECT.search(text) or not (EXE.search(text) or WEB.search(text)):
                continue
            m = ASSEMBLY.search(text)
            hosts.append((path, m.group(1) if m else path.stem))
    return sorted(hosts)


def find_host(root, newer_than=None):
    """Return (csproj, built dll or None). Several executables: prefer one whose name has 'Host'."""
    hosts = discover_hosts(root)
    if not hosts:
        raise DiscoveryError(f"no executable project under {Path(root) / 'src'}; pass --candidate-cmd")
    if len(hosts) > 1:
        named = [h for h in hosts if "host" in h[0].stem.lower()]
        if len(named) != 1:
            raise DiscoveryError(f"several executable projects ({[str(h[0].relative_to(root)) for h in hosts]}); pass --candidate-cmd")
        hosts = named
    project, stem = hosts[0]
    return project, built_dll(project, stem, newer_than)


def built_dll(project, stem, newer_than=None):
    """The newest Debug build output of the project, or None. A dll older than `newer_than` (an epoch time) is ignored."""
    found = sorted((p for p in (project.parent / "bin" / "Debug").glob(f"*/{stem}.dll")), key=lambda p: p.stat().st_mtime)
    if newer_than is not None:
        found = [p for p in found if p.stat().st_mtime >= newer_than]
    return found[-1] if found else None


def run_logged(argv, cwd, log_path, timeout=1800):
    """Run a command, write its combined output to log_path and return (exit code, output, seconds).

    On a timeout the whole process tree is killed, because `dotnet test` leaves test host children.
    """
    t0 = time.monotonic()
    kwargs = {} if common.WINDOWS else {"start_new_session": True}
    try:
        p = subprocess.Popen(argv, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                             text=True, encoding="utf-8", errors="replace", **kwargs)
    except OSError as error:
        code, out = "missing", str(error)
    else:
        try:
            out, _ = p.communicate(timeout=timeout)
            code = p.returncode
        except subprocess.TimeoutExpired:
            common.kill_tree(p)
            out, _ = p.communicate()
            code, out = "timeout", "timed out after " + str(timeout) + "s" + chr(10) + (out or "")
    Path(log_path).write_text(out, encoding="utf-8")
    return code, out, round(time.monotonic() - t0, 1)


def clean_outputs(root):
    """Delete every bin and obj folder, so only what this build produces can be scored."""
    removed = 0
    for dirpath, dirnames, _ in os.walk(root):
        for d in list(dirnames):
            if d in ("bin", "obj"):
                shutil.rmtree(Path(dirpath) / d, ignore_errors=True)
                removed += 1
                dirnames.remove(d)
            elif d in (".git", "node_modules"):
                dirnames.remove(d)
    return removed


def build_and_test(root, out_dir, label="local"):
    """dotnet build, dotnet test and node --check app.js. `label` names the log files."""
    root, out_dir = Path(root), Path(out_dir)
    solution = find_solution(root)
    result = {"solution": solution.name, "cleaned_output_folders": clean_outputs(root), "build_started": time.time()}
    code, text, secs = run_logged(["dotnet", "build", solution.name, "--nologo"], root, out_dir / f"{label}-build.log")
    result["build"] = {"exit": code, "seconds": secs, **parse_build_output(text)}
    result["build"]["ok"] = code == 0 and not result["build"]["errors"]
    code, text, secs = run_logged(["dotnet", "test", solution.name, "--nologo"], root, out_dir / f"{label}-test.log")
    result["dotnet_test"] = {"exit": code, "seconds": secs, **parse_test_output(text)}
    result["node_check"] = node_check(root, out_dir / f"{label}-node.log")
    return result


def node_check(root, log_path):
    if not (Path(root) / "app.js").is_file():
        return {"status": "unavailable", "reason": "no app.js in the root"}
    if shutil.which("node") is None:
        return {"status": "unavailable", "reason": "node is not installed"}
    code, _, _ = run_logged(["node", "--check", "app.js"], root, log_path, timeout=120)
    return {"status": "pass" if code == 0 else "fail", "exit": code}


COPY_SKIP = shutil.ignore_patterns("bin", "obj", ".git", ".data", "node_modules")


def docker_checks(root, out_dir, sdk_image="mcr.microsoft.com/dotnet/sdk:10.0", node_image="node:22"):
    """Run dotnet test and node --check in containers on a clean copy of the source."""
    root, out_dir = Path(root), Path(out_dir)
    if shutil.which("docker") is None:
        return {"status": "unavailable", "reason": "docker is not installed"}
    solution = find_solution(root)
    src = out_dir / "docker-src"
    shutil.copytree(root, src, ignore=COPY_SKIP)
    mount = f"{src}:/src"
    sdk_cmd = ["docker", "run", "--rm", "-v", mount, "-w", "/src", sdk_image]
    code, text, _ = run_logged(sdk_cmd + ["dotnet", "--version"], out_dir, out_dir / "docker-sdk-version.log", timeout=900)
    sdk = text.strip().splitlines()[-1] if code == 0 and text.strip() else None
    code, text, _ = run_logged(sdk_cmd + ["dotnet", "build", solution.name, "--nologo"], out_dir, out_dir / "docker-build.log")
    build = {"exit": code, **parse_build_output(text)}
    code, text, secs = run_logged(sdk_cmd + ["dotnet", "test", solution.name, "--nologo"], out_dir, out_dir / "docker-test.log")
    result = {"status": "ran", "image": sdk_image, "sdk": sdk, "build": build,
              "dotnet_test": {"exit": code, "seconds": secs, **parse_test_output(text)}}
    if (src / "app.js").is_file():
        code, _, _ = run_logged(["docker", "run", "--rm", "-v", mount, "-w", "/src", node_image, "node", "--check", "app.js"], out_dir, out_dir / "docker-node.log", timeout=900)
        result["node_check"] = {"status": "pass" if code == 0 else "fail", "image": node_image}
    shutil.rmtree(src, ignore_errors=True)
    return result
