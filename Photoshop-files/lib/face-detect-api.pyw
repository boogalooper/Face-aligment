import os
import sys
import socket
import json
import time
import threading
import multiprocessing
import cv2
import numpy as np
import math
import tempfile
import re
import logging
from logging.handlers import RotatingFileHandler

from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import mediapipe as mp


API_HOST = "127.0.0.1"
API_PORT_SEND = 6331
API_PORT_LISTEN = 6330

TIMEOUT = 15 * 60
last_request_time = time.time()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def resolve_model_path(filename):
    return os.path.join(sys.prefix, "models", filename)



MODEL_PATH = resolve_model_path("face_landmarker.task")
POSE_MODEL_PATH = resolve_model_path("pose_landmarker_heavy.task")

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
            raise RuntimeError("Missing model; run install_runtime.bat")

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


def detect_face_landmarks(image_path, use_head=False):
    try:
        print(f"[FACE] Обработка: {image_path}")

        if not os.path.exists(image_path):
            print("[FACE] Файл не найден")
            return None

        img = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)
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
            str(i): (float(lm.x * w), float(lm.y * h))
            for i, lm in enumerate(face)
        }

        if use_head:
            try:
                head = measure_head(img, points)
                if head is not None:
                    points["head"] = head
            except Exception:
                logging.exception("Optional head contour unavailable")
        print(f"[FACE] Найдено точек: {len(points)}")
        return points

    except Exception as e:
        logging.exception("Face detection failed")
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
            raise RuntimeError("Missing model; run install_runtime.bat")

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

        img = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)
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
        logging.exception("Pose detection failed")
        print("[POSE ERROR]", e)
        return {}




# Optional contour support. Models are loaded lazily; errors never remove face points.
segmenter = None
face_detector = None


def get_contour_models():
    global segmenter, face_detector
    if segmenter is None:
        segmenter = cv2.dnn.readNet(resolve_model_path("human.onnx"))
        segmenter.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
        segmenter.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
    if face_detector is None:
        face_detector = cv2.FaceDetectorYN.create(
            resolve_model_path("face.onnx"), "", (320, 320), 0.6, 0.3, 5000)
    return segmenter, face_detector


def contour_height(mask, eye, eye_span):
    """Conservative measurement in an eye-levelled local crop, or None."""
    h, w = mask.shape
    ex, ey = eye
    if eye_span < 16 or not (0 <= ex < w and 0 <= ey < h):
        return None
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    x0, x1 = max(0, int(ex - eye_span*.22)), min(w, int(ex + eye_span*.22)+1)
    y0, y1 = max(0, int(ey)), min(h, int(ey + eye_span*.3)+1)
    ids = labels[y0:y1, x0:x1].ravel()
    ids = ids[ids > 0]
    if not ids.size:
        return None
    label = int(np.bincount(ids).argmax())
    if stats[label, cv2.CC_STAT_TOP] <= 2:
        return None  # crop/image top touched: no reliable crown
    component = labels == label
    if np.mean(component[y0:y1, x0:x1]) < .85:
        return None
    tops = []
    for x in range(x0, x1):
        ys = np.flatnonzero(component[:min(h, int(ey)+1), x])
        if len(ys):
            tops.append(float(ys[0]))
    if len(tops) < .8 * (x1-x0):
        return None
    top = float(np.median(tops))
    height = ey - top
    if not .45 * eye_span < height < 1.6 * eye_span:
        return None
    if float(np.percentile(tops, 90)-np.percentile(tops, 10)) > .20 * eye_span:
        return None
    return float(height)


def measure_head(img, points):
    left, right = np.array(points["33"]), np.array(points["263"])
    eye = (left + right) * .5
    span = float(np.linalg.norm(right-left))
    if span < 20:
        return None
    axis = (right-left) / span
    down = np.array([-axis[1], axis[0]])
    # 3.6 eye spans square, eyes at (1.8, 2.0). All operations are
    # measurement-only: no rotation/warp is applied to the Photoshop layer.
    unit = 100.0
    matrix = np.array([[axis[0]*unit/span, axis[1]*unit/span, 180.-np.dot(axis,eye)*unit/span],
                       [down[0]*unit/span, down[1]*unit/span, 200.-np.dot(down,eye)*unit/span]])
    patch = cv2.warpAffine(img, matrix, (360, 360), borderMode=cv2.BORDER_CONSTANT)
    valid = cv2.warpAffine(np.ones(img.shape[:2],np.uint8), matrix, (360,360), flags=cv2.INTER_NEAREST)
    # A missing source-image area above the face cannot be interpreted as background.
    if np.mean(valid[30:225, 125:235]) < .995:
        return None
    net, detector = get_contour_models()
    detector.setInputSize((360,360))
    _, faces = detector.detect(patch)
    if faces is None:
        return None
    matches = [f for f in faces if f[0] <= 180 <= f[0]+f[2] and f[1] <= 200 <= f[1]+f[3]]
    if len(matches) != 1 or len(faces) != 1:
        return None  # another nearby person makes the contour ambiguous
    rgb = cv2.cvtColor(cv2.resize(patch,(192,192)),cv2.COLOR_BGR2RGB)
    rgb = (rgb.astype(np.float32)/255.0 - .5)/.5
    net.setInput(cv2.dnn.blobFromImage(rgb))
    output = net.forward()[0]
    logits = cv2.resize(output.transpose(1,2,0),(360,360),interpolation=cv2.INTER_LINEAR)
    mask = np.argmax(logits,axis=2).astype(np.uint8)
    height = contour_height(mask,(180.,200.),100.)
    if height is None:
        return None
    return {"height": height * span / unit, "quality": 1.0}


SERVER_ID = "face-alignment/0.143"


pending_cleanup = set()
cleanup_lock = threading.Lock()


def queue_preview_cleanup(path):
    # Accept only this script's generated filenames directly inside OS TEMP.
    if not isinstance(path, str):
        return False
    path = os.path.abspath(path)
    if (os.path.normcase(os.path.realpath(os.path.dirname(path))) !=
            os.path.normcase(os.path.realpath(tempfile.gettempdir()))):
        return False
    if not re.fullmatch(r"FD_\d+_\d+_\d+\.jpg", os.path.basename(path), re.IGNORECASE):
        return False
    with cleanup_lock:
        pending_cleanup.add(path)
    flush_preview_cleanup()
    return True


def flush_preview_cleanup():
    # A timed-out JSX may request deletion while analysis is still using the file.
    if not request_lock.acquire(False):
        return
    try:
        with cleanup_lock:
            for path in list(pending_cleanup):
                try:
                    os.remove(path)
                except FileNotFoundError:
                    pass
                except OSError:
                    continue  # Retry on the next idle tick.
                pending_cleanup.discard(path)
    finally:
        request_lock.release()


def receive_json(client):
    data = bytearray()
    while len(data) < 65536:
        block = client.recv(4096)
        if not block:
            break
        data.extend(block)
        if b"\n" in data:
            break
    return json.loads(bytes(data).decode("utf-8"))


def send_data_to_jsx(obj):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
        connection.settimeout(5)
        connection.connect((API_HOST, API_PORT_SEND))
        connection.sendall((json.dumps(obj, ensure_ascii=True, allow_nan=False)+"\n").encode("ascii"))


def detection_worker(connection):
    # Windows spawn: keep one worker alive so normal requests reuse the models.
    if sys.stdout is None:
        sys.stdout = open(os.devnull, 'w')
    if sys.stderr is None:
        sys.stderr = open(os.devnull, 'w')
    try:
        while True:
            message = connection.recv()
            if message is None:
                break
            try:
                path = message.get('message')
                points = (detect_face_landmarks(path, message.get('head_support') is True)
                          if message['type'] == 'face' else detect_pose(path))
                connection.send(('answer', points))
            except Exception as exc:
                connection.send(('error', str(exc)))
    except (EOFError, BrokenPipeError):
        pass
    finally:
        connection.close()


class DetectionCancelled(Exception):
    pass


class DetectionWorker:
    def __init__(self, target=None):
        self.target = target or detection_worker
        self.process = None
        self.connection = None
        self.tainted = False

    def stop(self):
        process = self.process
        if process is not None:
            if process.is_alive():
                process.terminate()
            process.join(2)
            if process.is_alive():
                process.kill()
                process.join(2)
            if process.is_alive():
                raise RuntimeError('Could not stop the detection process')
            process.close()
        if self.connection is not None:
            self.connection.close()
        self.process = self.connection = None
        self.tainted = False

    def ensure(self):
        if self.tainted:
            self.stop()
        if self.process is not None and self.process.is_alive():
            return
        self.stop()
        context = multiprocessing.get_context('spawn')
        parent, child = context.Pipe()
        process = context.Process(target=self.target, args=(child,), daemon=True)
        try:
            process.start()
        except Exception:
            parent.close()
            child.close()
            raise
        child.close()
        self.process, self.connection = process, parent

    def run(self, message, job):
        try:
            if job['cancel'].is_set():
                raise DetectionCancelled('Detection cancelled')
            self.ensure()
            self.connection.send(message)
            while True:
                now = time.monotonic()
                if job['cancel'].is_set():
                    raise DetectionCancelled('Detection cancelled')
                if now >= job['deadline']:
                    raise DetectionCancelled('Detection timeout')
                if now - job['heartbeat'] > 8:
                    raise DetectionCancelled('Photoshop stopped responding')
                if self.connection.poll(.05):
                    result = self.connection.recv()
                    if job['cancel'].is_set():
                        raise DetectionCancelled('Detection cancelled')
                    return result
                if not self.process.is_alive():
                    raise RuntimeError('Detection process exited unexpectedly')
        except Exception:
            # terminate/kill interrupts native MediaPipe/OpenCV, not just Python code.
            self.tainted = True
            self.stop()
            raise


worker = DetectionWorker()
job_state_lock = threading.Lock()
active_job = None
cancelled_requests = {}


def cancel_job(request_id):
    if not isinstance(request_id, str) or not request_id:
        return False
    now = time.monotonic()
    with job_state_lock:
        for key, until in list(cancelled_requests.items()):
            if until < now:
                del cancelled_requests[key]
        # Covers cancel arriving before the detection handler registers its job.
        cancelled_requests[request_id] = now + 120
        job = active_job
        if job is not None and job['id'] == request_id:
            job['cancel'].set()
        else:
            return True
    return job['done'].wait(5) and job['stopped']


def heartbeat_job(request_id):
    with job_state_lock:
        if active_job is not None and active_job['id'] == request_id:
            active_job['heartbeat'] = time.monotonic()


def handle_client(client_socket):
    global last_request_time, active_job
    request_id = None
    def reply(kind, message):
        send_data_to_jsx({'type': kind, 'message': message,
                          'request_id': request_id, 'server_id': SERVER_ID})
    try:
        with client_socket:
            client_socket.settimeout(6)
            message = receive_json(client_socket)
            request_id = message.get('request_id')
            kind = message.get('type')
            last_request_time = time.monotonic()
            if kind == 'cancel':
                stopped = cancel_job(message.get('target_id'))
                client_socket.sendall((json.dumps({'stopped': stopped})+'\n').encode('ascii'))
                return
            if kind == 'heartbeat':
                heartbeat_job(message.get('target_id'))
                return
        if kind == 'handshake':
            reply('answer', SERVER_ID)
        elif kind == 'cleanup':
            reply('answer', queue_preview_cleanup(message.get('message')))
        elif kind in ('face', 'pose'):
            if not isinstance(request_id, str) or not request_id:
                reply('error', 'Missing request ID')
                return
            if not request_lock.acquire(False):
                reply('error', 'Detection is busy')
                return
            job = {'id': request_id, 'cancel': threading.Event(), 'done': threading.Event(),
                   'deadline': time.monotonic()+60, 'heartbeat': time.monotonic(), 'stopped': False}
            completed = False
            try:
                with job_state_lock:
                    active_job = job
                    if cancelled_requests.get(request_id, 0) >= time.monotonic():
                        job['cancel'].set()
                result_type, result = worker.run(message, job)
                completed = True
            except DetectionCancelled as exc:
                result_type, result = 'cancelled', str(exc)
            except Exception as exc:
                logging.exception('Detection worker failed')
                result_type, result = 'error', str(exc)
            finally:
                with job_state_lock:
                    active_job = None
                    cancelled_requests.pop(request_id, None)
                last_request_time = time.monotonic()
                # Acknowledge cancellation only after the worker has exited and
                # the slot is available for the next request.
                job['stopped'] = completed or worker.process is None
                request_lock.release()
                job['done'].set()
                flush_preview_cleanup()
            if not job['cancel'].is_set():
                reply(result_type, result)
        else:
            reply('error', 'Unknown request')
    except Exception as exc:
        logging.exception('Request failed')
        try:
            reply('error', str(exc))
        except Exception:
            pass

def start_server():
    global last_request_time
    last_request_time = time.monotonic()
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            server.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        server.bind((API_HOST, API_PORT_LISTEN))
        server.listen(8)
        server.settimeout(5)
        while True:
            try:
                client, _ = server.accept()
                threading.Thread(target=handle_client,args=(client,),daemon=True).start()
            except socket.timeout:
                flush_preview_cleanup()
                if not request_lock.locked() and time.monotonic()-last_request_time > TIMEOUT:
                    break


def check_task(path, kind):
    opts = python.BaseOptions(model_asset_path=path)
    if kind == "face":
        model = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=opts))
    else:
        model = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=opts))
    model.close()


if __name__ == "__main__":
    multiprocessing.freeze_support()
    if "--check-task" in sys.argv:
        check_task(sys.argv[2], sys.argv[3])
    elif "--self-test" in sys.argv:
        check_task(MODEL_PATH,"face")
        check_task(POSE_MODEL_PATH,"pose")
        get_contour_models()
        segmenter.setInput(np.zeros((1,3,192,192),np.float32))
        assert segmenter.forward().shape[1] == 2
        print("Face, pose, human contour and face detector: OK")
    else:
        log_dir = os.path.dirname(sys.prefix)
        os.makedirs(log_dir,exist_ok=True)
        logging.basicConfig(handlers=[RotatingFileHandler(os.path.join(log_dir,"server.log"),maxBytes=1000000,backupCount=2,encoding="utf-8")],level=logging.INFO)
        # pythonw has no standard streams; keep legacy diagnostic prints harmless.
        if sys.stdout is None:
            sys.stdout = open(os.devnull,"w")
        if sys.stderr is None:
            sys.stderr = open(os.devnull,"w")
        try:
            start_server()
        except OSError:
            logging.exception("Server could not bind its dedicated port")
        finally:
            worker.stop()
