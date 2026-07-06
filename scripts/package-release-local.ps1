param(
    [string]$Version,
    [string]$BucketName = "plugins",
    [string]$PublicBaseUrl = "http://localhost:8788/api/releases/download",
    [switch]$SkipBuild,
    [switch]$NoUpload
)

$ErrorActionPreference = "Stop"

$params = @{
    BucketName = $BucketName
    PublicBaseUrl = $PublicBaseUrl
    Local = $true
}

if ($Version) {
    $params.Version = $Version
}

if ($SkipBuild) {
    $params.SkipBuild = $true
}

if ($NoUpload) {
    $params.NoUpload = $true
}

& (Join-Path $PSScriptRoot "package-release.ps1") @params
