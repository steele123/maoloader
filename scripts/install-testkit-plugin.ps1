param(
    [switch]$Clean,
    [switch]$OpenFolder
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Source = Join-Path $RepoRoot "maoloader-testkit"
$PluginsDir = Join-Path $RepoRoot "app\bin\plugins"
$Target = Join-Path $PluginsDir "maoloader-testkit"

if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
    throw "Could not find source plugin at $Source"
}

New-Item -ItemType Directory -Force -Path $PluginsDir | Out-Null

$ResolvedPluginsDir = (Resolve-Path -LiteralPath $PluginsDir).Path
$TargetParent = Split-Path -Parent $Target
$ResolvedTargetParent = (Resolve-Path -LiteralPath $TargetParent).Path

if ($ResolvedTargetParent -ne $ResolvedPluginsDir) {
    throw "Refusing to write outside the plugins directory: $Target"
}

if ($Clean -and (Test-Path -LiteralPath $Target)) {
    Remove-Item -LiteralPath $Target -Recurse -Force
}

if (Test-Path -LiteralPath $Target) {
    Remove-Item -LiteralPath $Target -Recurse -Force
}

Copy-Item -LiteralPath $Source -Destination $Target -Recurse

Write-Host "Installed maoloader TestKit to $Target"
Write-Host "Restart or reload the League client to load it."

if ($OpenFolder) {
    Start-Process explorer.exe -ArgumentList $Target
}
