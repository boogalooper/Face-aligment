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
API_PORT_SEND = 6321
API_PORT_LISTEN = 6320

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
request_lock = threading.Lock()


# ================= FACE =================

def get_detector():
    global detector

    if detector is not None:
        return detector

    with detector_lock:
        if detector is not None:
            return detector

        print("[INIT] Загрузка FaceLandmarker...")

        if not os.path.exists(MODEL_PATH):
            print("[ERROR] face_landmarker.task не найден")
            sys.exit(1)

        base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
        options = vision.FaceLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.IMAGE,
            num_faces=1,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )

        detector = vision.FaceLandmarker.create_from_options(options)
        print("[INIT] FaceLandmarker готов")

        return detector


def detect_face_landmarks(image_path):
    try:
        print(f"[FACE] Обработка: {image_path}")

        if not os.path.exists(image_path):
            print("[FACE] Файл не найден")
            return None

        img = cv2.imread(image_path)
        if img is None:
            print("[FACE] Ошибка чтения изображения")
            return None

        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        detector_instance = get_detector()

        with detector_lock:
            result = detector_instance.detect(mp_image)

        if not result.face_landmarks:
            print("[FACE] Лицо не найдено")
            return None

        h, w, _ = img.shape
        face = result.face_landmarks[0]

        points = {
            str(i): (int(lm.x * w), int(lm.y * h))
            for i, lm in enumerate(face)
        }

        print(f"[FACE] Найдено точек: {len(points)}")
        return points

    except Exception as e:
        print("[FACE ERROR]", e)
        return {}


# ================= POSE =================

def get_pose_detector():
    global pose_detector

    if pose_detector is not None:
        return pose_detector

    with pose_detector_lock:
        if pose_detector is not None:
            return pose_detector

        print("[INIT] Загрузка PoseLandmarker...")

        if not os.path.exists(POSE_MODEL_PATH):
            print("[ERROR] pose_landmarker_heavy.task не найден")
            sys.exit(1)

        base_options = python.BaseOptions(model_asset_path=POSE_MODEL_PATH)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.IMAGE,
            num_poses=1,
            output_segmentation_masks=False,
        )

        pose_detector = vision.PoseLandmarker.create_from_options(options)
        print("[INIT] PoseLandmarker готов")

        return pose_detector


def detect_pose(image_path):
    try:
        print(f"[POSE] Обработка: {image_path}")

        if not os.path.exists(image_path):
            print("[POSE] Файл не найден")
            return None

        img = cv2.imread(image_path)
        if img is None:
            print("[POSE] Ошибка чтения изображения")
            return None

        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        detector_instance = get_pose_detector()

        with pose_detector_lock:
            result = detector_instance.detect(mp_image)

        if not result.pose_landmarks:
            print("[POSE] Поза не найдена")
            return None

        h, w, _ = img.shape
        pose = result.pose_landmarks[0]

        points = {
            str(i): (int(lm.x * w), int(lm.y * h), float(lm.visibility))
            for i, lm in enumerate(pose)
        }

        print(f"[POSE] Найдено точек: {len(points)}")
        return points

    except Exception as e:
        print("[POSE ERROR]", e)
        return {}


# ================= SERVICE =================

def timeout_watcher():
    global last_request_time
    while True:
        time.sleep(5)
        idle = time.time() - last_request_time
        if idle > TIMEOUT:
            print("[TIMEOUT] Сервер простаивал → завершение")
            os._exit(0)


def send_data_to_jsx(obj):
    try:
        print(f"[SEND] -> JSX: {obj.get('type')}")
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(10)
            s.connect((API_HOST, API_PORT_SEND))
            s.send(json.dumps(obj).encode("utf-8"))
    except Exception as e:
        print("[SEND ERROR]", e)


# ================= MULTITHREADED SERVER =================

def handle_client(client_socket, server):
    global last_request_time

    try:
        client_socket.settimeout(10)

        with client_socket:
            print("[CONNECT] Клиент подключён")

            raw = client_socket.recv(8192)
            if not raw:
                print("[CONNECT] Пустое сообщение")
                return

            message = json.loads(raw.decode("utf-8"))
            msg_type = message.get("type")

            print(f"[REQUEST] Тип: {msg_type}")

            last_request_time = time.time()

            if msg_type == "handshake":
                print("[HANDSHAKE] Ответ отправлен")
                send_data_to_jsx({"type": "answer", "message": "success"})

            elif msg_type == "face":
                if not request_lock.acquire(blocking=False):
                    send_data_to_jsx({"type": "error", "message": "Detection is busy"})
                    return
                try:
                    filepath = message.get("message")
                    points = detect_face_landmarks(filepath)
                    send_data_to_jsx({"type": "answer", "message": points})
                finally:
                    request_lock.release()

            elif msg_type == "pose":
                if not request_lock.acquire(blocking=False):
                    send_data_to_jsx({"type": "error", "message": "Detection is busy"})
                    return
                try:
                    filepath = message.get("message")
                    points = detect_pose(filepath)
                    send_data_to_jsx({"type": "answer", "message": points})
                finally:
                    request_lock.release()

            elif msg_type == "exit":
                print("[EXIT] Завершение сервера")
                server.close()
                os._exit(0)

    except Exception as e:
        print("[HANDLE ERROR]", e)
        send_data_to_jsx({"type": "error", "message": str(e)})


def start_server():
    print("[START] Запуск сервера:", API_HOST, API_PORT_LISTEN)

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((API_HOST, API_PORT_LISTEN))
    server.listen(20)
    server.settimeout(5)

    print("[READY] Сервер слушает порт")

    send_data_to_jsx({"type": "answer", "message": "success"})
    print("[READY] Клиент уведомлён о старте")

    threading.Thread(target=timeout_watcher, daemon=True).start()

    while True:
        try:
            client_socket, addr = server.accept()
            print(f"[ACCEPT] Подключение от {addr}")

            threading.Thread(
                target=handle_client,
                args=(client_socket, server),
                daemon=True
            ).start()

        except socket.timeout:
            continue

        except Exception as e:
            print("[ACCEPT ERROR]", e)


# ================= MAIN =================

if __name__ == "__main__":
    print("[BOOT] Скрипт запущен")

    get_detector()
    get_pose_detector()

    start_server()