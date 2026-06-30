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
echo     [2]  Print All Today's Labels
echo     [3]  Show Status
echo     [4]  Reprint Last Labels
echo     [5]  Open Labels Folder
echo     [6]  Process Orders Now
echo     [7]  Login
echo.
echo     ------------- Admin -------------
echo     [8]  Setup Scheduler  (auto every 15 min)
echo     [9]  Test Email Alert
echo     [10] Remove Scheduler
echo.
echo     [0]  Exit
echo.
set "choice="
set /p choice="  Choose an option: "

if "%choice%"=="1" goto print
if "%choice%"=="2" goto printall
if "%choice%"=="3" goto status
if "%choice%"=="4" goto reprint
if "%choice%"=="5" goto folder
if "%choice%"=="6" goto process
if "%choice%"=="7" goto login
if "%choice%"=="8" goto setup
if "%choice%"=="9" goto testmail
if "%choice%"=="10" goto remove
if "%choice%"=="0" exit /b
goto menu

:print
echo.
node index.js print
echo.
pause
goto menu

:printall
echo.
node index.js print --all
echo.
pause
goto menu

:status
echo.
node index.js summary
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
