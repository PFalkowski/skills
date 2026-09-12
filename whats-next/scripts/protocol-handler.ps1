#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Handles a wip://<n> link by opening a new terminal running `wip <n>` there.

.DESCRIPTION
  Not meant to be run by hand — register-protocol.ps1 points the wip:// protocol at this script,
  and Windows invokes it with the full URI as its one argument (e.g. "wip://46" or "wip://46/",
  the trailing slash depends on the browser). It pulls the item number out of that string and
  starts a new, visible console running wip.ps1 against it, since the point is an interactive
  session, not a background task.
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)][string]$Uri
)

$n = [regex]::Match($Uri, '\d+').Value
if (-not $n) {
    Write-Error "wip protocol handler: no item number found in '$Uri'"
    exit 1
}

$wipScript = Join-Path $PSScriptRoot 'wip.ps1'

$exe = Get-Command pwsh.exe -ErrorAction SilentlyContinue
if (-not $exe) { $exe = Get-Command powershell.exe }

$argString = '-NoExit -NoProfile -File "' + $wipScript + '" ' + $n
Start-Process -FilePath $exe.Source -ArgumentList $argString
