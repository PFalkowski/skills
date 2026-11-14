#!/usr/bin/env python3
"""Build the frozen prompt for one batch of the unslop A-B suite.

Usage:
  prompt.py --batch K --out-dir DIR [--skill SKILL.md] [--split test|dev]

Prints the prompt to stdout. With --skill the prompt is a skill arm (A or B);
without it, the control. Only each passage's id and text reach the prompt.
Batches are fixed: passages in file order, 5 per batch, K counted from 1.
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BATCH_SIZE = 5

SKILL_PREAMBLE = "The following skill applies to this task. Follow it.\n\n<skill>\n{skill}\n</skill>\n\n"

TASK = """Remove AI writing patterns from each passage below so it sounds human. Keep the meaning, the intended tone and the format of each passage (Markdown stays Markdown). Keep every number, unit, version, name, identifier, path and date exactly as written. Do not add facts.

Write each edited passage, and nothing else, to its own file: {out_dir}/<id>.md, where <id> is the passage's id. Write no other files. Do not put a preface, notes or a summary in the files.
"""


def batches(split):
    data = json.loads((HERE / "passages.json").read_text(encoding="utf-8"))
    chosen = [p for p in data["passages"] if p["split"] == split]
    return [chosen[i:i + BATCH_SIZE] for i in range(0, len(chosen), BATCH_SIZE)]


def build(batch, out_dir, skill_text=None):
    passages = "\n".join(f'<passage id="{p["id"]}">\n{p["text"]}</passage>\n' for p in batch)
    head = SKILL_PREAMBLE.format(skill=skill_text.rstrip("\n")) if skill_text is not None else ""
    return head + TASK.format(out_dir=out_dir) + "\n" + passages


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--batch", type=int, required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--skill")
    parser.add_argument("--split", choices=["test", "dev"], default="test")
    args = parser.parse_args(argv)
    all_batches = batches(args.split)
    if not 1 <= args.batch <= len(all_batches):
        print(f"batch must be 1..{len(all_batches)}", file=sys.stderr)
        return 1
    skill = Path(args.skill).read_text(encoding="utf-8") if args.skill else None
    sys.stdout.write(build(all_batches[args.batch - 1], args.out_dir, skill))
    return 0


if __name__ == "__main__":
    sys.exit(main())
