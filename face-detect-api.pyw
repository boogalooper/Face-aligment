import os
import sys
import socket
import json
import time
import threading
import cv2

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
POSE_MODEL_PATH = os.path.join(LIB_DIR, "pose_landmarker_heavy.task")

detector = None
pose_detector = None

detector_lock = threading.Lock()
pose_detector_lock = threading.Lock()


# ================= FACE =================

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
                output_facial_transformation_matrixes=False,
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
        print("[INFO] Загружаю (face):", image_path)

        if not os.path.exists(image_path):
            send_data_to_jsx({"type": "error", "message": "Файл не найден"})
            return None

        img = cv2.imread(image_path)
        if img is None:
            send_data_to_jsx({"type": "error", "message": "Ошибка чтения изображения"})
            return None

        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        detector_instance = get_detector()
        result = detector_instance.detect(mp_image)

        if not result.face_landmarks:
            print("[INFO] Лицо не найдено")
            return None

        h, w, _ = img.shape
        face = result.face_landmarks[0]

        points = {str(i): (int(lm.x * w), int(lm.y * h)) for i, lm in enumerate(face)}

        print(f"[INFO] Найдено face-точек: {len(points)}")
        return points

    except Exception as e:
        send_data_to_jsx({"type": "error", "message": f"Ошибка face: {e}"})
        return {}


def get_pose_detector():
    global pose_detector

    if pose_detector is not None:
        return pose_detector

    with pose_detector_lock:
        if pose_detector is not None:
            return pose_detector

        if not os.path.exists(POSE_MODEL_PATH):
            error_msg = "pose_landmarker_heavy.task не найден."
            print(error_msg)
            send_data_to_jsx({"type": "error", "message": error_msg})
            sys.exit(1)

        try:
            print("[INFO] Инициализация PoseLandmarker...")

            base_options = python.BaseOptions(model_asset_path=POSE_MODEL_PATH)
            options = vision.PoseLandmarkerOptions(
                base_options=base_options,
                running_mode=vision.RunningMode.IMAGE,
                num_poses=1,
                output_segmentation_masks=False,
            )

            pose_detector = vision.PoseLandmarker.create_from_options(options)

            print("[INFO] PoseLandmarker инициализирован.")
            return pose_detector

        except Exception as e:
            error_msg = f"Ошибка инициализации PoseLandmarker: {e}"
            print(error_msg)
            send_data_to_jsx({"type": "error", "message": error_msg})
            sys.exit(1)


def detect_pose(image_path):
    try:
        print("[INFO] Загружаю (pose):", image_path)

        if not os.path.exists(image_path):
            send_data_to_jsx({"type": "error", "message": "Файл не найден"})
            return None

        img = cv2.imread(image_path)
        if img is None:
            send_data_to_jsx({"type": "error", "message": "Ошибка чтения изображения"})
            return None

        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        detector_instance = get_pose_detector()
        result = detector_instance.detect(mp_image)

        if not result.pose_landmarks:
            print("[INFO] Поза не найдена")
            return None

        h, w, _ = img.shape
        pose = result.pose_landmarks[0]

        points = {
            str(i): (int(lm.x * w), int(lm.y * h), float(lm.visibility))
            for i, lm in enumerate(pose)
        }

        print(f"[INFO] Найдено pose-точек: {len(points)}")

        return points

    except Exception as e:
        send_data_to_jsx({"type": "error", "message": f"Ошибка pose: {e}"})
        return {}


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

                if msg_type == "face":
                    filepath = message.get("message")
                    points = detect_face_landmarks(filepath)
                    send_data_to_jsx({"type": "answer", "message": points})

                elif msg_type == "pose":
                    filepath = message.get("message")
                    points = detect_pose(filepath)
                    send_data_to_jsx({"type": "answer", "message": points})

                elif msg_type == "exit":
                    print("[INFO] Завершение сервера")
                    server.close()
                    sys.exit()

                elif msg_type == "handshake":
                    send_data_to_jsx({"type": "answer", "message": "success"})

        except Exception as e:
            send_data_to_jsx({"type": "error", "message": f"Сервер: {e}"})


if __name__ == "__main__":
    print("[INFO] Скрипт запущен")
    get_detector()
    get_pose_detector()
    start_server()
