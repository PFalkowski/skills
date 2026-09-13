Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$stateRoot = if ($env:AGENTS_STATE) { Join-Path $env:AGENTS_STATE 'whats-next' } else { Join-Path $HOME '.agent-state/whats-next' }
$binRoot = Join-Path $stateRoot 'bin'
$repoRoot = Split-Path -Parent $PSScriptRoot
$srcRoot = Join-Path $repoRoot 'src/WhatsNext'
$projectPath = $srcRoot

function Get-SourceHash {
    $files = @(Get-ChildItem -Path $srcRoot -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/](bin|obj)[\\/]' })
    $files += Get-Item -LiteralPath (Join-Path $repoRoot 'Directory.Build.props')
    $files = $files | Sort-Object { $_.FullName.Substring($repoRoot.Length + 1).Replace('\', '/') }
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $stream = New-Object System.IO.MemoryStream
        try {
            $writer = New-Object System.IO.StreamWriter($stream, [System.Text.Encoding]::UTF8, 4096, $true)
            foreach ($file in $files) {
                $relativePath = $file.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
                $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
                $writer.Write($relativePath)
                $writer.Write("`n")
                $writer.Write($bytes.Length)
                $writer.Write("`n")
                $writer.Flush()
                $stream.Write($bytes, 0, $bytes.Length)
            }
            $writer.Flush()
        }
        finally {
            $writer.Dispose()
        }
        $stream.Position = 0
        ($sha256.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) -join ''
    }
    finally {
        $sha256.Dispose()
    }
}

function Publish-WhatsNext {
    param([string]$Hash)

    New-Item -ItemType Directory -Path $binRoot -Force | Out-Null
    $lockPath = Join-Path $binRoot "$Hash.lock"

    $waited = $false
    $deadline = (Get-Date).AddSeconds(60)
    $lockStream = $null
    while ($true) {
        try {
            $lockStream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
            break
        }
        catch [System.IO.IOException] {
            if (-not $waited) {
                'Another wip build is already in progress, waiting...'
                $waited = $true
            }
            if ((Get-Date) -ge $deadline) {
                'Timed out waiting for another wip build to finish; run wip again'
                exit 1
            }
            Start-Sleep -Milliseconds 200
        }
    }

    try {
        if ($waited) {
            $marker = Join-Path $binRoot 'current.marker'
            if ((Test-Path -LiteralPath $marker) -and (Get-Content -LiteralPath $marker -Raw) -eq $Hash) {
                return
            }
        }

        $outDir = Join-Path $binRoot $Hash
        & dotnet publish $projectPath -c Release -o $outDir
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }

        $marker = Join-Path $binRoot 'current.marker'
        $tempMarker = "$marker.tmp"
        Set-Content -LiteralPath $tempMarker -Value $Hash -NoNewline
        Move-Item -LiteralPath $tempMarker -Destination $marker -Force

        Get-ChildItem -Path $binRoot -Directory | Where-Object { $_.Name -ne $Hash } | Remove-Item -Recurse -Force
    }
    finally {
        $lockStream.Dispose()
    }
}

$sdks = & dotnet --list-sdks
if (-not ($sdks | Where-Object { $_.Split(' ')[0].StartsWith('10.') })) {
    '.NET 10 SDK not found. Install it from https://dotnet.microsoft.com/download/dotnet/10.0 and try again.'
    exit 1
}

$hash = Get-SourceHash
$marker = Join-Path $binRoot 'current.marker'
$dllPath = Join-Path $binRoot "$hash/WhatsNext.dll"
$upToDate = (Test-Path -LiteralPath $marker) -and (Get-Content -LiteralPath $marker -Raw) -eq $hash -and (Test-Path -LiteralPath $dllPath)
if (-not $upToDate) {
    Publish-WhatsNext -Hash $hash
}

$env:WIP_LAUNCHER = $PSCommandPath
& dotnet $dllPath @args
exit $LASTEXITCODE
