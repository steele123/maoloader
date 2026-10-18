# Builds, code-signs and uploads a desktop release (installer, .sig and latest.json) to R2.
#
# Two kinds of signing happen here:
#   - Code signing with Azure Artifact Signing, under the same certificate profile as Reveal:
#     core.dll (in build-core.ps1), maoloader.exe and the installer (through Tauri's signCommand).
#     The upload stops if any of them isn't signed.
#   - The Tauri updater signature (.sig), with the key in ~/.tauri. That key has no password; pass
#     -AskPassword for a password-protected one. The password is read at the prompt so it never
#     lands in history or a file.
#
# One-time setup on the build machine:
#   - Azure CLI, logged in with `az login` as a user with the "Artifact Signing Certificate
#     Profile Signer" role on the signing account.
#   - Artifact Signing Client Tools (winget: Microsoft.Azure.ArtifactSigningClientTools).
#   - Windows SDK signtool 10.0.22621 or newer.
#
# -NoUpload, -Local and -SkipBuild are passed through to package-release.ps1.
param(
    [string]$KeyPath = (Join-Path $HOME ".tauri\maoloader.key"),
    [switch]$AskPassword,
    [string]$Endpoint = "https://eus.codesigning.azure.net/",
    [string]$AccountName = "steele",
    [string]$CertificateProfile = "reveal",
    [switch]$NoUpload,
    [switch]$Local,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $KeyPath)) {
    throw "Signing key not found at $KeyPath"
}

# Windows PowerShell's "-Encoding utf8" adds a BOM, which the signing client and Tauri reject.
function Write-Utf8NoBom($path, $text) {
    [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $false))
}

# --- Code signing preflight -----------------------------------------------------------------
if (-not (Test-Path (Join-Path $env:LOCALAPPDATA "Microsoft\MicrosoftArtifactSigningClientTools\Azure.CodeSigning.Dlib.dll"))) {
    throw "Artifact Signing Client Tools not found; run: winget install Microsoft.Azure.ArtifactSigningClientTools"
}
# A shell opened before the Azure CLI was installed doesn't have it on PATH yet.
$az = (Get-Command az -ErrorAction SilentlyContinue).Source
if (-not $az) {
    $az = Join-Path $env:ProgramFiles "Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
    if (-not (Test-Path -LiteralPath $az)) { throw "Azure CLI not found; run: winget install Microsoft.AzureCLI" }
    $env:Path = "$(Split-Path $az);$env:Path"
}
$previous = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $az account show --output none 2>$null
$loggedIn = $LASTEXITCODE -eq 0
$ErrorActionPreference = $previous
if (-not $loggedIn) { throw "Not logged in to Azure; run: az login" }

# Only the Azure CLI login is used to authenticate; skip the slower credential probes.
$metadata = Join-Path $env:TEMP "maoloader-signing-metadata.json"
Write-Utf8NoBom $metadata (@{
    Endpoint               = $Endpoint
    CodeSigningAccountName = $AccountName
    CertificateProfileName = $CertificateProfile
    ExcludeCredentials     = @(
        "ManagedIdentityCredential", "EnvironmentCredential", "WorkloadIdentityCredential",
        "SharedTokenCacheCredential", "VisualStudioCredential", "VisualStudioCodeCredential",
        "AzurePowerShellCredential", "AzureDeveloperCliCredential", "InteractiveBrowserCredential"
    )
} | ConvertTo-Json)

# Tauri v2 takes the command and its arguments separately, so paths with spaces are fine.
$signConfig = Join-Path $env:TEMP "maoloader-sign-config.json"
Write-Utf8NoBom $signConfig (@{
    bundle = @{ windows = @{ signCommand = @{
        cmd  = "powershell"
        args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "sign-file.ps1"), "%1")
    } } }
} | ConvertTo-Json -Depth 6)

# --- Build, sign and upload -------------------------------------------------------------------
$bstr = [IntPtr]::Zero
try {
    $env:MAOLOADER_SIGNING_METADATA = $metadata
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw -LiteralPath $KeyPath
    if ($AskPassword) {
        $securePassword = Read-Host "Password for $([IO.Path]::GetFileName($KeyPath))" -AsSecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }

    $package = @{ ExtraConfig = @($signConfig); RequireAuthenticode = $true; NoUpload = $NoUpload; Local = $Local; SkipBuild = $SkipBuild }
    & (Join-Path $PSScriptRoot "package-release.ps1") @package
}
finally {
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY, Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD, Env:MAOLOADER_SIGNING_METADATA -ErrorAction SilentlyContinue
}
