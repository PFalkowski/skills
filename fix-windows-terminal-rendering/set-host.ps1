#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Read, set, or clear the Windows default terminal host (conhost.exe vs Windows Terminal).

.DESCRIPTION
    Windows decides which terminal hosts a newly launched console application from two
    REG_SZ values under HKCU:\Console\%%Startup:

        DelegationConsole   the console-host COM class  (OpenConsole)
        DelegationTerminal  the terminal-window COM class (WindowsTerminal)

    They are a *pair* and hold two DIFFERENT CLSIDs, both published by the Windows Terminal
    package's AppxManifest.xml. Absent (or all-zero) values mean "Let Windows decide", which
    on many machines resolves to legacy conhost.exe — the host whose resize handling smashes
    interactive TUI rows and whose Ctrl+L repaint is unreliable.

    Actions:
      status                  print the current values and the host they resolve to (default)
      apply_windows_terminal  point both values at Windows Terminal
      restore_default         delete both values, handing the choice back to Windows

    Nothing here needs admin rights: the whole key lives in HKCU. Supports -WhatIf.

.PARAMETER Action
    status | apply_windows_terminal | restore_default

.PARAMETER Preview
    With apply_windows_terminal, target Windows Terminal Preview instead of stable.

.PARAMETER Force
    Apply even when the target Windows Terminal package is not installed.

.EXAMPLE
    pwsh -NoProfile -File set-host.ps1 -Action status

.EXAMPLE
    pwsh -NoProfile -File set-host.ps1 -Action apply_windows_terminal
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateSet('status', 'apply_windows_terminal', 'restore_default')]
    [string]$Action = 'status',

    [switch]$Preview,

    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$KeyPath = 'HKCU:\Console\%%Startup'

# CLSIDs as published by the Windows Terminal package manifest (uap3:AppExtension
# com.microsoft.windows.console.host / com.microsoft.windows.terminal.host).
$Hosts = @{
    'Windows Terminal'         = @{
        Package            = 'Microsoft.WindowsTerminal'
        WingetId           = 'Microsoft.WindowsTerminal'
        DelegationConsole  = '{2EACA947-7F5F-4CFA-BA87-8F7FBEEFBE69}'
        DelegationTerminal = '{E12CFF52-A866-4C77-9A90-F570A7AA2C6B}'
    }
    'Windows Terminal Preview' = @{
        Package            = 'Microsoft.WindowsTerminalPreview'
        WingetId           = 'Microsoft.WindowsTerminal.Preview'
        DelegationConsole  = '{06EC847C-C0A5-46B8-92CB-7C92F6E35CD5}'
        DelegationTerminal = '{86633F1F-6454-40EC-89CE-DA4EBA977EE2}'
    }
}

$LetWindowsDecide = '{00000000-0000-0000-0000-000000000000}'

function Get-CurrentDelegation {
    if (-not (Test-Path -LiteralPath $KeyPath)) {
        return [pscustomobject]@{ KeyExists = $false; DelegationConsole = $null; DelegationTerminal = $null }
    }
    $props = Get-ItemProperty -LiteralPath $KeyPath
    [pscustomobject]@{
        KeyExists          = $true
        DelegationConsole  = $props.DelegationConsole
        DelegationTerminal = $props.DelegationTerminal
    }
}

function Resolve-HostName {
    param($Current)

    $console = $Current.DelegationConsole
    $terminal = $Current.DelegationTerminal

    if (-not $console -and -not $terminal) { return 'Let Windows decide (usually legacy conhost.exe)' }
    if ($console -eq $LetWindowsDecide -and $terminal -eq $LetWindowsDecide) {
        return 'Let Windows decide (usually legacy conhost.exe)'
    }

    foreach ($name in $Hosts.Keys) {
        $h = $Hosts[$name]
        if ($console -eq $h.DelegationConsole -and $terminal -eq $h.DelegationTerminal) { return $name }
    }
    return 'Unrecognised / mismatched pair'
}

function Write-Status {
    param([string]$Prefix)

    $current = Get-CurrentDelegation
    $resolved = Resolve-HostName $current

    Write-Host ""
    if ($Prefix) { Write-Host $Prefix }
    Write-Host "  Key                 $KeyPath$(if (-not $current.KeyExists) { '  (does not exist)' })"
    Write-Host "  DelegationConsole   $(if ($current.DelegationConsole) { $current.DelegationConsole } else { '(not set)' })"
    Write-Host "  DelegationTerminal  $(if ($current.DelegationTerminal) { $current.DelegationTerminal } else { '(not set)' })"
    Write-Host "  Resolves to         $resolved"
    Write-Host ""

    return $resolved
}

switch ($Action) {

    'status' {
        Write-Status -Prefix 'Default terminal host:' | Out-Null
    }

    'apply_windows_terminal' {
        $name = if ($Preview) { 'Windows Terminal Preview' } else { 'Windows Terminal' }
        $target = $Hosts[$name]

        $installed = $null
        try { $installed = Get-AppxPackage -Name $target.Package -ErrorAction Stop } catch { }
        if (-not $installed) {
            $msg = "$name ($($target.Package)) is not installed for this user."
            if (-not $Force) {
                throw "$msg Install it (winget install --id $($target.WingetId)) or re-run with -Force to write the values anyway."
            }
            Write-Warning "$msg Writing the values anyway because -Force was passed."
        }

        $before = Write-Status -Prefix 'Before:'

        if ($PSCmdlet.ShouldProcess($KeyPath, "Set DelegationConsole/DelegationTerminal to $name")) {
            if (-not (Test-Path -LiteralPath $KeyPath)) {
                New-Item -Path $KeyPath -Force | Out-Null
            }
            New-ItemProperty -LiteralPath $KeyPath -Name 'DelegationConsole' `
                -Value $target.DelegationConsole -PropertyType String -Force | Out-Null
            New-ItemProperty -LiteralPath $KeyPath -Name 'DelegationTerminal' `
                -Value $target.DelegationTerminal -PropertyType String -Force | Out-Null

            Write-Status -Prefix 'After:' | Out-Null
            if ($before -eq $name) {
                Write-Host "No change needed — already set to $name."
            }
            else {
                Write-Host "Default terminal host set to $name."
                Write-Host "Open a NEW terminal window for it to take effect; existing windows keep their old host."
            }
        }
    }

    'restore_default' {
        Write-Status -Prefix 'Before:' | Out-Null

        if (-not (Test-Path -LiteralPath $KeyPath)) {
            Write-Host "Nothing to undo — $KeyPath does not exist."
            break
        }

        if ($PSCmdlet.ShouldProcess($KeyPath, 'Remove DelegationConsole/DelegationTerminal')) {
            foreach ($prop in 'DelegationConsole', 'DelegationTerminal') {
                if ($null -ne (Get-ItemProperty -LiteralPath $KeyPath).$prop) {
                    Remove-ItemProperty -LiteralPath $KeyPath -Name $prop -Force
                }
            }

            # Drop the key too if this script's two values were all it held, so the undo is clean.
            $remaining = Get-Item -LiteralPath $KeyPath
            if ($remaining.ValueCount -eq 0 -and $remaining.SubKeyCount -eq 0) {
                Remove-Item -LiteralPath $KeyPath -Force
            }

            Write-Status -Prefix 'After:' | Out-Null
            Write-Host "Reverted — Windows now picks the host itself. Open a NEW terminal window to see it."
        }
    }
}
