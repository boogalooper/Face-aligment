import os
import sys
import subprocess
import socket
import json

API_HOST = "127.0.0.1"
API_PORT_SEND = 6311
API_PORT_LISTEN = 6310


def send_data_to_jsx(obj):
    """Отправка ответа обратно"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect((API_HOST, API_PORT_SEND))
        s.send(json.dumps(obj).encode("utf-8"))
        s.close()
    except Exception as e:
        print("[ERROR] Ошибка отправки ответа:", e)
        sys.exit()


def install_if_missing(package, import_name=None):
    if import_name is None:
        import_name = package
    try:
        __import__(import_name)
        return
    except ImportError:
        print(f"[INFO] Модуль '{import_name}' не найден. Устанавливаю '{package}'...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", package])
        except Exception as e:
            print(f"[ERROR] Не удалось установить {package}: {e}")
            raise
        print(f"[INFO] Модуль '{package}' успешно установлен.")


send_data_to_jsx({"type": "answer", "message": "init"})
install_if_missing("mediapipe")
install_if_missing("opencv-python", "cv2")
install_if_missing("numpy")
import cv2
import mediapipe as mp
import numpy as np


def detect_face_landmarks(image_path):
    print("[INFO] Загружаю изображение:", image_path)
    if not os.path.exists(image_path):
        print("[ERROR] Файл не найден")
        return {}
    img = cv2.imread(image_path)
    if img is None:
        print("[ERROR] Невозможно прочитать изображение")
        return {}
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    mp_face_mesh = mp.solutions.face_mesh
    print("[INFO] Инициализация MediaPipe FaceMesh...")
    try:
        with mp_face_mesh.FaceMesh(
            static_image_mode=True, max_num_faces=1, refine_landmarks=True
        ) as face_mesh:
            result = face_mesh.process(rgb)
            if not result.multi_face_landmarks:
                print("[INFO] Лицо не найдено")
                return {}
            print("[INFO] Лицо найдено, извлекаю точки...")
            h, w, _ = img.shape
            face = result.multi_face_landmarks[0]
            points = {
                str(i): (int(lm.x * w), int(lm.y * h))
                for i, lm in enumerate(face.landmark)
            }
            print(f"[INFO] Найдено точек: {len(points)}")
            return points
    finally:
        try:
            print("[INFO] Удаляю временный файл...")
            os.remove(image_path)
            print("[INFO] Файл удалён.")
        except Exception as e:
            print("[WARNING] Не удалось удалить файл:", e)


def start_server():
    print("[INFO] Запуск сервера", API_HOST, API_PORT_LISTEN)
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.bind((API_HOST, API_PORT_LISTEN))
    server.listen(1)
    print("[INFO] Handshake → OK")
    send_data_to_jsx({"type": "answer", "message": "success"})
    while True:
        try:
            client_socket, addr = server.accept()
            print("[INFO] Клиент подключен:", addr)
            raw = client_socket.recv(4096)
            message = json.loads(raw.decode("utf-8"))
            print("[INFO] Получено:", message)
            if message["type"] == "payload":
                filepath = message["message"]
                print("[INFO] Получен путь к файлу:", filepath)
                try:
                    points = detect_face_landmarks(filepath)
                    send_data_to_jsx({"type": "answer", "message": points})
                except Exception as e:
                    print("[ERROR] Ошибка обработки:", e)
                    send_data_to_jsx({"type": "answer", "message": None})
            if message["type"] == "exit":
                print("[INFO] Остановка сервера")
                server.close()
        except Exception as e:
            print(f"Произошла ошибка: {e}")
            send_data_to_jsx({"type": "answer", "message": None})
            sys.exit()


if __name__ == "__main__":
    print("[INFO] Скрипт запущен")
    start_server()
    print("[INFO] Скрипт завершён")
