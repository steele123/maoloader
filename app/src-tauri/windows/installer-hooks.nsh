; League keeps maoloader's core.dll loaded while it runs. Windows won't overwrite or delete a
; loaded DLL, but it will rename one, so move the old core.dll aside before the new one is
; written. League keeps using the old copy until it restarts; maoloader deletes leftovers once
; nothing has them loaded.

!macro NSIS_HOOK_PREINSTALL
  IfFileExists "$INSTDIR\core.dll" 0 maoloader_core_moved
    Push $9
    System::Call "kernel32::GetTickCount() i .r9"
    Rename "$INSTDIR\core.dll" "$INSTDIR\core.dll.old-$9"
    Pop $9
  maoloader_core_moved:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Copies nothing has loaded any more can go now; locked ones are cleaned up by the app later.
  Delete "$INSTDIR\core.dll.old-*"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$INSTDIR\core.dll.old-*"
!macroend
