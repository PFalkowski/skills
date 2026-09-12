#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Registers the wip:// URL protocol so a published board's Resume button can launch `wip <n>`
  directly, instead of only copying it to the clipboard.

.DESCRIPTION
  Windows only, user-scope, no admin required — writes solely under
  HKEY_CURRENT_USER\Software\Classes\wip. One-time and entirely opt-in: nothing else in this
  skill runs this for you. Run unregister-protocol.ps1 to remove it again.

  The browser still confirms the first time it opens a protocol it has not seen before ("Open
  PowerShell?" or similar); some browsers let you check "always allow" so it stops asking.
#>
[CmdletBinding()]
param()

if ($PSVersionTable.Platform -and $PSVersionTable.Platform -ne 'Win32NT') {
    Write-Error "register-protocol.ps1 registers a Windows registry protocol handler; this is not Windows."
    exit 1
}

$handlerPath = Join-Path $PSScriptRoot 'protocol-handler.ps1'

$exe = Get-Command pwsh.exe -ErrorAction SilentlyContinue
if (-not $exe) { $exe = Get-Command powershell.exe }

$command = '"' + $exe.Source + '" -NoProfile -WindowStyle Hidden -File "' + $handlerPath + '" "%1"'

New-Item -Path 'HKCU:\Software\Classes\wip' -Force | Out-Null
New-ItemProperty -Path 'HKCU:\Software\Classes\wip' -Name '(default)' -Value 'URL:wip protocol' -PropertyType String -Force | Out-Null
New-ItemProperty -Path 'HKCU:\Software\Classes\wip' -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path 'HKCU:\Software\Classes\wip\shell\open\command' -Force | Out-Null
New-ItemProperty -Path 'HKCU:\Software\Classes\wip\shell\open\command' -Name '(default)' -Value $command -PropertyType String -Force | Out-Null

Write-Host "Registered wip:// -> $handlerPath"
Write-Host "Test it:   Start-Process 'wip://1'"
Write-Host "Remove it: pwsh -NoProfile -File `"$PSScriptRoot\unregister-protocol.ps1`""
