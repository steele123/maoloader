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

foreach ($dest in $destinations) {
    $destDir = Split-Path -Parent $dest
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item -Force -Path $source -Destination $dest

    Write-Output "Copied $source to $dest"
}
