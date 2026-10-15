param(
    [string]$Tag,
    [string]$Repository = "steele123/maoloader",
    [switch]$SkipBuild,
    [switch]$Draft,
    [switch]$Prerelease
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repo "app"
$tauriDir = Join-Path $appDir "src-tauri"
$tauriConfig = Join-Path $tauriDir "tauri.conf.json"
$cargoManifest = Join-Path $tauriDir "Cargo.toml"
$distDir = Join-Path $repo ".dist\maoloader"

if (-not $Tag) {
    $Tag = (git -C $repo describe --tags --exact-match 2>$null)
}

if (-not $Tag) {
    throw "No git tag was provided and HEAD is not exactly on a tag. Push or check out a tag like v0.1.4."
}

if (-not $Tag.StartsWith("v")) {
    throw "Release tags must start with v, for example v0.1.4. Got '$Tag'."
}

$Version = $Tag.Substring(1)
if (-not $Version) {
    throw "Could not derive a version from tag '$Tag'."
}

$tauriVersion = (Get-Content -Raw -Path $tauriConfig | ConvertFrom-Json).version
$cargoVersionLine = Select-String -Path $cargoManifest -Pattern '^version\s*=\s*"([^"]+)"' | Select-Object -First 1
$cargoVersion = if ($cargoVersionLine -and $cargoVersionLine.Matches.Count -gt 0) {
    $cargoVersionLine.Matches[0].Groups[1].Value
} else {
    ""
}

if ($tauriVersion -ne $Version -or $cargoVersion -ne $Version) {
    throw "Version mismatch: tag is $Tag, tauri.conf.json is $tauriVersion, and Cargo.toml is $cargoVersion."
}

$publicBaseUrl = "https://github.com/$Repository/releases/download/$Tag"
$packageArgs = @{
    Version = $Version
    PublicBaseUrl = $publicBaseUrl
    NoUpload = $true
    FlatDownloadUrls = $true
}

if ($SkipBuild) {
    $packageArgs.SkipBuild = $true
}

& (Join-Path $PSScriptRoot "package-release.ps1") @packageArgs

$bundleDir = Join-Path $tauriDir "target\release\bundle"
$installer = Get-ChildItem -Path (Join-Path $bundleDir "nsis"),(Join-Path $bundleDir "msi") -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in @(".exe", ".msi") } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $installer) {
    throw "No Windows installer was found under $bundleDir."
}

$signaturePath = "$($installer.FullName).sig"
$latestPath = Join-Path $distDir "latest.json"

foreach ($path in @($installer.FullName, $signaturePath, $latestPath)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing GitHub release artifact: $path"
    }
}

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
    throw "GitHub CLI 'gh' is required to publish the release. Install it or run this from GitHub Actions."
}

$releaseExists = $true
try {
    gh release view $Tag --repo $Repository *> $null
} catch {
    $releaseExists = $false
}

if (-not $releaseExists) {
    $createArgs = @(
        "release",
        "create",
        $Tag,
        "--repo",
        $Repository,
        "--title",
        "maoloader $Tag",
        "--notes",
        "maoloader $Tag"
    )

    if ($Draft) {
        $createArgs += "--draft"
    }

    if ($Prerelease) {
        $createArgs += "--prerelease"
    }

    gh @createArgs
}

gh release upload $Tag `
    --repo $Repository `
    --clobber `
    $installer.FullName `
    $signaturePath `
    $latestPath

Write-Output "Published GitHub release artifacts for ${Tag}:"
Write-Output "  Release:   https://github.com/$Repository/releases/tag/$Tag"
Write-Output "  Installer: $($installer.Name)"
Write-Output "  Signature: $([System.IO.Path]::GetFileName($signaturePath))"
Write-Output "  Manifest:  latest.json"
