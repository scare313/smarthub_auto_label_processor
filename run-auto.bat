@echo off
REM Internal: one unattended processing cycle. Called by Windows Task Scheduler.
REM Activates today's pick lists + labels all eligible orders, logging to data\auto.log.
cd /d "%~dp0"
node index.js auto >> "data\auto.log" 2>&1
