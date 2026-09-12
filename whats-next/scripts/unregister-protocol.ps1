#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Removes the wip:// URL protocol registration made by register-protocol.ps1.
#>
[CmdletBinding()]
param()

Remove-Item -Path 'HKCU:\Software\Classes\wip' -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Removed the wip:// protocol registration."
