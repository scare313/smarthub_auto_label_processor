@echo off
REM Runs the SmartHub agent and AUTO-RESTARTS it if it ever crashes or exits.
REM Called by the "SmartHub Agent" scheduled task at logon (see Setup Autostart.bat).
REM
REM Calls node directly rather than "npm run serve" so there's no npm wrapper
REM process in between — killing this window stops the server cleanly.
cd /d "%~dp0"
title SmartHub Agent (auto-restart)

:loop
echo.
echo [%date% %time%] Starting SmartHub agent...
node server.js
echo.
echo [%date% %time%] Agent exited. Restarting in 10 seconds... (close this window to stop)
timeout /t 10 /nobreak >nul
goto loop
