param(
    [string]$Version,
    [string]$BucketName = "plugins",
    [string]$PublicBaseUrl = "https://fs.maoloader.com",
    [switch]$SkipBuild,
    [switch]$NoUpload,
    [switch]$Local,
    [switch]$FlatDownloadUrls,
    # More Tauri config files merged over the release config, like release-signed.ps1's signCommand.
    [string[]]$ExtraConfig = @(),
    # Stop before uploading unless the installer, maoloader.exe and core.dll are all code-signed.
    [switch]$RequireAuthenticode
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

if ($Version.StartsWith("-")) {
    throw "Invalid release version '$Version'. Pass script options after npm's -- separator, for example: bun run build:release:local -- -SkipBuild"
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

# The release notes come from this version's section of CHANGELOG.md; checked before building so
# a missing entry stops the release before any time is spent on it.
$changelogPath = Join-Path $repo "CHANGELOG.md"
$changelog = if (Test-Path -LiteralPath $changelogPath) { Get-Content -Raw -Encoding UTF8 -Path $changelogPath } else { "" }
$sectionPattern = "(?ms)^##\s+$([regex]::Escape($Version))(?:\s+-[^\r\n]*)?\r?\n(.*?)(?=^##\s|\z)"
$sectionMatch = [regex]::Match($changelog, $sectionPattern)
$releaseNotes = if ($sectionMatch.Success) { $sectionMatch.Groups[1].Value.Trim() } else { "" }
if (-not $releaseNotes) {
    throw "CHANGELOG.md has no notes for $Version. Add a '## $Version - yyyy-mm-dd' section before releasing."
}

if (-not $SkipBuild) {
    if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
        throw "TAURI_SIGNING_PRIVATE_KEY must be set before building signed updater artifacts."
    }

    Push-Location $appDir
    try {
        $configArgs = @("--config", "src-tauri/tauri.release.conf.json")
        foreach ($config in $ExtraConfig) { $configArgs += @("--config", $config) }
        # Bun and cargo print progress on stderr, which Windows PowerShell turns into errors when the
        # output is captured; judge the build by its exit code instead.
        $ErrorActionPreference = "Continue"
        bun tauri build @configArgs
        $ErrorActionPreference = "Stop"
        if ($LASTEXITCODE) {
            throw "tauri build failed with exit code $LASTEXITCODE."
        }
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

# An older build left in the bundle folder must never be published under the new version.
if ($installer.Name -notmatch "_$([regex]::Escape($Version))_") {
    throw "Newest installer $($installer.Name) is not version $Version. Rebuild before packaging."
}

if ($RequireAuthenticode) {
    # Tauri signs a copy of maoloader.exe for each installer and leaves the one in target\release
    # unsigned, so check the copies the MSI carries. "msiexec /a" only unpacks; nothing is installed.
    $msi = Get-ChildItem -Path $msiDir -Filter "*_$($Version)_*.msi" -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $msi) { throw "No $Version MSI to check the bundled files in; nothing was uploaded." }
    $unpacked = Join-Path $env:TEMP "maoloader-msi-check"
    Remove-Item -LiteralPath $unpacked -Recurse -Force -ErrorAction SilentlyContinue
    $msiexec = Start-Process msiexec.exe -ArgumentList "/a `"$($msi.FullName)`" /qn TARGETDIR=`"$unpacked`"" -Wait -PassThru
    if ($msiexec.ExitCode) { throw "Couldn't unpack $($msi.Name) to check it (msiexec exit $($msiexec.ExitCode)); nothing was uploaded." }
    $bundled = Get-ChildItem -Path $unpacked -Recurse -File -Include "maoloader.exe", "core.dll"
    if (@($bundled).Count -lt 2) { throw "maoloader.exe or core.dll is missing from $($msi.Name); nothing was uploaded." }

    $signed = @($installer.FullName, $msi.FullName) + @($bundled | ForEach-Object { $_.FullName })
    foreach ($path in $signed) {
        $authenticode = Get-AuthenticodeSignature -LiteralPath $path
        if ($authenticode.Status -ne "Valid") {
            throw "$([IO.Path]::GetFileName($path)) is not code-signed ($($authenticode.Status)); nothing was uploaded."
        }
        Write-Output "  $([IO.Path]::GetFileName($path)): signed by $($authenticode.SignerCertificate.Subject)"
    }
    Remove-Item -LiteralPath $unpacked -Recurse -Force -ErrorAction SilentlyContinue
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
$downloadPath = if ($FlatDownloadUrls) {
    "$($PublicBaseUrl.TrimEnd('/'))/$($installer.Name)"
} else {
    "$($PublicBaseUrl.TrimEnd('/'))/$objectPrefix/$($installer.Name)"
}

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

$manifest = [ordered]@{
    version = $Version
    notes = $releaseNotes
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
# Without a BOM: Windows PowerShell's -Encoding UTF8 adds one, and JSON parsers reject it.
[System.IO.File]::WriteAllText($latestPath, ($manifest | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding $false))

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
    # A plain string here would be splatted one character at a time ("- - r e m o t e").
    $target = if ($Local) { "--local" } else { "--remote" }
    # latest.json goes last, so users are never pointed at an installer that isn't uploaded yet.
    $uploads = @(
        @{ Key = "$objectPrefix/$($installer.Name)"; File = $installer.FullName },
        @{ Key = "$objectPrefix/$($installer.Name).sig"; File = $signaturePath },
        @{ Key = "releases/maoloader/latest.json"; File = $latestPath }
    )
    foreach ($upload in $uploads) {
        $ErrorActionPreference = "Continue"
        bunx wrangler r2 object put "$BucketName/$($upload.Key)" --file "$($upload.File)" $target
        $ErrorActionPreference = "Stop"
        if ($LASTEXITCODE) {
            throw "Uploading $($upload.Key) failed with exit code $LASTEXITCODE."
        }
    }
}
finally {
    Pop-Location
}

if ($Local) {
    Write-Output "Uploaded maoloader v$Version release to local Wrangler R2."
} else {
    Write-Output "Uploaded maoloader v$Version release to remote R2."
}
