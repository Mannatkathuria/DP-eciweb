import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import numpy as np
import liveness as L


def eye(h):
    # six points: width 10, vertical opening h
    return [(0, 0), (3, -h / 2), (7, -h / 2), (10, 0), (7, h / 2), (3, h / 2)]


def lm(eye_h=3.0, nose_x=50.0):
    return {"left_eye": eye(eye_h), "right_eye": eye(eye_h),
            "chin": [(0, 0)] + [(50, 80)] * 15 + [(100, 0)],
            "nose_tip": [(nose_x, 40)] * 5}


def run(frames, ch):
    return L.evaluate_challenge(ch, [L.frame_features(f) if f else None for f in frames])[0]


def test_ear_values():
    assert abs(L.eye_aspect_ratio(eye(3.0)) - 0.3) < 1e-9
    assert L.eye_aspect_ratio(eye(0.5)) < 0.06


def test_blink_detected():
    frames = [lm(3)] * 4 + [lm(1.0), lm(0.4), lm(1.2)] + [lm(3)] * 5
    assert run(frames, "blink")


def test_no_blink_static_photo():
    assert not run([lm(3)] * 14, "blink")


def test_eyes_closed_whole_time_fails():
    assert not run([lm(0.4)] * 14, "blink")


def test_turn_left_and_right():
    left = [lm(nose_x=50)] * 4 + [lm(nose_x=63)] * 6
    right = [lm(nose_x=50)] * 4 + [lm(nose_x=37)] * 6
    assert run(left, "left") and not run(left, "right")
    assert run(right, "right") and not run(right, "left")


def test_face_lost_fails():
    frames = [lm()] * 3 + [None] * 9
    assert not run(frames, "blink")


def test_unknown_challenge():
    assert not run([lm()] * 10, "dance")
