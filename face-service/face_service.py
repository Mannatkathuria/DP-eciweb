import base64
import io
import os
import re
from pathlib import Path

import numpy as np
from PIL import Image

import liveness

REFERENCE_DIR = Path(os.getenv("REFERENCE_DIR", Path(__file__).parent / "reference"))
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.50"))   # lower distance = more similar
MAX_WIDTH = 480
EPIC_RE = re.compile(r"^[A-Z0-9]{6,20}$")

_fr = None
_ref_cache = {}


def _face_recognition():
    """Lazy import so the module (and tests) load without dlib installed."""
    global _fr
    if _fr is None:
        import face_recognition
        _fr = face_recognition
    return _fr


def decode_image(data_url):
    raw = base64.b64decode(data_url.split(",", 1)[-1])
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if img.width > MAX_WIDTH:
        img = img.resize((MAX_WIDTH, int(img.height * MAX_WIDTH / img.width)))
    return np.array(img)


def valid_epic(epic):
    return isinstance(epic, str) and bool(EPIC_RE.match(epic.upper()))


def reference_path(epic):
    epic = epic.upper()
    for ext in (".jpg", ".jpeg", ".png"):
        p = REFERENCE_DIR / f"{epic}{ext}"
        if p.exists():
            return p
    return None


def load_reference_encoding(epic):
    """Returns a 128-d encoding or None if there is no usable reference photo."""
    path = reference_path(epic)
    if path is None:
        return None
    key = (str(path), path.stat().st_mtime)
    if key in _ref_cache:
        return _ref_cache[key]

    fr = _face_recognition()
    image = fr.load_image_file(str(path))
    encodings = fr.face_encodings(image)
    enc = encodings[0] if len(encodings) == 1 else None   # none / multiple faces -> unusable
    _ref_cache[key] = enc
    return enc


def save_reference(epic, data_url):
    """Demo helper: enrol the supplied frame as the reference photo for an EPIC."""
    REFERENCE_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.fromarray(decode_image(data_url))
    img.save(REFERENCE_DIR / f"{epic.upper()}.jpg", "JPEG", quality=92)


def analyse(epic, challenge, frames):
    """
    Stage 4 (face detection), Stage 5 (face match) and Stage 6 (liveness).
    Returns a dict the Node backend turns into Verified / BLO review.
    """
    fr = _face_recognition()

    features, frontal_images = [], []

    for data_url in frames:
        rgb = decode_image(data_url)
        locations = fr.face_locations(rgb, model="hog")

        if len(locations) != 1:
            features.append(None)
            continue

        lm = fr.face_landmarks(rgb, locations)
        if not lm:
            features.append(None)
            continue

        f = liveness.frame_features(lm[0])
        features.append(f)
        if abs(f["yaw"]) < 0.08 and len(frontal_images) < 3:
            frontal_images.append((rgb, locations))

    face_detected = sum(1 for f in features if f) >= max(1, int(0.6 * len(features)))
    passed, details = liveness.evaluate_challenge(challenge, features)

    result = {
        "faceDetected": bool(face_detected),
        "faceMatch": None,
        "distance": None,
        "liveness": bool(passed),
        "challenge": challenge,
        "livenessDetails": details,
        "referenceAvailable": False,
    }

    if not face_detected or not frontal_images:
        if face_detected:
            result["faceDetected"] = False          # never saw a clear frontal face
        return result

    reference = load_reference_encoding(epic)
    if reference is None:
        return result                                # faceMatch stays None -> BLO review

    result["referenceAvailable"] = True
    distances = []
    for rgb, locs in frontal_images:
        encs = fr.face_encodings(rgb, locs)
        if encs:
            distances.append(float(fr.face_distance([reference], encs[0])[0]))

    if not distances:
        result["faceDetected"] = False
        return result

    distance = float(np.median(distances))
    result["distance"] = round(distance, 4)
    result["faceMatch"] = bool(distance <= MATCH_THRESHOLD)
    return result
