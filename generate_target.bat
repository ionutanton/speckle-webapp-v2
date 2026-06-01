@echo off
echo Generating 8th Wall Image Target from resource\qrcode.png...
echo.

:: Pipe the required answers to the interactive CLI using PowerShell
powershell -Command "\"resource\qrcode.png`n1`nY`npublic\targets`nqrcode\" | npx -y @8thwall/image-target-cli@latest"

echo.
echo Image target successfully generated at public\targets\qrcode.json!
pause
