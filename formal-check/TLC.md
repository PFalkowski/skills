# Running TLC

TLA+ is a language for describing how a system moves from state to state. TLC is its model
checker: it walks every reachable state of a small model and checks each invariant in each one.
These are the only TLC commands formal-check uses. [tlc-example.test.sh](tlc-example.test.sh)
runs the same URL, digest and `java` line on the worked example, and fails if this file stops
holding them word for word.

## Get the pinned jar

TLC needs `java` on PATH. This file states no minimum Java version.

1. Make a fresh work folder outside the tree: `work=$(mktemp -d)`
   ([mktemp](https://www.gnu.org/software/coreutils/manual/html_node/mktemp-invocation.html)).
   The folder stays in the system temp folder after the run. It holds the jar, about 2.2 MB
   (2,274,532 bytes), and one folder per model run. Remove it when you no longer need it.
2. Download TLC v1.7.4 into it
   ([curl](https://curl.se/docs/manpage.html): `-f` fails on an HTTP error, `-sS` hides progress
   but shows errors, `-L` follows redirects, `--retry 3` retries transient failures):

   ```bash
   curl -fsSL --retry 3 -o "$work/tla2tools.jar" https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar
   ```

3. Before any use, check that its SHA-256 digest is
   `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`. Use `sha256sum`
   ([GNU coreutils](https://www.gnu.org/software/coreutils/manual/html_node/sha2-utilities.html));
   where it is missing, use `shasum -a 256` ([shasum](https://perldoc.perl.org/shasum)). On a
   mismatch, stop and report both digests. Never run a jar whose digest you did not check.

## Run a model

Run each model in its own new folder, `run=$(mktemp -d "$work/run.XXXXXX")`. Copy the module and
its config file into it with `cp`, change into it, and run:

```bash
java -Djava.io.tmpdir="$run" -cp "$work/tla2tools.jar" tlc2.TLC -workers 1 -metadir "$run/meta" -config <M>.cfg <M>.tla
```

`<M>` is the module name. `-metadir` keeps TLC's state files in the run folder: without it TLC
writes them next to the spec, in a `states` folder (the `-metadir` usage text in
[TLC.java at v1.7.4](https://github.com/tlaplus/tlaplus/blob/v1.7.4/tlatools/org.lamport.tlatools/src/tlc2/TLC.java):
"defaults to SPEC-directory/states"). TLC also unpacks its standard modules into
`java.io.tmpdir`, so that points at the run folder too.

## Exit codes

- **0**: no error. The worked example's test checks this on `LeaseAtomic`.
- **12**: an invariant failed. The output holds `Invariant <name> is violated.` The full line
  starts with `Error: `, so match it as a substring. The test checks both on `LeaseRace`.
- **11**: a deadlock was reached, a state with no successor.
- **150**: the spec failed to parse or has a semantic error.

The codes 11 and 150 are not run by the test. They come from the `ExitStatus` class in
[EC.java at v1.7.4](https://github.com/tlaplus/tlaplus/blob/v1.7.4/tlatools/org.lamport.tlatools/src/tlc2/output/EC.java#L305-L320):
`SUCCESS = 0`, `VIOLATION_ASSUMPTION = 10`, `VIOLATION_DEADLOCK = VIOLATION_ASSUMPTION + 1`,
`VIOLATION_SAFETY = VIOLATION_DEADLOCK + 1` and `ERROR_SPEC_PARSE = 150`. Treat any code other
than 0 or a reported invariant failure as a broken check, not a result.

## Deadlock

TLC checks for deadlock by default, so a model with a state that has no next step exits 11. Give
every reachable state a successor, or put `CHECK_DEADLOCK FALSE` in the config file and cite the
code line that makes the end state real. Sources: the `-deadlock` usage text in TLC.java at v1.7.4
("the same as setting CHECK_DEADLOCK to FALSE in config file") and the `CHECK_DEADLOCK` keyword in
[ModelConfig.java at v1.7.4](https://github.com/tlaplus/tlaplus/blob/v1.7.4/tlatools/org.lamport.tlatools/src/tlc2/tool/impl/ModelConfig.java).

In `LeaseAtomic` every reachable state has a successor: a holder can release, and with no holder
an idle worker can acquire. That is why it exits 0 and not 11.

## Read a failure

The error line names the invariant. The trace after it lists the states in order, from the first
state to the one that breaks the invariant. Tell it as a short list of steps in the code's words,
using the path:line each action cites. This file makes no claim about the trace's exact layout.

In the worked example, `LeaseRace` splits taking the lease into two steps, `Check` and `Take`.
Both workers can pass `Check` while nobody holds the lease, then both `Take` it, so two workers
hold it at once. `LeaseAtomic` makes check and take one step, `Acquire`, and the bad order is
gone. The example has no code under it; a real model cites path:line on every action.
