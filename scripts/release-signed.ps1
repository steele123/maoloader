# Builds, signs and uploads a desktop release (installer, .sig and latest.json) to R2.
# The updater key in ~/.tauri has no password. Pass -AskPassword for a password-protected key;
# the password is read at the prompt so it never lands in history or a file.
param(
    [string]$KeyPath = (Join-Path $HOME ".tauri\maoloader.key"),
    [switch]$AskPassword
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $KeyPath)) {
    throw "Signing key not found at $KeyPath"
}

$bstr = [IntPtr]::Zero
try {
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw -LiteralPath $KeyPath
    if ($AskPassword) {
        $securePassword = Read-Host "Password for $([IO.Path]::GetFileName($KeyPath))" -AsSecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }

    & (Join-Path $PSScriptRoot "package-release.ps1")
}
finally {
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY, Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
}
