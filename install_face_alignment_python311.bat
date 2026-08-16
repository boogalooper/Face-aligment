@echo off
setlocal EnableExtensions

echo ========================================
echo Face Alignment + Archiver Dependencies
echo Python 3.11
echo ========================================
echo.

set "PY="

REM Prefer the Windows Python Launcher so the requested Python version is selected
REM even when multiple Python versions are installed.
py -3.11 -c "import sys; sys.exit(0 if sys.version_info[:2] == (3, 11) else 1)" >nul 2>&1
if not errorlevel 1 set "PY=py -3.11"

REM Fall back to python from PATH only if it is exactly the requested version.
if defined PY goto :python_found
python -c "import sys; sys.exit(0 if sys.version_info[:2] == (3, 11) else 1)" >nul 2>&1
if errorlevel 1 goto :wrong_python
set "PY=python"

:python_found
echo [INFO] Python interpreter:
%PY% -c "import sys; print(sys.executable); print(sys.version)"
if errorlevel 1 goto :fail

%PY% -c "import struct,sys; sys.exit(0 if struct.calcsize('P') * 8 == 64 else 1)" >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] 64-bit Python 3.11 is required.
    goto :fail
)

REM Keep pip temporary files on the same drive as Python.
REM This avoids cross-drive uninstall failures when Windows TEMP is elsewhere.
for /f "delims=" %%I in ('%PY% -c "import sys; print(sys.executable)"') do set "PY_EXE=%%I"
if not defined PY_EXE goto :fail
for %%I in ("%PY_EXE%") do set "PY_DIR=%%~dpI"
set "PIP_TEMP_DIR=%PY_DIR%pip-temp-face-alignment-311"
if not exist "%PIP_TEMP_DIR%" mkdir "%PIP_TEMP_DIR%" >nul 2>&1
set "TEMP=%PIP_TEMP_DIR%"
set "TMP=%PIP_TEMP_DIR%"

echo [INFO] pip temporary directory:
echo %PIP_TEMP_DIR%

echo.
echo [1/6] Updating pip...
%PY% -m pip install --upgrade pip
if errorlevel 1 goto :fail

echo.
echo [2/6] Stopping Face Alignment and Archiver APIs, if running...
REM Archiver / Face Counter listens on port 6310.
%PY% -c "import socket,json; s=socket.socket(); s.settimeout(0.5); s.connect(('127.0.0.1',6310)); s.sendall(json.dumps({'type':'exit'}).encode('utf-8')); s.close()" >nul 2>&1
REM Face Alignment listens on port 6320.
%PY% -c "import socket,json; s=socket.socket(); s.settimeout(0.5); s.connect(('127.0.0.1',6320)); s.sendall(json.dumps({'type':'exit'}).encode('utf-8')); s.close()" >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
echo [3/6] Removing conflicting OpenCV and MediaPipe packages...
REM All OpenCV wheel variants share the same cv2 namespace.
REM Keep exactly one OpenCV package in this Python environment.
%PY% -m pip uninstall -y opencv-python opencv-python-headless opencv-contrib-python opencv-contrib-python-headless mediapipe mediapipe-nightly
if errorlevel 1 goto :locked_files

echo.
echo [4/6] Installing the compatible dependency set...
%PY% -m pip install --no-cache-dir --upgrade "psutil" "opencv-contrib-python==4.13.0.92" "mediapipe==0.10.32"
if errorlevel 1 goto :fail

echo.
echo [5/6] Checking package dependency consistency...
%PY% -m pip check
if errorlevel 1 goto :dependency_conflict

echo.
echo [6/6] Verifying Face Alignment and Archiver requirements...
%PY% -c "import os,sys,cv2,psutil,mediapipe as mp; from importlib.metadata import version; from mediapipe.tasks import python as mp_python; from mediapipe.tasks.python import vision; p=os.path.join(cv2.data.haarcascades,'haarcascade_frontalface_default.xml'); cascade=cv2.CascadeClassifier(p); checks=[sys.version_info[:2]==(3,11), version('opencv-contrib-python')=='4.13.0.92', version('mediapipe')=='0.10.32', os.path.isfile(p), not cascade.empty(), hasattr(mp,'Image'), hasattr(mp,'ImageFormat'), hasattr(mp_python,'BaseOptions'), hasattr(vision,'FaceLandmarker'), hasattr(vision,'FaceLandmarkerOptions'), hasattr(vision,'PoseLandmarker'), hasattr(vision,'PoseLandmarkerOptions'), hasattr(vision,'RunningMode')]; print('Python:',sys.version.split()[0]); print('MediaPipe:',version('mediapipe')); print('OpenCV:',cv2.__version__); print('opencv-contrib-python:',version('opencv-contrib-python')); print('Cascade file:',p); print('Archiver Haar cascade:','OK' if os.path.isfile(p) and not cascade.empty() else 'FAILED'); print('Face Alignment Tasks API:','OK' if all(checks[5:]) else 'FAILED'); print('psutil: OK'); sys.exit(0 if all(checks) else 1)"
if errorlevel 1 goto :verification_failed

echo.
echo ========================================
echo Installation completed successfully.
echo ========================================
echo Face Alignment: OK
echo Archiver / Face Counter: OK
echo.
if exist "%PIP_TEMP_DIR%" rmdir /s /q "%PIP_TEMP_DIR%" >nul 2>&1
pause
exit /b 0

:wrong_python
echo.
echo [ERROR] Python 3.11 was not found.
echo Install 64-bit Python 3.11, or make sure it is available through the Python Launcher or PATH.
goto :fail

:locked_files
echo.
echo [ERROR] Some OpenCV or MediaPipe files could not be removed.
echo Close Photoshop and any Python processes using Face Alignment or Archiver, then run this installer again.
goto :fail

:dependency_conflict
echo.
echo [ERROR] pip detected incompatible packages in this Python environment.
echo Review the conflict messages above before using Face Alignment or Archiver.
goto :fail

:verification_failed
echo.
echo [ERROR] Runtime verification failed.
echo The installed packages do not provide everything required by Face Alignment and Archiver.
goto :fail

:fail
echo.
echo ========================================
echo Installation failed.
echo Review the messages above for details.
echo ========================================
if defined PIP_TEMP_DIR if exist "%PIP_TEMP_DIR%" rmdir /s /q "%PIP_TEMP_DIR%" >nul 2>&1
pause
exit /b 1
