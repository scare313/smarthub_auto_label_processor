@echo off
REM Stops the agent from starting automatically at log in.
REM (Does not stop a currently-running agent — close its window for that.)
title Remove SmartHub Autostart
schtasks /Delete /TN "SmartHub Agent" /F
echo.
echo Autostart removed. Run "Setup Autostart.bat" to turn it back on.
pause
