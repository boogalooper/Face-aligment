import os
import sys
import socket
import json
import time
import threading
import cv2
import numpy as np
import math
import tempfile
import re
import logging
import io
import zipfile
from PIL import Image
import uuid
import struct
import zlib
from concurrent.futures import ThreadPoolExecutor
from logging.handlers import RotatingFileHandler

from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import mediapipe as mp


# PSD/PSB reader is embedded here so deployment needs only this .pyw.
MAX_BYTES = 512 * 1024 * 1024


def _read(f, size, end=None):
    if size < 0 or (end is not None and f.tell()+size > end):
        raise ValueError('Invalid PSD/PSB section boundary')
    data = f.read(size)
    if len(data) != size:
        raise ValueError('Truncated PSD/PSB composite')
    return data


def read_composite(path):
    with open(path, 'rb') as f:
        total = os.fstat(f.fileno()).st_size
        signature, version, _, channels, h, w, depth, mode = struct.unpack('>4sH6sHIIHH', _read(f, 26))
        if signature != b'8BPS' or version not in (1, 2):
            raise ValueError('Not a PSD/PSB file')
        if mode not in (1, 3) or depth not in (8, 16, 32):
            raise ValueError('PSB input requires RGB or grayscale, 8/16/32 bits')
        colors = 3 if mode == 3 else 1
        if not 1 <= w <= 300000 or not 1 <= h <= 300000 or not colors <= channels <= 56:
            raise ValueError('Invalid PSD/PSB dimensions/channels')
        expected = w * h * channels * (depth // 8)
        if expected > MAX_BYTES:
            raise ValueError('Composite exceeds 512 MiB; enable Resize for detector')
        # Color data, resources, layer/mask section. No reading layer pixel data.
        for fmt in ('>I', '>I', '>Q' if version == 2 else '>I'):
            size = struct.unpack(fmt, _read(f, struct.calcsize(fmt)))[0]
            if f.tell() + size > total:
                raise ValueError('Invalid PSD/PSB section length')
            f.seek(size, 1)
        compression = struct.unpack('>H', _read(f, 2))[0]
        count = w * h * colors * (depth // 8)
        if compression == 0:
            data = _read(f, count)
        elif compression == 1:
            lengths = np.frombuffer(_read(f, h * channels * (4 if version == 2 else 2)),
                                    dtype='>u4' if version == 2 else '>u2')
            n = int(lengths[:h * colors].sum())
            if n > MAX_BYTES or f.tell() + int(lengths.sum()) > total:
                raise ValueError('Invalid RLE byte counts')
            packed = _read(f, n)
            # PSD RLE is PackBits over byte rows, also for 16/32-bit pixels.
            data = Image.frombytes('L', (w * (depth // 8), h * colors),
                                   packed, 'packbits', 'L').tobytes()
        elif compression in (2, 3):
            packed = f.read(MAX_BYTES + 1)
            if len(packed) > MAX_BYTES:
                raise ValueError('ZIP composite input too large')
            codec = zlib.decompressobj()
            data = codec.decompress(packed, expected + 1)
            if len(data) != expected or not codec.eof or codec.unconsumed_tail or codec.unused_data:
                raise ValueError('Invalid ZIP composite size/stream')
            data = data[:count]
        else:
            raise ValueError('Unknown PSD/PSB compression')
        if len(data) != count:
            raise ValueError('Invalid composite byte count')
        rows = h * colors
        if compression == 3:
            if depth == 8:
                data = np.frombuffer(data, np.uint8).reshape(rows, w).cumsum(axis=1, dtype=np.uint8).tobytes()
            elif depth == 16:
                data = np.frombuffer(data, '>u2').reshape(rows, w).cumsum(axis=1, dtype=np.uint16).astype('>u2').tobytes()
            else:
                delta = np.frombuffer(data, np.uint8).reshape(rows, w * 4).cumsum(axis=1, dtype=np.uint8)
                data = delta.reshape(rows, 4, w).transpose(0, 2, 1).copy().tobytes()
        dtype = {8: np.uint8, 16: '>u2', 32: '>f4'}[depth]
        image = np.frombuffer(data, dtype).reshape(colors, h, w).transpose(1, 2, 0)
        if depth == 16:
            image = (image >> 8).astype(np.uint8)
        elif depth == 32:
            # Linear float RGB -> display sRGB for the detectors.
            image = np.nan_to_num(image, nan=0.0, posinf=1.0, neginf=0.0)
            image = np.clip(image, 0, 1)
            image = np.where(image <= .0031308, image * 12.92, 1.055 * image ** (1 / 2.4) - .055)
            image = np.rint(image * 255).astype(np.uint8)
        if colors == 1:
            image = np.repeat(image, 3, axis=2)
        return np.ascontiguousarray(image[:, :, ::-1])  # OpenCV BGR


def _layer_plane(data, w, h, depth, version, alpha=False):
    """Decode one raster channel (the RLE table is local to this channel)."""
    if len(data)<2 or depth not in (8,16,32) or w<=0 or h<=0 or w*h*(depth//8)>MAX_BYTES:
        raise ValueError('Invalid raster channel header or dimensions')
    compression = int.from_bytes(data[:2], 'big')
    expected = w*h*(depth//8)
    payload = data[2:]
    if compression == 0:
        raw = payload
    elif compression == 1:
        size = 4 if version == 2 else 2
        table_bytes = size*h
        if len(payload) < table_bytes:
            raise ValueError('Truncated layer RLE table')
        lengths = np.frombuffer(payload[:table_bytes], '>u4' if version == 2 else '>u2')
        if int(lengths.sum()) != len(payload)-table_bytes:
            raise ValueError('Invalid layer RLE byte counts')
        raw = Image.frombytes('L',(w*(depth//8),h),payload[table_bytes:],'packbits','L').tobytes()
    elif compression in (2,3):
        codec = zlib.decompressobj()
        raw = codec.decompress(payload,expected+1)
        if len(raw) != expected or not codec.eof or codec.unconsumed_tail or codec.unused_data:
            raise ValueError('Invalid layer ZIP stream')
    else:
        raise ValueError('Unknown layer compression')
    if len(raw) != expected:
        raise ValueError('Invalid raster channel size')
    if compression == 3:
        if depth == 8:
            raw = np.frombuffer(raw,np.uint8).reshape(h,w).cumsum(axis=1,dtype=np.uint8).tobytes()
        elif depth == 16:
            raw = np.frombuffer(raw,'>u2').reshape(h,w).cumsum(axis=1,dtype=np.uint16).astype('>u2').tobytes()
        else:
            delta = np.frombuffer(raw,np.uint8).reshape(h,w*4).cumsum(axis=1,dtype=np.uint8)
            raw = delta.reshape(h,4,w).transpose(0,2,1).copy().tobytes()
    plane = np.frombuffer(raw,{8:np.uint8,16:'>u2',32:'>f4'}[depth]).reshape(h,w)
    if depth == 16:
        return (plane >> 8).astype(np.uint8)
    if depth == 32:
        plane = np.clip(np.nan_to_num(plane,nan=0,posinf=1,neginf=0),0,1)
        if not alpha:
            plane = np.where(plane<=.0031308,plane*12.92,1.055*plane**(1/2.4)-.055)
        return np.rint(plane*255).astype(np.uint8)
    return plane


def _single_layer(f, offset, length, version, depth, mode, canvas_w, canvas_h):
    """Narrow fast path: one visible normal raster layer without a user mask.

    Return None for documents requiring general layer compositing. No layer tree
    rendering, smart object traversal or rasterization is performed here.
    """
    if length < 2:
        return None
    if offset+length>os.fstat(f.fileno()).st_size:
        raise ValueError('Invalid raster layer section boundary')
    end=offset+length
    read=lambda size: _read(f,size,end)
    f.seek(offset)
    if abs(struct.unpack('>h',read(2))[0]) != 1:
        return None
    top,left,bottom,right = struct.unpack('>iiii',read(16))
    w,h = right-left,bottom-top
    count = struct.unpack('>H',read(2))[0]
    if not 1<=count<=56 or w<=0 or h<=0 or w*h*count*(depth//8)>MAX_BYTES:
        raise ValueError('Invalid single raster layer dimensions')
    channels=[]
    for _ in range(count):
        cid = struct.unpack('>h',read(2))[0]
        size = struct.unpack('>Q' if version==2 else '>I',read(8 if version==2 else 4))[0]
        channels.append((cid,size))
    signature,blend = read(4),read(4)
    opacity,clipping,flags,_ = read(4)
    extra = struct.unpack('>I',read(4))[0]
    extra_start = f.tell()
    if extra<4 or extra_start+extra>offset+length:
        raise ValueError('Invalid raster layer extra data')
    mask_size = struct.unpack('>I',read(4))[0]
    if signature!=b'8BIM' or blend!=b'norm' or clipping or flags&2 or (flags&8 and flags&16):
        return None
    extra_end=extra_start+extra
    if mask_size:
        # Disabled masks do not affect appearance. Active masks need Photoshop
        # compositing, so never silently use the unmasked pixels.
        if mask_size>extra_end-f.tell():
            raise ValueError('Invalid raster layer mask length')
        mask=read(min(mask_size,18))
        if len(mask)<18 or not mask[17]&2:
            return None
        f.seek(mask_size-len(mask),1)
    if f.tell()+4>extra_end:
        raise ValueError('Invalid raster layer blending ranges')
    ranges_size=int.from_bytes(read(4),'big')
    if ranges_size>extra_end-f.tell():
        raise ValueError('Invalid raster layer blending range size')
    if ranges_size>8*(count+1):
        return None
    ranges=read(ranges_size)
    if ranges and (len(ranges)%8 or ranges!=b'\x00\x00\xff\xff\x00\x00\xff\xff'*(len(ranges)//8)):
        return None
    if f.tell()>=extra_end:
        raise ValueError('Missing raster layer name')
    name_size=read(1)[0]
    name_bytes=name_size+(-(name_size+1))%4
    if f.tell()+name_bytes>extra_end:
        raise ValueError('Invalid raster layer name')
    f.seek(name_bytes,1)
    fill=255
    unsupported={b'lrFX',b'lfx2',b'lmfx',b'vmsk',b'vsms',b'TySh',b'SoCo',b'GdFl',b'PtFl',
                 b'SoLd',b'SoLE',b'PlLd',b'levl',b'curv',b'hue2',b'brit',b'blnc',b'CgEd'}
    while f.tell()<extra_end:
        if extra_end-f.tell()<12:
            if any(read(extra_end-f.tell())):
                raise ValueError('Invalid raster layer tagged block padding')
            break
        sig,key=read(4),read(4)
        size=int.from_bytes(read(8 if sig==b'8B64' else 4),'big')
        at=f.tell()
        if sig not in (b'8BIM',b'8B64') or at+size+(size%2)>extra_end:
            raise ValueError('Invalid raster layer tagged block')
        if key in unsupported:
            return None
        if key==b'iOpa' and size:
            fill=read(1)[0]
        if key in (b'lsct',b'lsdk') and size>=4 and int.from_bytes(read(4),'big'):
            return None
        next_at=at+size+(size%2)
        f.seek(next_at)
        if extra_end-next_at>=6:
            probe=read(6)
            if probe[:2]==b'\0\0' and probe[2:] in (b'8BIM',b'8B64'):
                next_at+=2
        f.seek(next_at)
    f.seek(extra_end)
    if f.tell()+sum(size for _,size in channels)>offset+length:
        raise ValueError('Truncated raster layer channels')
    colors = 3 if mode==3 else 1
    if len(set(cid for cid,_ in channels))!=len(channels):
        raise ValueError('Duplicate raster channel IDs')
    if not set(range(colors)).issubset(cid for cid,_ in channels):
        return None
    planes={}
    for cid,size in channels:
        if cid in (*range(colors),-1):
            if size>MAX_BYTES or size<2:
                raise ValueError('Invalid raster channel length')
            planes[cid]=_layer_plane(read(size),w,h,depth,version,alpha=cid==-1)
        else:
            f.seek(size,1)
    rgb = np.stack([planes[i] for i in range(colors)],axis=2)
    if colors==1:
        rgb=np.repeat(rgb,3,axis=2)
    if -1 in planes or opacity!=255 or fill!=255:
        a=planes[-1].astype(np.uint32) if -1 in planes else np.full((h,w),255,np.uint32)
        a=(a*opacity*fill+32512)//65025
        a=a[:,:,None]
        rgb=((rgb.astype(np.uint32)*a+255*(255-a)+127)//255).astype(np.uint8)
    canvas=np.full((canvas_h,canvas_w,3),255,np.uint8)
    x0,y0,x1,y1=max(0,left),max(0,top),min(canvas_w,right),min(canvas_h,bottom)
    if x1>x0 and y1>y0:
        canvas[y0:y1,x0:x1]=rgb[y0-top:y1-top,x0-left:x1-left]
    return np.ascontiguousarray(canvas[:,:,::-1])


def read_detector_image(path):
    """Prefer the actual raster layer in fresh exports: merged data may be white."""
    with open(path,'rb') as f:
        total=os.fstat(f.fileno()).st_size
        signature,version,_,channels,h,w,depth,mode=struct.unpack('>4sH6sHIIHH',_read(f,26))
        if signature!=b'8BPS' or version not in (1,2):
            raise ValueError('Not a PSD/PSB file')
        if mode not in (1,3) or depth not in (8,16,32):
            raise ValueError('PSB input requires RGB or grayscale, 8/16/32 bits')
        if not 1<=w<=300000 or not 1<=h<=300000 or not (3 if mode==3 else 1)<=channels<=56 or w*h*max(channels,3)*(depth//8)>MAX_BYTES:
            raise ValueError('Composite exceeds 512 MiB or has invalid dimensions; enable Resize for detector')
        size=struct.unpack('>I',_read(f,4))[0]
        if f.tell()+size>total:raise ValueError('Invalid color section length')
        f.seek(size,1)
        resource_size=struct.unpack('>I',_read(f,4))[0]
        resource_end=f.tell()+resource_size
        if resource_end>total:raise ValueError('Invalid resource section length')
        has_merged=None
        while f.tell()<resource_end:
            if resource_end-f.tell()<12:
                if any(_read(f,resource_end-f.tell())):
                    raise ValueError('Invalid resource padding')
                break
            signature=_read(f,4,resource_end)
            resource_id=struct.unpack('>H',_read(f,2,resource_end))[0]
            n=_read(f,1,resource_end)[0]
            _read(f,n+((n+1)%2),resource_end)
            length=struct.unpack('>I',_read(f,4,resource_end))[0]
            at=f.tell()
            if signature!=b'8BIM' or at+length+(length%2)>resource_end:
                raise ValueError('Invalid image resource length/signature')
            if resource_id==1057:
                if length<5:raise ValueError('Invalid VersionInfo resource')
                version_info=_read(f,5,resource_end)
                has_merged=bool(version_info[4])
            f.seek(at+length+(length%2))
        f.seek(resource_end)
        long_size=8 if version==2 else 4
        fmt='>Q' if version==2 else '>I'
        section_size=struct.unpack(fmt,_read(f,long_size))[0]
        section_end=f.tell()+section_size
        if section_end>total:raise ValueError('Invalid layer/mask section length')
        candidates=[]
        if section_size:
            length=struct.unpack(fmt,_read(f,long_size,section_end))[0]
            start=f.tell()
            if start+length>section_end:raise ValueError('Invalid layer info length')
            if length:candidates.append((start,length))
            # Common RGB8 export: avoid parsing unrelated global metadata at all.
            # High-depth files must locate Lr16/Lr32 before trying the main proxy.
            if length and depth==8:
                try:
                    image=_single_layer(f,start,length,version,depth,mode,w,h)
                    if image is not None:return image
                except (ValueError,OSError,struct.error):
                    pass  # Try a confirmed real composite or report below.
            f.seek(start+length)
            if f.tell()<section_end:
                mask_size=struct.unpack('>I',_read(f,4,section_end))[0]
                if f.tell()+mask_size>section_end:raise ValueError('Invalid global mask length')
                f.seek(mask_size,1)
                while f.tell()<section_end:
                    if section_end-f.tell()<12:
                        if any(_read(f,section_end-f.tell())):
                            raise ValueError('Invalid additional layer padding')
                        break
                    sig,key=_read(f,4,section_end),_read(f,4,section_end)
                    if sig not in (b'8BIM',b'8B64'):
                        raise ValueError('Invalid additional layer signature')
                    big=sig==b'8B64' or version==2 and key in (b'LMsk',b'Lr16',b'Lr32',b'Layr',b'Mt16',b'Mt32',b'Mtrn',b'Alph',b'FMsk',b'lnk2',b'FEid',b'FXid',b'PxSD')
                    n=struct.unpack('>Q' if big else '>I',_read(f,8 if big else 4,section_end))[0]
                    at=f.tell()
                    if at+n+(n%2)>section_end:raise ValueError('Invalid additional layer info length')
                    if key=={8:b'Layr',16:b'Lr16',32:b'Lr32'}[depth]:
                        candidates.insert(0,(at,n))
                    next_at=at+n+(n%2)
                    # Photoshop also aligns global tagged blocks to four bytes.
                    # Accept two-byte padding when the next valid signature is
                    # there; never scan arbitrary payload bytes for a header.
                    f.seek(next_at)
                    if section_end-next_at>=6:
                        probe=_read(f,6,section_end)
                        if probe[:2]==b'\0\0' and probe[2:] in (b'8BIM',b'8B64'):
                            next_at+=2
                    f.seek(next_at)
        errors=[]
        for start,length in candidates:
            try:
                image=_single_layer(f,start,length,version,depth,mode,w,h)
                if image is not None:return image
            except (ValueError,OSError,struct.error) as exc:
                errors.append(str(exc))
    # A white placeholder can also exist without VersionInfo. Require an
    # affirmative real-merged flag when there are layers we cannot reproduce.
    if section_size and has_merged is not True:
        detail='; '.join(errors) if errors else 'masks, effects or unsupported layer structure'
        raise ValueError('PSB has no confirmed real merged image and its raster layer cannot be read: '+detail)
    if has_merged is False:
        raise ValueError('PSB has no real merged image or usable raster layer')
    return read_composite(path)


API_HOST = "127.0.0.1"
API_PORT_SEND = 6351
API_PORT_LISTEN = 6350

TIMEOUT = 15 * 60
last_request_time = time.monotonic()


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


        if not os.path.exists(MODEL_PATH):
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

        return detector


def detect_face_landmarks(img, use_head=False):
    try:
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        detector_instance = get_detector()

        with detector_lock:
            result = detector_instance.detect(mp_image)

        if not result.face_landmarks:
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
        return points

    except Exception:
        logging.exception("Face detection failed")
        raise


# ================= POSE =================

def get_pose_detector():
    global pose_detector

    if pose_detector is not None:
        return pose_detector

    with pose_detector_lock:
        if pose_detector is not None:
            return pose_detector


        if not os.path.exists(POSE_MODEL_PATH):
            raise RuntimeError("Missing model; run install_runtime.bat")

        base_options = python.BaseOptions(model_asset_path=POSE_MODEL_PATH)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.IMAGE,
            num_poses=1,
            output_segmentation_masks=False,
        )

        pose_detector = vision.PoseLandmarker.create_from_options(options)

        return pose_detector


def detect_pose(img):
    try:
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        detector_instance = get_pose_detector()

        with pose_detector_lock:
            result = detector_instance.detect(mp_image)

        if not result.pose_landmarks:
            return None

        h, w, _ = img.shape
        pose = result.pose_landmarks[0]

        points = {
            str(i): (int(lm.x * w), int(lm.y * h), float(lm.visibility))
            for i, lm in enumerate(pose)
        }

        return points

    except Exception:
        logging.exception("Pose detection failed")
        raise




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


SERVER_ID = "face-alignment/0.157"

# The JSX sends a heartbeat while a detection request is alive and an explicit
# cancel when Photoshop progress is cancelled. MediaPipe calls themselves are
# native/blocking, so cancellation is cooperative: stale results are discarded
# immediately and the request is marked cancelled while the native call unwinds.
REQUEST_HEARTBEAT_TIMEOUT = 4.0
active_requests = {}
active_requests_lock = threading.Lock()


def register_active_request(request_id):
    state = {"cancel": threading.Event(), "last_heartbeat": time.monotonic()}
    with active_requests_lock:
        active_requests[request_id] = state
    return state


def unregister_active_request(request_id):
    with active_requests_lock:
        active_requests.pop(request_id, None)


def heartbeat_request(request_id):
    with active_requests_lock:
        state = active_requests.get(request_id)
        if state is None:
            return False
        state["last_heartbeat"] = time.monotonic()
        return True


def cancel_request(request_id):
    with active_requests_lock:
        state = active_requests.get(request_id)
        if state is None:
            return False
        state["cancel"].set()
        return True


def request_cancelled(state):
    if state["cancel"].is_set():
        return True
    if time.monotonic() - state["last_heartbeat"] > REQUEST_HEARTBEAT_TIMEOUT:
        state["cancel"].set()
        return True
    return False


def cancellation_watchdog():
    while True:
        now = time.monotonic()
        with active_requests_lock:
            states = list(active_requests.values())
        for state in states:
            if now - state["last_heartbeat"] > REQUEST_HEARTBEAT_TIMEOUT:
                state["cancel"].set()
        time.sleep(0.25)


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
    if not re.fullmatch(r"FD_\d+_\d+_\d+\.(?:jpg|psb)", os.path.basename(path), re.IGNORECASE):
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


def handle_client(client_socket):
    global last_request_time
    request_id = None

    def reply(kind, message):
        send_data_to_jsx({"type":kind, "message":message, "request_id":request_id, "server_id":SERVER_ID})

    try:
        with client_socket:
            client_socket.settimeout(5)
            message = receive_json(client_socket)
            kind = message.get("type")

            # Control messages are answered on the same socket (cancel) or need
            # no response at all (heartbeat). They must never consume the JSX
            # response listener used by the actual detection request.
            if kind == "heartbeat":
                heartbeat_request(message.get("target_id"))
                last_request_time = time.monotonic()
                return
            if kind == "cancel":
                stopped = cancel_request(message.get("target_id"))
                last_request_time = time.monotonic()
                client_socket.sendall((json.dumps({"stopped": bool(stopped)}) + "\n").encode("ascii"))
                return

        request_id = message.get("request_id")
        last_request_time = time.monotonic()
        if kind == "handshake":
            reply("answer", SERVER_ID)
        elif kind == "cleanup":
            reply("answer", queue_preview_cleanup(message.get("message")))
        elif kind.startswith("batch_"):
            handle_batch(kind, message.get("message"), request_id, reply)
        else:
            reply("error", "Unknown request")
    except Exception as exc:
        logging.exception("Request failed")
        try:
            reply("error", str(exc))
        except Exception:
            pass


# Two native decode workers overlap disk/decompression with Photoshop export.
# One inference worker preserves input order, auto-mode decision, and DNN safety.
read_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="preview-read")
analysis_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="landmarks")
batches = {}
batches_lock = threading.Lock()


def valid_preview(path):
    return (isinstance(path, str) and
            os.path.normcase(os.path.realpath(os.path.dirname(path))) ==
            os.path.normcase(os.path.realpath(tempfile.gettempdir())) and
            re.fullmatch(r"FD_\d+_\d+_\d+\.(?:jpg|psb)", os.path.basename(path), re.IGNORECASE))


def reserve_decode_slot(batch, index):
    # Reserve bounded buffers in input order. Semaphore wakeups alone are not
    # FIFO: a later fast reader could fill every slot while inference waits
    # for an earlier reader that has no slot, deadlocking the entire batch.
    with batch["read_order"]:
        while index != batch["next_read"]:
            if batch["cancel"].is_set():return False
            batch["read_order"].wait(.1)
        while not batch["cancel"].is_set():
            if batch["slots"].acquire(timeout=.1):
                batch["next_read"]+=1
                batch["read_order"].notify_all()
                return True
        return False


def read_batch_image(batch, path, index):
    retain=index==0
    if not reserve_decode_slot(batch,index):
        queue_preview_cleanup(path)
        return None, False
    try:
        if batch["cancel"].is_set():
            return None, True
        if os.path.splitext(path)[1].lower()=='.jpg':
            image=cv2.imdecode(np.fromfile(path,dtype=np.uint8),cv2.IMREAD_COLOR)
            if image is None:
                raise ValueError('Cannot decode JPEG preview')
        else:
            image=read_detector_image(path)
        return image, True
    except Exception as exc:
        return exc, True
    finally:
        # Retain the reference export until inference: on failure it is useful
        # for comparing the raw PSB with the actual detector input.
        if not retain:
            queue_preview_cleanup(path)


def visible(p, w, h):
    return p and p[2] > .5 and 0 <= p[0] <= w and 0 <= p[1] <= h


def face_with_fallback(image, head):
    points = detect_face_landmarks(image, head)
    if points:
        return points
    pose = detect_pose(image)
    if not pose:
        return None
    fp = next((p for p in ((5,2),(6,3),(4,1),(8,7),(0,0),(10,9)) if all(str(i) in pose for i in p)), None)
    bp = next((p for p in ((12,11),(24,23),(14,13)) if all(str(i) in pose for i in p)), None)
    if fp is None or bp is None or "0" not in pose:
        return None
    h,w = image.shape[:2]
    x1,x2 = sorted(pose[str(i)][0] for i in fp)
    bottom = max(pose[str(i)][1] for i in bp)
    top = pose["0"][1] - (bottom-pose["0"][1])
    padx,pady = (x2-x1)*.2,(bottom-top)*.2
    left,right = max(0,int(x1-padx)),min(w,int(math.ceil(x2+padx)))
    top,bottom = max(0,int(top-pady)),min(h,int(math.ceil(bottom+pady)))
    if right<=left or bottom<=top:
        return None
    points = detect_face_landmarks(np.ascontiguousarray(image[top:bottom,left:right]),head)
    if points:
        for key,p in points.items():
            if key != "head":
                points[key] = (p[0]+left,p[1]+top)
    return points


DIAGNOSTIC_DIR = os.path.join(os.path.dirname(sys.prefix), "diagnostics")


def save_failed_preview(batch, path, image, reason):
    """Save only on reference failure; no extra file copies on successful runs."""
    try:
        os.makedirs(DIAGNOSTIC_DIR, exist_ok=True)
        target = os.path.join(DIAGNOSTIC_DIR, "last-failure.zip")
        metadata = {"server":SERVER_ID,"reason":reason,
                    "pose":batch["pose"],"legs":batch["legs"],"auto":batch["auto"],
                    "head_support":batch["head_support"]}
        with zipfile.ZipFile(target+".tmp", "w", compression=zipfile.ZIP_STORED) as archive:
            if path and os.path.isfile(path):
                archive.write(path,"reference-export"+os.path.splitext(path)[1].lower())
            if isinstance(image,np.ndarray):
                metadata["shape"] = list(image.shape)
                metadata["bgr_min"] = image.min(axis=(0,1)).tolist()
                metadata["bgr_max"] = image.max(axis=(0,1)).tolist()
                metadata["bgr_mean"] = image.mean(axis=(0,1)).tolist()
                buffer = io.BytesIO()
                Image.fromarray(image[:,:,::-1]).save(buffer,format="PNG")
                archive.writestr("detector-input.png",buffer.getvalue())
            archive.writestr("details.json",json.dumps(metadata,ensure_ascii=False,indent=2))
        os.replace(target+".tmp",target)
        logging.error("Reference diagnostics saved: %s | %s",target,reason)
        return target
    except Exception:
        logging.exception("Could not save failed reference preview")
        return None


def analyze_batch_image(batch, index, decoded, path):
    image,acquired=None,False
    def failure(reason):
        result = {"error":reason}
        if index == 0:
            result["diagnostics"] = save_failed_preview(batch,path,image,reason)
        return result
    try:
        image,acquired=decoded.result()
        if batch["cancel"].is_set():
            return {"error":"Operation cancelled"}
        if isinstance(image, Exception):
            return failure(str(image))
        if image is None:
            return failure("Preview unavailable")
        h,w = image.shape[:2]
        with request_lock:
            if batch["cancel"].is_set():
                return {"error":"Operation cancelled"}
            pose = None
            if index == 0 and batch["auto"]:
                pose = detect_pose(image)
                batch["pose"] = bool(pose and visible(pose.get("23"),w,h) and visible(pose.get("24"),w,h))
                batch["legs"] = bool(batch["pose"] and visible(pose.get("27"),w,h) and visible(pose.get("28"),w,h))
            mesh = ((pose or detect_pose(image)) if batch["pose"] else
                    face_with_fallback(image,batch["head_support"]))
        if batch["cancel"].is_set():
            return {"error":"Operation cancelled"}
        if index == 0 and not mesh:
            return failure("No pose landmarks in exported reference preview" if batch["pose"] else
                           "No face landmarks in exported reference preview")
        return {"mesh":mesh or None,"width":w,"height":h}
    except Exception as exc:
        if batch["cancel"].is_set():
            return {"error":"Operation cancelled"}
        logging.exception("Preview batch layer failed")
        return failure(str(exc))
    finally:
        if index == 0 and path:
            queue_preview_cleanup(path)
        if acquired:
            batch["slots"].release()


def handle_batch(kind, payload, request_id, reply):
    payload = payload or {}
    if kind == "batch_begin":
        with batches_lock:
            if batches:
                raise RuntimeError("Previous Preview batch is still active")
            batch_id = uuid.uuid4().hex
            batch = {"auto":bool(payload.get("auto")), "pose":bool(payload.get("pose")),
                     "legs":bool(payload.get("legs")), "head_support":bool(payload.get("head_support")),
                     "cancel":threading.Event(), "slots":threading.Semaphore(3),
                     "read_order":threading.Condition(), "next_read":0,
                     "jobs":[], "last":time.monotonic(), "finishing":False}
            batches[batch_id] = batch
        try:
            reply("answer", batch_id)
        except Exception:
            batch["cancel"].set()
            with batches_lock:
                batches.pop(batch_id,None)
            raise
        return
    batch_id = payload.get("batch_id")
    with batches_lock:
        batch = batches.get(batch_id)
        if batch:
            batch["last"] = time.monotonic()
    if batch is None:
        if kind == "batch_abort":
            reply("answer", True)
            return
        raise RuntimeError("Unknown/expired Preview batch")
    if kind == "batch_add":
        with batches_lock:
            if batch["finishing"] or batch["cancel"].is_set():
                raise RuntimeError("Preview batch is closed")
            index = payload.get("index")
            path = payload.get("path")
            if type(index) is not int or index != len(batch["jobs"]) or not valid_preview(path):
                raise ValueError("Invalid preview path or layer order")
            decoded = read_pool.submit(read_batch_image,batch,path,index)
            batch["jobs"].append(analysis_pool.submit(analyze_batch_image,batch,index,decoded,path))
        reply("answer", True)
    elif kind == "batch_abort":
        batch["cancel"].set()
        with batches_lock:
            batches.pop(batch_id,None)
        reply("answer", True)
    elif kind == "batch_finish":
        with batches_lock:
            if batch["finishing"] or batch["cancel"].is_set():
                raise RuntimeError('Preview batch is already closed')
            batch["finishing"] = True
        state = register_active_request(request_id)
        try:
            while not all(job.done() for job in batch["jobs"]):
                if batch["cancel"].is_set() or request_cancelled(state):
                    batch["cancel"].set()
                    reply("cancelled","Operation cancelled")
                    return
                time.sleep(.05)
            if batch["cancel"].is_set() or request_cancelled(state):
                reply("cancelled","Operation cancelled")
                return
            reply("answer", {"pose":batch["pose"],"legs":batch["legs"],
                             "items":[job.result() for job in batch["jobs"]]})
        finally:
            unregister_active_request(request_id)
            batch["cancel"].set()
            with batches_lock:
                batches.pop(batch_id,None)
    else:
        raise ValueError("Unknown batch command")


def expire_batches():
    with batches_lock:
        for key,batch in list(batches.items()):
            if not batch["finishing"] and time.monotonic()-batch["last"] > TIMEOUT:
                batch["cancel"].set()
                batches.pop(key,None)


def start_server():
    global last_request_time
    last_request_time = time.monotonic()
    threading.Thread(target=cancellation_watchdog, daemon=True).start()
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
                expire_batches()
                if not batches and not request_lock.locked() and time.monotonic()-last_request_time > TIMEOUT:
                    break


def check_task(path, kind):
    opts = python.BaseOptions(model_asset_path=path)
    if kind == "face":
        model = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=opts))
    else:
        model = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=opts))
    model.close()


if __name__ == "__main__":
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
        logging.basicConfig(handlers=[RotatingFileHandler(os.path.join(log_dir,"server.log"),maxBytes=1000000,backupCount=2,encoding="utf-8")],level=logging.WARNING)
        try:
            start_server()
        except OSError:
            logging.exception("Server could not bind its dedicated port")
