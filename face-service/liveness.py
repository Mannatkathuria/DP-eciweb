"""
Liveness (presentation-attack) checks based on a short burst of frames.

Pure numpy - no dlib import here, so this module is unit-testable. The
landmarks come from face_recognition.face_landmarks() (dlib 68-point model
bundled with the face_recognition_models package, so no extra .dat file).

Challenges (chosen at random by the Node backend):
  blink  - eyes close and re-open
  left   - user turns their head to THEIR left   (nose moves to image-right)
  right  - user turns their head to THEIR right  (nose moves to image-left)

Limitation (state this in the report): this stops a static photo / screenshot,
but a pre-recorded video or a deepfake replay is NOT reliably detected.
"""
import numpy as np

BLINK_CLOSED_RATIO = 0.75   # eye must close to < 75% of its open height
MIN_OPEN_EAR = 0.18         # eyes must have been genuinely open first
YAW_DELTA_THRESHOLD = 0.10  # change in normalised nose offset for a head turn
MAX_BASELINE_YAW = 0.15     # user must start roughly facing the camera
MIN_VALID_FRAME_RATIO = 0.6


def _d(a, b):
    return float(np.linalg.norm(np.asarray(a, float) - np.asarray(b, float)))


def eye_aspect_ratio(eye):
    """eye: six (x, y) points ordered like dlib 36-41 / 42-47."""
    horizontal = _d(eye[0], eye[3])
    if horizontal == 0:
        return 0.0
    return (_d(eye[1], eye[5]) + _d(eye[2], eye[4])) / (2.0 * horizontal)


def frame_features(landmarks):
    """landmarks: one dict from face_recognition.face_landmarks()."""
    ear = (eye_aspect_ratio(landmarks["left_eye"]) + eye_aspect_ratio(landmarks["right_eye"])) / 2.0

    chin = landmarks["chin"]
    jaw_left_x, jaw_right_x = chin[0][0], chin[-1][0]
    width = jaw_right_x - jaw_left_x
    nose_x = float(np.mean([p[0] for p in landmarks["nose_tip"]]))
    yaw = 0.0 if width == 0 else (nose_x - (jaw_left_x + jaw_right_x) / 2.0) / width

    return {"ear": float(ear), "yaw": float(yaw)}


def detect_blink(ears):
    if len(ears) < 5:
        return False
    ears = np.asarray(ears, float)
    open_ref = float(np.percentile(ears, 80))
    i_min = int(np.argmin(ears))
    e_min = float(ears[i_min])

    if open_ref < MIN_OPEN_EAR or e_min > BLINK_CLOSED_RATIO * open_ref:
        return False
    if i_min == 0 or i_min == len(ears) - 1:      # must close AND re-open inside the clip
        return False

    reopened = float(np.max(ears[i_min + 1:]))
    return reopened > e_min + 0.4 * (open_ref - e_min)


def detect_turn(yaws, direction):
    if len(yaws) < 5:
        return False
    yaws = np.asarray(yaws, float)
    baseline = float(np.median(yaws[:3]))
    if abs(baseline) > MAX_BASELINE_YAW:
        return False
    if direction == "left":
        return float(yaws.max()) - baseline >= YAW_DELTA_THRESHOLD
    if direction == "right":
        return baseline - float(yaws.min()) >= YAW_DELTA_THRESHOLD
    return False


def evaluate_challenge(challenge, features):
    """
    features: list (one per frame) of {"ear","yaw"} or None when no single face.
    Returns (passed: bool, details: dict)
    """
    valid = [f for f in features if f]
    ratio = len(valid) / max(1, len(features))
    details = {"framesUsed": len(valid), "framesTotal": len(features), "validRatio": round(ratio, 2)}

    if ratio < MIN_VALID_FRAME_RATIO:
        details["reason"] = "Face was not consistently visible."
        return False, details

    if challenge == "blink":
        passed = detect_blink([f["ear"] for f in valid])
    elif challenge in ("left", "right"):
        passed = detect_turn([f["yaw"] for f in valid], challenge)
    else:
        details["reason"] = "Unknown challenge."
        return False, details

    if not passed:
        details["reason"] = f"'{challenge}' challenge not detected."
    return bool(passed), details
