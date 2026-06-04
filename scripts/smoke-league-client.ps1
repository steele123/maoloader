param(
    [string]$LeagueDir,
    [switch]$Activate,
    [switch]$Launch,
    [switch]$Cleanup,
    [switch]$KeepConfig,
    [int]$WaitSeconds = 45
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$appBin = Join-Path $repo "app\bin"
$configPath = Join-Path $appBin "config"
$corePath = Join-Path $appBin "core.dll"
$tracePath = Join-Path $appBin "diagnostics\core-trace.log"
$traceLatestPath = Join-Path $appBin "diagnostics\latest.json"
$traceRotatedPath = Join-Path $appBin "diagnostics\core-trace.1.log"
$debugApp = Join-Path $repo "app\src-tauri\target\debug\maoloader.exe"
$leagueManifest = "C:\ProgramData\Riot Games\RiotClientInstalls.json"

function Resolve-LeagueDir {
    param([string]$Requested)

    if ($Requested) {
        return (Resolve-Path $Requested -ErrorAction Stop).Path
    }

    if (Test-Path $leagueManifest) {
        $manifest = Get-Content $leagueManifest -Raw | ConvertFrom-Json
        $associated = $manifest.associated_client.PSObject.Properties.Name
        $liveCandidates = @($associated | Where-Object { $_ -notmatch "\(PBE\)" })
        $pbeCandidates = @($associated | Where-Object { $_ -match "\(PBE\)" })

        foreach ($candidate in @($liveCandidates + $pbeCandidates)) {
            $trimmed = $candidate.TrimEnd("\", "/")
            if (Test-Path (Join-Path $trimmed "LeagueClientUx.exe")) {
                return (Resolve-Path $trimmed -ErrorAction Stop).Path
            }
        }
    }

    $default = "C:\Riot Games\League of Legends"
    if (Test-Path (Join-Path $default "LeagueClientUx.exe")) {
        return (Resolve-Path $default -ErrorAction Stop).Path
    }

    throw "Could not find a League directory containing LeagueClientUx.exe."
}

function Write-SmokeConfig {
    param([string]$ResolvedLeagueDir)

    New-Item -ItemType Directory -Force -Path $appBin | Out-Null
    $tomlLeagueDir = ConvertTo-TomlString $ResolvedLeagueDir

    @"
[app]
language = "en"
plugins_dir = ""
league_dir = $tomlLeagueDir
disabled_plugins = ""
activation_mode = "targeted"

[client]
use_hotkeys = true
optimized_client = true
silent_mode = false
super_potato = false
isecure_mode = false
insecure_mode = false
use_devtools = true
use_riotclient = false
use_proxy = false
debug_port = 2999
"@ | Set-Content -Encoding UTF8 -Path $configPath
}

function ConvertTo-TomlString {
    param([string]$Value)

    $escaped = $Value.Replace("\", "\\").Replace('"', '\"')
    return '"' + $escaped + '"'
}

function Invoke-ActivationCommand {
    param(
        [string]$Action,
        [switch]$Symlink
    )

    if (-not (Test-Path $debugApp)) {
        Push-Location (Join-Path $repo "app\src-tauri")
        try {
            cargo build
        }
        finally {
            Pop-Location
        }
    }

    $args = @($Action)
    if ($Symlink) {
        $args += "--symlink"
    }

    $process = Start-Process -FilePath $debugApp -ArgumentList $args -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "$debugApp $($args -join ' ') failed with exit code $($process.ExitCode)"
    }
}

function Test-MaoloaderSymlink {
    param([string]$ResolvedLeagueDir)

    $link = Join-Path $ResolvedLeagueDir "version.dll"
    if (-not (Test-Path -LiteralPath $link)) {
        return $false
    }

    $item = Get-Item -LiteralPath $link -Force
    if ($item.LinkType -ne "SymbolicLink") {
        throw "$link exists but is not a symlink."
    }

    $target = Resolve-Path $item.Target -ErrorAction Stop
    $expected = Resolve-Path $corePath -ErrorAction Stop
    if ($target.Path -ne $expected.Path) {
        throw "$link points to $($target.Path), expected $($expected.Path)."
    }

    return $true
}

function Stop-LeagueProcesses {
    Get-Process | Where-Object {
        $_.ProcessName -like "League*" -or $_.ProcessName -like "Riot*"
    } | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Get-LeagueProcesses {
    @(Get-Process | Where-Object {
        $_.ProcessName -like "League*" -or $_.ProcessName -like "Riot*"
    } | Select-Object ProcessName, Id, Path)
}

function Read-CoreTrace {
    if (-not (Test-Path $tracePath)) {
        return @()
    }

    @(Get-Content $tracePath | Where-Object { $_.Trim() })
}

$resolvedLeagueDir = Resolve-LeagueDir $LeagueDir
$linkPath = Join-Path $resolvedLeagueDir "version.dll"
$backupPath = $null
if (Test-Path $configPath) {
    $backupPath = "$configPath.maoloader-smoke.bak"
    Copy-Item -Force -Path $configPath -Destination $backupPath
}

try {
    & (Join-Path $PSScriptRoot "build-core.ps1")
    & (Join-Path $PSScriptRoot "check-core-exports.ps1") -DllPath $corePath | Out-Host
    Remove-Item -Force $tracePath -ErrorAction SilentlyContinue
    Remove-Item -Force $traceLatestPath -ErrorAction SilentlyContinue
    Remove-Item -Force $traceRotatedPath -ErrorAction SilentlyContinue

    if (Test-Path -LiteralPath $linkPath) {
        $item = Get-Item -LiteralPath $linkPath -Force
        if ($item.LinkType -ne "SymbolicLink") {
            throw "$linkPath already exists and is not a maoloader symlink."
        }
    }

    Write-SmokeConfig $resolvedLeagueDir

    $result = [ordered]@{
        LeagueDir       = $resolvedLeagueDir
        CorePath        = (Resolve-Path $corePath).Path
        ConfigPath      = (Resolve-Path $configPath).Path
        TracePath       = $tracePath
        TraceLatest     = $traceLatestPath
        ActivationMode  = "targeted"
        LinkPath        = $linkPath
        Activated       = $false
        Launched        = $false
        LeagueProcesses = @()
        TraceRecords    = @()
    }

    if ($Cleanup) {
        Invoke-ActivationCommand "--uninstall" -Symlink
        Stop-LeagueProcesses
        $result.Activated = $false
    } elseif ($Activate) {
        $running = Get-LeagueProcesses
        if ($running.Count -gt 0) {
            throw "League/Riot processes are already running. Close them before smoke activation: $($running.ProcessName -join ', ')"
        }

        Invoke-ActivationCommand "--install" -Symlink
        $result.Activated = Test-MaoloaderSymlink $resolvedLeagueDir
    } else {
        $result.Activated = Test-MaoloaderSymlink $resolvedLeagueDir
    }

    if ($Launch) {
        if (-not $result.Activated) {
            throw "Use -Activate before -Launch so League loads maoloader through version.dll."
        }

        $leagueExe = Join-Path $resolvedLeagueDir "LeagueClientUx.exe"
        Start-Process -FilePath $leagueExe -WorkingDirectory $resolvedLeagueDir | Out-Null
        $deadline = (Get-Date).AddSeconds($WaitSeconds)
        do {
            Start-Sleep -Seconds 1
            $processes = Get-LeagueProcesses
        } while ($processes.Count -eq 0 -and (Get-Date) -lt $deadline)

        $result.Launched = $true
        $result.LeagueProcesses = $processes

        $traceDeadline = (Get-Date).AddSeconds($WaitSeconds)
        do {
            Start-Sleep -Seconds 1
            $traceRecords = Read-CoreTrace
        } while ($traceRecords.Count -eq 0 -and (Get-Date) -lt $traceDeadline)

        $result.TraceRecords = $traceRecords

        $hasClientTrace = @($traceRecords | Where-Object {
            $_ -match '"event":"core\.initialize"' -and
                ($_ -match '"process_kind":"Browser"' -or $_ -match '"process_kind":"Renderer"')
        }).Count -gt 0

        if (-not $hasClientTrace) {
            throw "No browser/renderer core.initialize trace was observed in $tracePath."
        }
    }

    if (-not $Launch) {
        $result.TraceRecords = Read-CoreTrace
    }

    [pscustomobject]$result | Format-List
}
finally {
    if (-not $KeepConfig) {
        if ($backupPath -and (Test-Path $backupPath)) {
            Move-Item -Force -Path $backupPath -Destination $configPath
        } elseif (Test-Path $configPath) {
            Remove-Item -Force -Path $configPath
        }
    } elseif ($backupPath -and (Test-Path $backupPath)) {
        Remove-Item -Force -Path $backupPath
    }
}
