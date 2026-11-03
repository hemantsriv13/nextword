@echo off
rem Start NextWord Lab on Windows: checks the setup, reuses a running local AI tutor, then opens the Lab.
rem   start-nextword.cmd           ask before starting the local AI tutor if it isn't running
rem   start-nextword.cmd --ai      start the tutor without asking if nothing is running on 127.0.0.1:8000
rem   start-nextword.cmd --no-ai   don't start the tutor (the MLP, bigram and lessons all work without it)
rem The tutor (Qwen3-4B through Colibri) is started ONLY when nothing listens on port 8000, because the
rem Colibri launcher stops any running server first (SignalDesk may share it). It is never switched to another model.
setlocal
cd /d "%~dp0"
set "PY=.venv\Scripts\python.exe"
set "LAUNCHER=%~dp0..\local-ai\start-colibri.cmd"
set "MODE=%~1"

if not exist "%PY%" (
  echo NextWord's Python environment is missing. Create it once:
  echo   py -3.12 -m venv .venv
  echo   .venv\Scripts\python -m pip install --index-url https://download.pytorch.org/whl/cpu -r requirements-mlp.txt
  exit /b 1
)

if not exist "web\dist\index.html" (
  echo The interface isn't built yet. Building it once ^(needs Node.js^)...
  call npm --prefix web install || exit /b 1
  call npm --prefix web run build || exit /b 1
)

"%PY%" -m nextword.lab.startup torch >nul
if errorlevel 1 (
  echo [MLP] PyTorch isn't installed: the Neural MLP journey will say so. To add it:
  echo       .venv\Scripts\python -m pip install --index-url https://download.pytorch.org/whl/cpu -r requirements-mlp.txt
) else (
  echo [MLP] PyTorch found: the character MLP trains on this computer's CPU.
)

for /f "tokens=1,2" %%a in ('"%PY%" -m nextword.lab.startup ai') do (set "AI=%%a" & set "AIMODEL=%%b")
if "%AI%"=="READY" (
  echo [Tutor] Reusing the local AI tutor already running: %AIMODEL%.
  goto lab
)
if "%AI%"=="LOADING" (
  echo [Tutor] Something is already using 127.0.0.1:8000 but isn't serving a model yet ^(Colibri still loading,
  echo         or another program^). Leaving it alone. The Lab shows the tutor as ready once it answers.
  goto lab
)
if /i "%MODE%"=="--no-ai" (
  echo [Tutor] Not started. Everything except "Ask your tutor" works without it.
  goto lab
)
if not exist "%LAUNCHER%" (
  echo [Tutor] Not running, and the launcher wasn't found at %LAUNCHER%. See docs\LOCAL_AI.md.
  goto lab
)
if /i "%MODE%"=="--ai" goto starttutor
echo [Tutor] The local AI tutor isn't running.
choice /C YN /T 20 /D N /M "Start it now (Qwen3-4B through Colibri, in its own window; loading takes about a minute)"
if errorlevel 2 (
  echo [Tutor] Not started. Everything except "Ask your tutor" works without it.
  goto lab
)
:starttutor
echo [Tutor] Starting Colibri with Qwen3-4B in a new window. Close that window to stop the tutor.
start "NextWord local AI tutor (Colibri)" cmd /k ""%LAUNCHER%" 4b"

:lab
echo.
echo Starting NextWord Lab at http://127.0.0.1:8765 ^(Ctrl+C here stops the Lab; the tutor window keeps running^).
"%PY%" -m nextword.lab --open
