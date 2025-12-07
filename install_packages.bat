@echo off
chcp 65001 >nul

echo ================================
echo Установка необходимых пакетов Python
echo ================================

REM Устанавливаем mediapipe
echo [INFO] Устанавливаю mediapipe...
python -m pip install --upgrade pip
python -m pip install mediapipe

REM Устанавливаем opencv-python
echo [INFO] Устанавливаю opencv-python...
python -m pip install opencv-python

REM Устанавливаем numpy
echo [INFO] Устанавливаю numpy...
python -m pip install numpy

echo ================================
echo Установка завершена!
echo ================================
pause