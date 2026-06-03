param(
    [string]$DllPath = (Join-Path $PSScriptRoot "..\app\bin\core.dll")
)

$ErrorActionPreference = "Stop"

$resolvedDll = Resolve-Path $DllPath -ErrorAction Stop
$tracePath = Join-Path (Split-Path -Parent $resolvedDll.Path) "diagnostics\core-trace.log"
$powershell = Join-Path $PSHOME "powershell.exe"

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class MaoLoaderNativeSmoke {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr LoadLibraryW(string fileName);

    [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
    public static extern IntPtr GetProcAddress(IntPtr module, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(UInt32 desiredAccess, bool inheritHandle, UInt32 processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr handle);
}

[UnmanagedFunctionPointer(CallingConvention.StdCall)]
public delegate bool MaoLoaderInjectSelfInto(IntPtr process);
"@

function Get-LastWin32ErrorMessage {
    $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($code -eq 0) {
        return "unknown Win32 error"
    }
    return ([ComponentModel.Win32Exception]::new($code)).Message
}

$target = $null
$processHandle = [IntPtr]::Zero

try {
    Remove-Item -Force $tracePath -ErrorAction SilentlyContinue

    $target = Start-Process `
        -FilePath $powershell `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Start-Sleep -Seconds 60") `
        -WindowStyle Hidden `
        -PassThru

    Start-Sleep -Milliseconds 250

    $module = [MaoLoaderNativeSmoke]::LoadLibraryW($resolvedDll.Path)
    if ($module -eq [IntPtr]::Zero) {
        throw "LoadLibraryW failed for $($resolvedDll.Path): $(Get-LastWin32ErrorMessage)"
    }

    $proc = [MaoLoaderNativeSmoke]::GetProcAddress($module, "maoloader_inject_self_into")
    if ($proc -eq [IntPtr]::Zero) {
        throw "GetProcAddress failed for maoloader_inject_self_into: $(Get-LastWin32ErrorMessage)"
    }

    $inject = [Runtime.InteropServices.Marshal]::GetDelegateForFunctionPointer(
        $proc,
        [type][MaoLoaderInjectSelfInto]
    )

    $processAllAccess = 0x001F0FFF
    $processHandle = [MaoLoaderNativeSmoke]::OpenProcess($processAllAccess, $false, [uint32]$target.Id)
    if ($processHandle -eq [IntPtr]::Zero) {
        throw "OpenProcess failed for pid $($target.Id): $(Get-LastWin32ErrorMessage)"
    }

    if (-not $inject.Invoke($processHandle)) {
        throw "maoloader_inject_self_into returned false for pid $($target.Id)"
    }

    $loaded = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 100
        $target.Refresh()
        $loaded = @($target.Modules | Where-Object {
            if (-not $_.FileName) {
                return $false
            }

            $modulePath = Resolve-Path $_.FileName -ErrorAction SilentlyContinue
            $modulePath -and ($modulePath.Path -eq $resolvedDll.Path)
        }).Count -gt 0
        if ($loaded) {
            break
        }
    }

    if (-not $loaded) {
        throw "Injected DLL was not observed in target module list for pid $($target.Id)"
    }

    $traceRecords = @()
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 100
        if (Test-Path $tracePath) {
            $traceRecords = @(Get-Content $tracePath | Where-Object { $_.Trim() })
        }
        if ($traceRecords.Count -gt 0) {
            break
        }
    }

    if ($traceRecords.Count -eq 0) {
        throw "No core.initialize trace was written to $tracePath"
    }

    [pscustomobject]@{
        TargetProcess = $target.ProcessName
        TargetPid     = $target.Id
        InjectedDll   = $resolvedDll.Path
        TracePath     = $tracePath
        TraceRecords  = $traceRecords.Count
        Loaded        = $true
    } | Format-List
}
finally {
    if ($processHandle -ne [IntPtr]::Zero) {
        [void][MaoLoaderNativeSmoke]::CloseHandle($processHandle)
    }
    if ($target -and -not $target.HasExited) {
        Stop-Process -Id $target.Id -Force
    }
}
