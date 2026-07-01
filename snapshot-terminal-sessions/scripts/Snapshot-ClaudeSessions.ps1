<#
.SYNOPSIS
  Snapshots currently-open Windows Terminal tabs running Claude Code (and claude-monitor)
  sessions, and writes a `wt`-based .ps1 that recreates the layout with sessions resumed.

.DESCRIPTION
  Windows Terminal does not expose live tab/pane state to any API or cmdlet, and its
  state.json persisted-layout feature only flushes on window close (and only if the
  user opted in) - so it can't be used as a live snapshot source. This script instead
  walks the OS process tree: it finds claude.exe / claude-monitor.exe processes whose
  ancestry traces back to WindowsTerminal.exe, and reads each one's actual current
  working directory directly out of its PEB (Process Environment Block) via
  NtQueryInformationProcess + ReadProcessMemory - the only way to get another
  process's cwd on Windows without an agent already running inside it.

  Tab/pane topology beyond a claude <-> claude-monitor pairing in the same directory
  is NOT recoverable from OS state (Windows Terminal doesn't expose which processes
  share a tab vs. sit in separate tabs) - each Claude session becomes its own tab,
  and a claude-monitor with a matching cwd is attached as a split pane, matching the
  most common real usage pattern. Anything more exotic won't round-trip; hand-edit
  the generated script if needed.

.PARAMETER OutputPath
  Where to write the recreation script. Defaults to $HOME\scripts\reopen-claude-sessions.ps1
  (deliberately not the same name as any hand-written template, so this never clobbers one).

.OUTPUTS
  Writes the recreation .ps1 to -OutputPath and prints a summary of what was found.
#>
[CmdletBinding()]
param(
    [string]$OutputPath = (Join-Path $HOME 'scripts\reopen-claude-sessions.ps1')
)

# --- PEB-based current-working-directory reader -----------------------------------------
# No Win32 API or WMI class exposes another process's cwd. This reads it straight out of
# the target process's PEB: PEB+0x20 -> RTL_USER_PROCESS_PARAMETERS, whose
# CurrentDirectory.DosPath (a UNICODE_STRING: 2-byte Length, 2-byte MaxLength, 8-byte
# Buffer pointer) sits at +0x38 on x64. Requires PROCESS_QUERY_INFORMATION | PROCESS_VM_READ
# on a same-bitness, same-user process - no admin rights needed for that case.
Add-Type -Namespace Native -Name ProcCwd -MemberDefinition @'
[DllImport("ntdll.dll")]
public static extern int NtQueryInformationProcess(IntPtr hProcess, int infoClass, ref PROCESS_BASIC_INFORMATION info, int size, out int retLen);
[DllImport("kernel32.dll", SetLastError = true)]
public static extern IntPtr OpenProcess(int access, bool inherit, int pid);
[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr baseAddr, byte[] buffer, int size, out IntPtr bytesRead);
[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool CloseHandle(IntPtr h);
[StructLayout(LayoutKind.Sequential)]
public struct PROCESS_BASIC_INFORMATION {
    public IntPtr Reserved1; public IntPtr PebBaseAddress; public IntPtr Reserved2_0;
    public IntPtr Reserved2_1; public IntPtr UniqueProcessId; public IntPtr Reserved3;
}
'@ -ErrorAction SilentlyContinue

function Get-ProcessCurrentDirectory {
    param([int]$ProcessId)
    $PROCESS_QUERY_INFORMATION = 0x0400
    $PROCESS_VM_READ = 0x0010
    $hProcess = [Native.ProcCwd]::OpenProcess($PROCESS_QUERY_INFORMATION -bor $PROCESS_VM_READ, $false, $ProcessId)
    if ($hProcess -eq [IntPtr]::Zero) { return $null }
    try {
        $pbi = New-Object Native.ProcCwd+PROCESS_BASIC_INFORMATION
        $retLen = 0
        $status = [Native.ProcCwd]::NtQueryInformationProcess($hProcess, 0, [ref]$pbi, [System.Runtime.InteropServices.Marshal]::SizeOf($pbi), [ref]$retLen)
        if ($status -ne 0) { return $null }

        $pebBuf = New-Object byte[] 0x28
        $bytesRead = [IntPtr]::Zero
        if (-not [Native.ProcCwd]::ReadProcessMemory($hProcess, $pbi.PebBaseAddress, $pebBuf, $pebBuf.Length, [ref]$bytesRead)) { return $null }
        $processParamsAddr = [BitConverter]::ToInt64($pebBuf, 0x20)

        $paramsBuf = New-Object byte[] 0x60
        if (-not [Native.ProcCwd]::ReadProcessMemory($hProcess, [IntPtr]$processParamsAddr, $paramsBuf, $paramsBuf.Length, [ref]$bytesRead)) { return $null }
        $curDirOffset = 0x38
        $length = [BitConverter]::ToUInt16($paramsBuf, $curDirOffset)
        if ($length -le 0 -or $length -gt 0x400) { return $null }
        $bufferAddr = [BitConverter]::ToInt64($paramsBuf, $curDirOffset + 8)

        $strBuf = New-Object byte[] $length
        if (-not [Native.ProcCwd]::ReadProcessMemory($hProcess, [IntPtr]$bufferAddr, $strBuf, $length, [ref]$bytesRead)) { return $null }
        return ([System.Text.Encoding]::Unicode.GetString($strBuf)).TrimEnd('\')
    } finally {
        [Native.ProcCwd]::CloseHandle($hProcess) | Out-Null
    }
}

# --- Resolve exact session IDs when two+ live sessions share a directory ----------------
# `claude --continue` resumes "the most recent conversation in this directory" - fine for
# one live session, ambiguous for two. Claude Code stores each session as a .jsonl under
# ~/.claude/projects/<cwd with `:`/`\` replaced by `-`>/<session-id>.jsonl. A freshly
# started (non-resumed) session creates its .jsonl within seconds of the process starting,
# so process-start-time vs. file-creation-time proximity gives a high-confidence match.
# A resumed session's file predates the process by a lot, so as a second pass, if exactly
# one process and exactly one recently-touched file remain unclaimed, pair them by
# elimination. Anything still ambiguous after that is left unresolved (falls back to the
# interactive `claude --resume` picker) rather than guessing.
function Get-ClaudeProjectDir {
    param([string]$Cwd)
    $encoded = $Cwd.TrimEnd('\') -replace '[:\\]', '-'
    return Join-Path $HOME ".claude\projects\$encoded"
}

function Resolve-SessionIdsForDuplicateCwd {
    param([array]$SessionsInGroup)
    $result = @{}
    $projectDir = Get-ClaudeProjectDir -Cwd $SessionsInGroup[0].Cwd
    if (-not (Test-Path $projectDir)) { return $result }
    $files = @(Get-ChildItem -Path $projectDir -Filter '*.jsonl' -ErrorAction SilentlyContinue)
    if ($files.Count -eq 0) { return $result }
    $claimed = [System.Collections.Generic.HashSet[string]]::new()

    foreach ($s in $SessionsInGroup) {
        $candidate = $files | Where-Object {
            -not $claimed.Contains($_.FullName) -and
            $_.CreationTime -ge $s.CreationDate -and
            ($_.CreationTime - $s.CreationDate).TotalSeconds -le 120
        } | Sort-Object CreationTime | Select-Object -First 1
        if ($candidate) {
            $result[$s.ProcessId] = [System.IO.Path]::GetFileNameWithoutExtension($candidate.Name)
            $claimed.Add($candidate.FullName) | Out-Null
        }
    }

    # Tight window on purpose: a file touched hours ago is more likely a past, now-closed
    # session (as opposed to the other live one in this group) than the currently-open idle
    # session sitting in the remaining tab - widening this trades precision for reach.
    $unmatched = @($SessionsInGroup | Where-Object { -not $result.ContainsKey($_.ProcessId) })
    $recentUnclaimed = @($files | Where-Object { -not $claimed.Contains($_.FullName) -and $_.LastWriteTime -ge (Get-Date).AddHours(-2) })
    if ($unmatched.Count -eq 1 -and $recentUnclaimed.Count -eq 1) {
        $result[$unmatched[0].ProcessId] = [System.IO.Path]::GetFileNameWithoutExtension($recentUnclaimed[0].Name)
    }

    return $result
}

# --- Find which top-level app a process ultimately descends from ------------------------
function Test-DescendsFromWindowsTerminal {
    param([hashtable]$ProcessesById, [int]$ProcessId)
    $seen = [System.Collections.Generic.HashSet[int]]::new()
    $current = [int]$ProcessId
    while ($current -and $ProcessesById.ContainsKey($current) -and $seen.Add($current)) {
        $proc = $ProcessesById[$current]
        if ($proc.Name -eq 'WindowsTerminal.exe') { return $true }
        $current = [int]$proc.ParentProcessId
    }
    return $false
}

# --- Enumerate processes ------------------------------------------------------------------
$allProcs = Get-CimInstance Win32_Process
$byId = @{}
foreach ($p in $allProcs) { $byId[[int]$p.ProcessId] = $p }

$claudeProcs = $allProcs | Where-Object { $_.Name -eq 'claude.exe' }
$monitorProcs = $allProcs | Where-Object { $_.Name -eq 'claude-monitor.exe' }

$sessions = @()
$skippedNonWt = 0
foreach ($p in $claudeProcs) {
    if (-not (Test-DescendsFromWindowsTerminal -ProcessesById $byId -ProcessId $p.ProcessId)) {
        $skippedNonWt++
        continue
    }
    $cwd = Get-ProcessCurrentDirectory -ProcessId $p.ProcessId
    if (-not $cwd) { continue }
    $sessions += [pscustomobject]@{ ProcessId = $p.ProcessId; Cwd = $cwd; Monitor = $null; CreationDate = $p.CreationDate }
}

foreach ($m in $monitorProcs) {
    if (-not (Test-DescendsFromWindowsTerminal -ProcessesById $byId -ProcessId $m.ProcessId)) { continue }
    $cwd = Get-ProcessCurrentDirectory -ProcessId $m.ProcessId
    if (-not $cwd) { continue }
    $match = $sessions | Where-Object { $_.Cwd -eq $cwd -and -not $_.Monitor } | Select-Object -First 1
    if ($match) {
        $match.Monitor = $m.ProcessId
    } else {
        $sessions += [pscustomobject]@{ ProcessId = $null; Cwd = $cwd; Monitor = $m.ProcessId; CreationDate = $null }
    }
}

if ($sessions.Count -eq 0) {
    Write-Output "No Claude Code sessions found running under Windows Terminal."
    if ($skippedNonWt -gt 0) {
        Write-Output "($skippedNonWt claude.exe process(es) found, but not hosted under Windows Terminal - skipped.)"
    }
    return
}

# Duplicate cwds mean multiple concurrent sessions in the same directory - `claude --continue`
# can't tell them apart (it just resumes the most recent one). Try to resolve the exact
# session id per process first; only fall back to the interactive `claude --resume` picker
# for whichever ones stay genuinely ambiguous.
$cwdCountMap = @{}
$sessions | Group-Object Cwd | ForEach-Object { $cwdCountMap[$_.Name] = $_.Count }

$sessionIdMap = @{}
foreach ($grp in ($sessions | Where-Object { $_.ProcessId } | Group-Object Cwd)) {
    if ($grp.Count -gt 1) {
        $resolved = Resolve-SessionIdsForDuplicateCwd -SessionsInGroup $grp.Group
        foreach ($k in $resolved.Keys) { $sessionIdMap[$k] = $resolved[$k] }
    }
}

# --- Build the wt command ------------------------------------------------------------------
$usedTitles = @{}
$actions = @()
foreach ($s in $sessions) {
    $leaf = Split-Path -Path $s.Cwd -Leaf
    $title = $leaf
    if ($usedTitles.ContainsKey($title)) {
        $usedTitles[$title]++
        $title = "$leaf ($($usedTitles[$leaf]))"
    } else {
        $usedTitles[$title] = 1
    }

    if ($cwdCountMap[$s.Cwd] -gt 1) {
        $resumeFlag = if ($s.ProcessId -and $sessionIdMap.ContainsKey($s.ProcessId)) { "--resume $($sessionIdMap[$s.ProcessId])" } else { '--resume' }
    } else {
        $resumeFlag = '--continue'
    }
    $actions += "new-tab --title `"$title`" -d `"$($s.Cwd)`" pwsh -NoExit -Command `"claude $resumeFlag`""

    if ($s.Monitor) {
        $actions += "split-pane --title `"Monitor`" -d `"$($s.Cwd)`" --size 0.5 pwsh -NoExit -Command `"claude-monitor`""
    }
}

$wtCommand = "wt " + ($actions -join ' `; ')

# --- Write the recreation script ------------------------------------------------------------
$outDir = Split-Path -Path $OutputPath -Parent
if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$header = @"
# Regenerated by snapshot-terminal-sessions on $(Get-Date -Format 'yyyy-MM-dd HH:mm')
# Recreates the Windows Terminal tabs that were open when this snapshot was taken.
# NOTE: pane/tab topology beyond a claude<->claude-monitor pairing per directory can't be
# recovered from OS state - this is one tab per detected session, hand-edit for anything fancier.
"@

Set-Content -Path $OutputPath -Value "$header`n`n$wtCommand`n" -Encoding utf8

# --- Report -----------------------------------------------------------------------------
Write-Output "Found $($sessions.Count) Claude session(s) under Windows Terminal:"
foreach ($s in $sessions) {
    $tag = if ($s.Monitor) { " + monitor" } else { "" }
    if ($cwdCountMap[$s.Cwd] -gt 1) {
        $flag = if ($s.ProcessId -and $sessionIdMap.ContainsKey($s.ProcessId)) { "resolved to session $($sessionIdMap[$s.ProcessId])" } else { "resume-picker (couldn't disambiguate)" }
    } else {
        $flag = "continue"
    }
    Write-Output "  - $($s.Cwd)$tag [$flag]"
}
if ($skippedNonWt -gt 0) {
    Write-Output "Skipped $skippedNonWt claude.exe process(es) not hosted under Windows Terminal."
}
Write-Output "Wrote recreation script to $OutputPath"
