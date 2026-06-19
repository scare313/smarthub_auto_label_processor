@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title SmartHub Order Processor

:menu
cls
echo.
echo   ====== SmartHub Order Processor ======
echo.
echo     [1]  Print New Labels  (+ Pick List)
echo     [2]  Reprint Last Labels
echo     [3]  Open Labels Folder
echo     [4]  Process Orders Now
echo     [5]  Login
echo.
echo     ------------- Admin -------------
echo     [6]  Setup Scheduler  (auto every 15 min)
echo     [7]  Test Email Alert
echo     [8]  Remove Scheduler
echo.
echo     [0]  Exit
echo.
set "choice="
set /p choice="  Choose an option: "

if "%choice%"=="1" goto print
if "%choice%"=="2" goto reprint
if "%choice%"=="3" goto folder
if "%choice%"=="4" goto process
if "%choice%"=="5" goto login
if "%choice%"=="6" goto setup
if "%choice%"=="7" goto testmail
if "%choice%"=="8" goto remove
if "%choice%"=="0" exit /b
goto menu

:print
echo.
node index.js print
echo.
pause
goto menu

:reprint
echo.
node index.js reprint
echo.
pause
goto menu

:folder
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "TODAY=%%d"
if exist "labels\!TODAY!" (
  start "" "labels\!TODAY!"
) else (
  start "" "labels"
)
goto menu

:process
echo.
echo   Processing today's orders (activate + label all channels)...
node index.js auto
echo.
pause
goto menu

:login
echo.
node index.js login
goto menu

:setup
echo.
schtasks /Create /TN "SmartHub Auto Processor" /TR "\"%~dp0run-auto.bat\"" /SC MINUTE /MO 15 /ST 00:00 /F
echo.
echo   Scheduler set: orders will be processed automatically every 15 minutes.
echo.
pause
goto menu

:testmail
echo.
node index.js test-alert
echo.
pause
goto menu

:remove
echo.
schtasks /Delete /TN "SmartHub Auto Processor" /F
echo.
echo   Automatic processing stopped.
echo.
pause
goto menu
