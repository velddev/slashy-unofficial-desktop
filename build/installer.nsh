; Remove the mailto/.eml registration the app writes at runtime (main.js registerApp),
; but not during an auto-update, which runs the old uninstaller too.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegKey HKCU "Software\Classes\Slashy.mailto"
    DeleteRegKey HKCU "Software\Classes\Slashy.eml"
    DeleteRegKey HKCU "Software\Classes\Applications\Slashy.exe"
    DeleteRegValue HKCU "Software\Classes\.eml\OpenWithProgids" "Slashy.eml"
    DeleteRegKey HKCU "Software\Slashy"
    DeleteRegValue HKCU "Software\RegisteredApplications" "Slashy"
  ${endIf}
!macroend
