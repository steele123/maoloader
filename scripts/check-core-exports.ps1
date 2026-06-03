param(
    [string]$DllPath = (Join-Path $PSScriptRoot "..\app\bin\core.dll")
)

$resolvedDll = Resolve-Path $DllPath -ErrorAction Stop
$bytes = [IO.File]::ReadAllBytes($resolvedDll)

function Read-U16([int]$Offset) {
    [BitConverter]::ToUInt16($bytes, $Offset)
}

function Read-U32([int]$Offset) {
    [BitConverter]::ToUInt32($bytes, $Offset)
}

function Read-CString([int]$Offset) {
    $end = $Offset
    while ($bytes[$end] -ne 0) {
        $end++
    }
    [Text.Encoding]::ASCII.GetString($bytes, $Offset, $end - $Offset)
}

$peOffset = Read-U32 0x3c
$sectionCount = Read-U16 ($peOffset + 6)
$optionalHeaderSize = Read-U16 ($peOffset + 20)
$optionalHeaderOffset = $peOffset + 24
$optionalMagic = Read-U16 $optionalHeaderOffset
$dataDirectoryOffset = if ($optionalMagic -eq 0x20b) {
    $optionalHeaderOffset + 112
} else {
    $optionalHeaderOffset + 96
}
$exportRva = Read-U32 $dataDirectoryOffset
$sectionTableOffset = $optionalHeaderOffset + $optionalHeaderSize

$sections = for ($index = 0; $index -lt $sectionCount; $index++) {
    $offset = $sectionTableOffset + ($index * 40)
    [pscustomobject]@{
        Name           = Read-CString $offset
        VirtualSize    = Read-U32 ($offset + 8)
        VirtualAddress = Read-U32 ($offset + 12)
        RawSize        = Read-U32 ($offset + 16)
        RawPointer     = Read-U32 ($offset + 20)
    }
}

function Convert-RvaToOffset([uint32]$Rva) {
    foreach ($section in $sections) {
        $size = [Math]::Max($section.VirtualSize, $section.RawSize)
        if ($Rva -ge $section.VirtualAddress -and $Rva -lt ($section.VirtualAddress + $size)) {
            return [int]($section.RawPointer + ($Rva - $section.VirtualAddress))
        }
    }
    [int]$Rva
}

if ($exportRva -eq 0) {
    throw "DLL has no export directory: $resolvedDll"
}

$exportOffset = Convert-RvaToOffset $exportRva
$ordinalBase = Read-U32 ($exportOffset + 16)
$functionCount = Read-U32 ($exportOffset + 20)
$nameCount = Read-U32 ($exportOffset + 24)
$functionsRva = Read-U32 ($exportOffset + 28)
$nameRvas = Read-U32 ($exportOffset + 32)
$nameOrdinals = Read-U32 ($exportOffset + 36)

$names = @{}
$nameOffset = Convert-RvaToOffset $nameRvas
$ordinalOffset = Convert-RvaToOffset $nameOrdinals
for ($index = 0; $index -lt $nameCount; $index++) {
    $name = Read-CString (Convert-RvaToOffset (Read-U32 ($nameOffset + ($index * 4))))
    $ordinalIndex = Read-U16 ($ordinalOffset + ($index * 2))
    $names[$name] = [int]($ordinalBase + $ordinalIndex)
}

$requiredNames = @(
    "Direct3DCreate9",
    "Direct3DCreate9Ex",
    "D3DPERF_BeginEvent",
    "D3DPERF_EndEvent",
    "D3DPERF_GetStatus",
    "D3DPERF_QueryRepeatFrame",
    "D3DPERF_SetMarker",
    "D3DPERF_SetOptions",
    "D3DPERF_SetRegion",
    "DWriteCreateFactory",
    "GetFileVersionInfoA",
    "GetFileVersionInfoByHandle",
    "GetFileVersionInfoExA",
    "GetFileVersionInfoExW",
    "GetFileVersionInfoSizeA",
    "GetFileVersionInfoSizeExA",
    "GetFileVersionInfoSizeExW",
    "GetFileVersionInfoSizeW",
    "GetFileVersionInfoW",
    "VerFindFileA",
    "VerFindFileW",
    "VerInstallFileA",
    "VerInstallFileW",
    "VerLanguageNameA",
    "VerLanguageNameW",
    "VerQueryValueA",
    "VerQueryValueW",
    "entry",
    "maoloader_plugin_count",
    "maoloader_libcef_version",
    "maoloader_inject_self_into",
    "maoloader_trace_path_len"
)

$missingNames = $requiredNames | Where-Object { -not $names.ContainsKey($_) }
if ($missingNames.Count -gt 0) {
    throw "Missing core.dll exports: $($missingNames -join ', ')"
}

function Test-Ordinal([int]$Ordinal) {
    if ($Ordinal -lt $ordinalBase -or $Ordinal -ge ($ordinalBase + $functionCount)) {
        return $false
    }

    $functionOffset = Convert-RvaToOffset $functionsRva
    (Read-U32 ($functionOffset + (($Ordinal - $ordinalBase) * 4))) -ne 0
}

if (-not (Test-Ordinal 5000)) {
    throw "Missing upstream ordinal export #5000"
}
if (-not (Test-Ordinal 6000)) {
    throw "Missing upstream ordinal export #6000"
}

[pscustomobject]@{
    DllPath             = $resolvedDll.Path
    NamedExports        = $nameCount
    OrdinalBase         = $ordinalBase
    FunctionCount       = $functionCount
    VersionProxyExports = (($names.Keys | Where-Object { $_ -match "^(GetFileVersionInfo|Ver)" }).Count)
    ProxyExports        = (($names.Keys | Where-Object { $_ -match "^(GetFileVersionInfo|Ver|Direct3D|D3DPERF|DWrite)" }).Count)
    MaoloaderExports    = (($names.Keys | Where-Object { $_ -match "^maoloader_" }).Count)
    Ordinal5000         = $true
    Ordinal6000         = $true
} | Format-List
