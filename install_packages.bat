@echo off
echo ===============================
echo Installing Python dependencies
echo ===============================

python -m pip install --upgrade pip
python -m pip install mediapipe
python -m pip install opencv-python
python -m pip install numpy

echo.
echo ===============================
echo Downloading face_landmarker.task into lib folder
echo ===============================

if not exist lib (
    mkdir lib
)

set MODEL_FILE=lib\face_landmarker.task
set MODEL_URL=https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

powershell -Command ^
"if (-Not (Test-Path '%MODEL_FILE%')) {Invoke-WebRequest -Uri '%MODEL_URL%' -OutFile '%MODEL_FILE%'; Write-Host 'Model downloaded to lib.'} else {Write-Host 'Model already exists in lib.'}"

echo.
echo ===============================
echo Installation complete
echo ===============================
pause
