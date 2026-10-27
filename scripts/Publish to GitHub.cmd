@echo off
where gh >nul 2>&1
if errorlevel 1 (
  echo Install the official GitHub CLI from https://cli.github.com first.
  echo Then sign in with: gh auth login
  pause
  exit /b 1
)
powershell.exe -NoProfile -File "%~dp0publish-github.ps1"
if errorlevel 1 echo Publication did not finish. Read the message above before retrying.
pause
