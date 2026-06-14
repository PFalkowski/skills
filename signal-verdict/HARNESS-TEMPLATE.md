# Harness template — the real-data-gated walk-forward verdict

The Phase-3 benchmark harness, as a .NET/NUnit skeleton (adapt the language to your stack — the *shape* is
what matters). Three properties are non-negotiable:

1. **Real data or skip** — connects to the real store; `Assert.Inconclusive` when no connection is
   configured, so CI without DB access passes silently instead of failing or (worse) mocking the verdict.
2. **`[Explicit]` / opt-in category** — never runs in the default suite; you invoke it deliberately.
3. **Deterministic, version-controlled report** — same data + window ⇒ byte-identical markdown, committed.

```csharp
[TestFixture]
[Explicit]                       // opt-in; not in the default suite
[Category("Harness")]            // dotnet test --filter "Category=Harness"
public class MyIdeaHoldoutVerdictHarnessTests
{
    private const string DateFrom = "2024-01-06";
    private const string DateTo   = "2026-06-05";
    private const double TrainFraction = 0.70;   // first 70% select; last 30% = untouched holdout

    [Test]
    public void SelectOnTrain_ConfirmOnHoldout_ProducesVerdict()
    {
        var sp = BuildServiceProvider();
        if (sp == null)
            Assert.Inconclusive("No connection configured — set the env var / user-secrets to run.");

        using var scope = sp.CreateScope();
        // 1) REAL data → replay the production policy → labeled outcomes (deterministic).
        var data     = scope.ServiceProvider.GetRequiredService<IQuotesFilteringService>()
                            .GetFilteredSimulationQuotes(/* window filters */);
        var outcomes = new ReplaySelectionLabeler(data, /* timeService */)
                            .Label(baselineSelector, config, outcomeRule, window);

        // 2) Build the candidate vs baseline daily-return series via the policy backtester.
        var candidate = PolicyBacktester.DailyReturns(outcomes, candidatePolicy);
        var baseline  = PolicyBacktester.DailyReturns(outcomes, baselinePolicy);

        // 3) Chronological split: select on train, confirm ONCE on the untouched holdout.
        var days     = baseline.Select(d => d.DateCest).OrderBy(d => d).ToList();
        var splitAt  = (int)Math.Floor(days.Count * TrainFraction);
        var holdout  = days.Skip(splitAt).ToHashSet();
        IReadOnlyList<double> Sub(IReadOnlyList<DailyReturn> s) =>
            s.Where(d => holdout.Contains(d.DateCest)).OrderBy(d => d.DateCest).Select(d => d.NetReturn).ToList();

        // 4) Verdict stats scaled to EFFECTIVE N: block-bootstrap CI on the paired difference,
        //    deflated Sharpe / PBO via the harness, against a same-skip random baseline.
        var diff = Sub(candidate).Zip(Sub(baseline), (a, b) => a - b).ToList();
        var (ciLow, ciHigh) = BlockBootstrap.MeanCi(diff, 0.95, blockLength: 5, resamples: 2000, seed: 42);
        var ledger = new MultiplicityBudgetLedger();
        ledger.Declare("my-idea", "one line per declared trial");
        var report = PnLHarness.Score(Sub(candidate), ledger, /* trialMatrix for PBO */ null,
                                      new HarnessOptions { Confidence = 0.95 });

        var promote = ciLow > 0 /* && beats same-skip random && survives cost-shock && util floor */;

        // 5) Deterministic markdown report to a version-controlled path.
        File.WriteAllText(ResolveReportPath("my-idea-holdout-verdict.md"),
                          Render(report, ciLow, ciHigh, promote));
        Assert.That(Sub(baseline).Count, Is.GreaterThan(20), "holdout needs enough days to score");
    }

    // Returns null when no connection is configured → the test skips instead of failing/mocking.
    private static ServiceProvider BuildServiceProvider()
    {
        var cfg = new ConfigurationBuilder()
            .AddJsonFile("appsettings.json", optional: true)
            .AddUserSecrets(typeof(SomeAppAssembly).Assembly, optional: true)
            .AddEnvironmentVariables()
            .Build();
        var conn = Environment.GetEnvironmentVariable("MYAPP_CONNSTR");
        if (!string.IsNullOrEmpty(conn)) cfg["DatabaseSettings:ConnectionString"] = conn;
        var settings = new AppSettings(); cfg.Bind(settings);
        if (string.IsNullOrWhiteSpace(settings.ConnectionString)) return null;
        var services = new ServiceCollection(); services.AddMyRuntime(settings);
        return services.BuildServiceProvider();
    }
}
```

## Pure-component test shape (Phase 2)

```csharp
[Test]
public void Analyze_OnHandBuiltFixture_MatchesComputedValues()  // exact expected values, not snapshots
[Test]
public void Feature_ReadsOnlyDMinus1Data_NoDayDLeak()           // leak-safety: assert no traded-day access
[Test]
public void Backtester_AtBaselineConfig_ReproducesIncumbent()   // golden-master parity (byte-identical)
[Test]
public void Model_IsDeterministic_AcrossTwoFits()               // pin seeds; SDCA NumberOfThreads=1
```

## Report sections to emit (so the verdict is self-explaining)

- Header: window, train/holdout sizes, the exact policies compared, "screen vs verdict".
- Selection table (train): the metric each candidate was chosen by + deflated-SR + effective N.
- Confirmation table (holdout): candidate vs baseline Sharpe/ROI.
- The **paired-difference CI** and the **PROMOTE/PARK** line with a one-sentence honest reading.
- Caveats: multiplicity spent, grid-boundary, regime, data-quality.

## Common pitfalls the template guards against
- **Random `TrainTestSplit`** on time-ordered rows → leaked metrics. Use chronological + purge/embargo.
- **`Dictionary<double?>`** keyed by a nullable parameter throws on the null case — key by a label string.
- **Per-run multiplicity only** — `PnLHarness` deflates to the ledger you pass; track cumulative trials
  across the whole effort, or the deflation understates overfit.
- **Working-directory drift** in shell runs — use absolute project paths for `dotnet test`.
