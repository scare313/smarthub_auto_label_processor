@echo off
REM Run ONCE per PC. Makes the SmartHub agent start automatically when you log in,
REM and restart itself if it crashes.
REM
REM WHY "at log on" and not a Windows service:
REM   Amazon's SSO login stalls in a headless browser, so the agent must run a
REM   real (off-screen) browser window. That needs an interactive desktop session.
REM   A Windows service runs in session 0 with no desktop, so the browser would
REM   fail to log in. "At log on" keeps it in your normal session, where it works.
cd /d "%~dp0"
title Setup SmartHub Autostart

schtasks /Create /TN "SmartHub Agent" /TR "\"%~dp0run-agent.bat\"" /SC ONLOGON /RL LIMITED /F

echo.
if %errorlevel%==0 (
  echo ---------------------------------------------------------------
  echo  DONE. The agent will start automatically when you log in,
  echo  and restart itself if it crashes.
  echo.
  echo  IMPORTANT: this triggers on LOG IN, not on power-on. If the PC
  echo  reboots and waits at the lock screen, nothing runs until
  echo  someone logs in. To make it fully unattended, enable Windows
  echo  automatic sign-in on this PC.
  echo.
  echo  To test: restart the PC, log in, then open
  echo    http://localhost:4545
  echo.
  echo  To remove: Remove Autostart.bat
  echo ---------------------------------------------------------------
) else (
  echo Could not create the task. Try running this file as Administrator.
)
pause
