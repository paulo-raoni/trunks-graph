; The "Open in Trunks Graph" entry of Explorer's context menu, for a folder and
; for the empty space inside an open folder, written by the installer and removed
; by the uninstaller. electron-builder includes this file in its NSIS script
; (`build.nsis.include` in package.json) and calls the two macros: customInstall
; after the application's files and shortcut are in place, customUnInstall
; before they are removed. The portable executable does not include it.
;
; The keys are the classic shell verbs under the current user's classes, so no
; administrator is needed to write them. On Windows 11 they are listed under
; "Show more options". `%V` is the folder in both menus: the folder clicked, or
; the folder whose empty space was clicked. The application opens the folder its
; command line names (src/app/startup.ts).
;
; `gates:packaging` holds this file to exactly these keys: change one here and
; change the gate's list with it.

!macro customInstall
  WriteRegStr HKCU "Software\Classes\Directory\shell\TrunksGraph" "" "Open in Trunks Graph"
  WriteRegStr HKCU "Software\Classes\Directory\shell\TrunksGraph" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\Directory\shell\TrunksGraph\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\TrunksGraph" "" "Open in Trunks Graph"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\TrunksGraph" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\TrunksGraph\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\TrunksGraph"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\TrunksGraph"
!macroend
