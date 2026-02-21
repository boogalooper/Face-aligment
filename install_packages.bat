@echo off
echo ===============================
echo Installing for Python 3.11
echo ===============================

python -m pip install --upgrade pip

python -m pip uninstall -y mediapipe

python -m pip install mediapipe==0.10.32 opencv-python numpy --upgrade

echo.
echo ===============================
echo Installation complete
echo ===============================
pause
