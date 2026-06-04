param(
    [switch]$Release
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$profile = if ($Release) { "release" } else { "debug" }
$cargoArgs = @("build")

if ($Release) {
    $cargoArgs += "--release"
}

function Test-FileLocked {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $false
    }

    try {
        $stream = [System.IO.File]::Open($Path, "Open", "ReadWrite", "None")
        $stream.Dispose()
        return $false
    }
    catch [System.IO.IOException] {
        return $true
    }
}

function Get-LikelyLockingProcesses {
    param([Parameter(Mandatory = $true)][string]$Path)

    $pathFileName = [System.IO.Path]::GetFileName($Path)
    if ([string]::IsNullOrWhiteSpace($pathFileName)) {
        return @()
    }

    Get-Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ProcessName -in @("LeagueClientUx", "LeagueClient", "RiotClientServices", "maoloader", "core") -or
            ($_.Path -and ([System.IO.Path]::GetFileName($_.Path) -eq $pathFileName))
        } |
        Sort-Object ProcessName, Id |
        ForEach-Object { "$($_.ProcessName)($($_.Id))" }
}

function Copy-CoreDll {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $destinationDir = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null

    try {
        Copy-Item -Force -Path $Source -Destination $Destination -ErrorAction Stop
        Write-Output "Copied $Source to $Destination"
        return $true
    }
    catch [System.IO.IOException] {
        $lockingProcesses = Get-LikelyLockingProcesses -Path $Destination
        $processText = if ($lockingProcesses.Count -gt 0) {
            " Likely locking processes: $($lockingProcesses -join ', ')."
        } else {
            ""
        }

        Write-Warning "Skipped copying $Destination because it is currently in use.$processText"
        return $false
    }
    catch {
        if (Test-FileLocked -Path $Destination) {
            $lockingProcesses = Get-LikelyLockingProcesses -Path $Destination
            $processText = if ($lockingProcesses.Count -gt 0) {
                " Likely locking processes: $($lockingProcesses -join ', ')."
            } else {
                ""
            }

            Write-Warning "Skipped copying $Destination because it is currently in use.$processText"
            return $false
        }

        throw
    }
}

Push-Location (Join-Path $repo "dll")
try {
    cargo @cargoArgs
}
finally {
    Pop-Location
}

$source = Join-Path $repo "dll\target\$profile\core.dll"
$destinations = @(
    (Join-Path $repo "app\src-tauri\bin\core.dll"),
    (Join-Path $repo "app\bin\core.dll")
)

$copied = 0
$skipped = 0

foreach ($dest in $destinations) {
    if (Copy-CoreDll -Source $source -Destination $dest) {
        $copied += 1
    } else {
        $skipped += 1
    }
}

if ($skipped -gt 0) {
    Write-Warning "Built core.dll, but skipped $skipped locked destination(s). Close League/maoloader and rerun the script to update those files."
}

if ($copied -eq 0 -and $skipped -gt 0) {
    Write-Warning "No destinations were updated because every existing destination was locked."
}
