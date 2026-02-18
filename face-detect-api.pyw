import os
import sys
import socket
import json
import time
import threading
import cv2
import numpy as np

from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import mediapipe as mp

API_HOST = "127.0.0.1"
API_PORT_SEND = 6311
API_PORT_LISTEN = 6310

TIMEOUT = 5 * 60
last_request_time = time.time()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LIB_DIR = os.path.join(BASE_DIR, "lib")
MODEL_PATH = os.path.join(LIB_DIR, "face_landmarker.task")

detector = None
detector_lock = threading.Lock()

# SAFE INITIALIZATION (CACHE + PROTECTION)
def get_detector():
    global detector

    if detector is not None:
        return detector

    with detector_lock:
        if detector is not None:
            return detector

        if not os.path.exists(MODEL_PATH):
            error_msg = "face_landmarker.task не найден."
            print(error_msg)
            send_data_to_jsx({"type": "error", "message": error_msg})
            sys.exit(1)

        try:
            print("[INFO] Инициализация FaceLandmarker...")

            base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
            options = vision.FaceLandmarkerOptions(
                base_options=base_options,
                running_mode=vision.RunningMode.IMAGE,
                num_faces=1,
                output_face_blendshapes=False,
                output_facial_transformation_matrixes=False
            )

            detector = vision.FaceLandmarker.create_from_options(options)
            print("[INFO] FaceLandmarker инициализирован.")
            return detector

        except Exception as e:
            error_msg = f"Ошибка инициализации FaceLandmarker: {e}"
            print(error_msg)
            send_data_to_jsx({"type": "error", "message": error_msg})
            sys.exit(1)

def detect_face_landmarks(image_path):
    try:
        print("[INFO] Загружаю:", image_path)

        if not os.path.exists(image_path):
            error_msg = "Файл не найден"
            print(error_msg)
            send_data_to_jsx({"type": "error", "message": error_msg})
            return {}

        img = cv2.imread(image_path)
        if img is None:
            error_msg = "Ошибка чтения изображения"
            print(error_msg)
            send_data_to_jsx({"type": "error", "message": error_msg})
            return {}

        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        detector_instance = get_detector()
        result = detector_instance.detect(mp_image)

        if not result.face_landmarks:
            print("[INFO] Лицо не найдено")
            safe_remove(image_path)
            return {}

        h, w, _ = img.shape
        face = result.face_landmarks[0]
        points = {str(i): (int(landmark.x * w), int(landmark.y * h)) for i, landmark in enumerate(face)}

        print(f"[INFO] Найдено точек: {len(points)}")
        safe_remove(image_path)
        return points

    except Exception as e:
        error_msg = f"Ошибка при распознавании лица: {e}"
        print(error_msg)
        send_data_to_jsx({"type": "error", "message": error_msg})
        return {}
    
def safe_remove(path):
    try:
        os.remove(path)
        print("[INFO] Временный файл удалён.")
    except Exception:
        pass

# SERVER
def timeout_watcher():
    global last_request_time
    while True:
        time.sleep(5)
        if time.time() - last_request_time > TIMEOUT:
            print("[INFO] Сервер простаивал → завершение")
            os._exit(0)

def send_data_to_jsx(obj):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((API_HOST, API_PORT_SEND))
            s.send(json.dumps(obj).encode("utf-8"))
    except Exception as e:
        print("[ERROR] Ошибка отправки:", e)

def start_server():
    global last_request_time

    print("[INFO] Запуск сервера:", API_HOST, API_PORT_LISTEN)

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((API_HOST, API_PORT_LISTEN))
    server.listen(5)

    send_data_to_jsx({"type": "answer", "message": "success"})
    print("[INFO] Handshake OK")

    threading.Thread(target=timeout_watcher, daemon=True).start()

    while True:
        try:
            client_socket, addr = server.accept()
            last_request_time = time.time()

            with client_socket:
                raw = client_socket.recv(8192)
                message = json.loads(raw.decode("utf-8"))

                msg_type = message.get("type")

                if msg_type == "payload":
                    filepath = message.get("message")
                    points = detect_face_landmarks(filepath)
                    send_data_to_jsx({"type": "answer", "message": points})

                elif msg_type == "exit":
                    print("[INFO] Завершение сервера")
                    server.close()
                    sys.exit()

                elif msg_type == "handshake":
                    send_data_to_jsx({"type": "answer", "message": "success"})
        except Exception as e:
            error_msg = f"Сервер: {e}"
            print(error_msg)
            send_data_to_jsx({"type": "error", "message": error_msg})

if __name__ == "__main__":
    print("[INFO] Скрипт запущен")
    send_data_to_jsx({"type": "answer", "message": "init"})
    get_detector()  # предзагрузка и кэширование
    start_server()
