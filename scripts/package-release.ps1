param(
    [string]$Version,
    [string]$BucketName = "plugins",
    [string]$PublicBaseUrl = "https://fs.maoloader.com",
    [switch]$SkipBuild,
    [switch]$NoUpload
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repo "app"
$tauriDir = Join-Path $appDir "src-tauri"
$tauriConfig = Join-Path $tauriDir "tauri.conf.json"
$cargoManifest = Join-Path $tauriDir "Cargo.toml"
$releaseConfig = Join-Path $tauriDir "tauri.release.conf.json"
$distDir = Join-Path $repo ".dist\maoloader"

if (-not $Version) {
    $Version = (Get-Content -Raw -Path $tauriConfig | ConvertFrom-Json).version
}

if (-not $Version) {
    throw "Could not determine release version from $tauriConfig."
}

$cargoVersionLine = Select-String -Path $cargoManifest -Pattern '^version\s*=\s*"([^"]+)"' | Select-Object -First 1
$cargoVersion = if ($cargoVersionLine -and $cargoVersionLine.Matches.Count -gt 0) {
    $cargoVersionLine.Matches[0].Groups[1].Value
} else {
    ""
}

if ($cargoVersion -ne $Version) {
    throw "Version mismatch: tauri.conf.json is $Version but Cargo.toml is $cargoVersion. Update both before packaging."
}

$releaseConfigText = Get-Content -Raw -Path $releaseConfig
if ($releaseConfigText -match "REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY") {
    throw "Replace the updater pubkey in app/src-tauri/tauri.release.conf.json before packaging a release."
}

if (-not $SkipBuild) {
    if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
        throw "TAURI_SIGNING_PRIVATE_KEY must be set before building signed updater artifacts."
    }

    Push-Location $appDir
    try {
        bun tauri build --config src-tauri/tauri.release.conf.json
    }
    finally {
        Pop-Location
    }
}

$bundleDir = Join-Path $tauriDir "target\release\bundle"
$nsisDir = Join-Path $bundleDir "nsis"
$msiDir = Join-Path $bundleDir "msi"

$installer = Get-ChildItem -Path $nsisDir,$msiDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in @(".exe", ".msi") } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $installer) {
    throw "No Windows installer was found under $bundleDir."
}

$signaturePath = "$($installer.FullName).sig"
if (-not (Test-Path -LiteralPath $signaturePath)) {
    throw "Missing updater signature next to installer: $signaturePath"
}

$signature = (Get-Content -Raw -Path $signaturePath).Trim()
if (-not $signature) {
    throw "Updater signature file is empty: $signaturePath"
}

$sha256 = (Get-FileHash -Algorithm SHA256 -Path $installer.FullName).Hash.ToLowerInvariant()
$platformKey = "windows-x86_64"
$objectPrefix = "releases/maoloader/v$Version/$platformKey"
$downloadPath = "$($PublicBaseUrl.TrimEnd('/'))/$objectPrefix/$($installer.Name)"

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

$manifest = [ordered]@{
    version = $Version
    notes = "maoloader v$Version"
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = [ordered]@{
        $platformKey = [ordered]@{
            url = $downloadPath
            signature = $signature
            installer_url = $downloadPath
            installer_name = $installer.Name
            size = $installer.Length
            sha256 = $sha256
        }
    }
}

$latestPath = Join-Path $distDir "latest.json"
$manifest | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $latestPath

Write-Output "Prepared maoloader v$Version release metadata:"
Write-Output "  Installer: $($installer.FullName)"
Write-Output "  Signature: $signaturePath"
Write-Output "  Manifest:  $latestPath"
Write-Output "  R2 prefix: $BucketName/$objectPrefix"

if ($NoUpload) {
    Write-Output "Skipping R2 upload because -NoUpload was passed."
    exit 0
}

Push-Location (Join-Path $repo "web")
try {
    bunx wrangler r2 object put "$BucketName/$objectPrefix/$($installer.Name)" --file "$($installer.FullName)" --remote
    bunx wrangler r2 object put "$BucketName/$objectPrefix/$($installer.Name).sig" --file "$signaturePath" --remote
    bunx wrangler r2 object put "$BucketName/releases/maoloader/latest.json" --file "$latestPath" --remote
}
finally {
    Pop-Location
}

Write-Output "Uploaded maoloader v$Version release to R2."
