import os
import traceback

from flask import Flask, request, jsonify
from flask_cors import CORS

import face_service

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

# Only the Node backend should call this service.
CORS(app, origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:8000").split(","))

ALLOW_ENROLL = os.getenv("ALLOW_ENROLL", "0") == "1"


@app.get("/health")
def health():
    return jsonify({"success": True, "service": "face-service", "status": "running",
                    "enrollEnabled": ALLOW_ENROLL})


@app.post("/verify")
def verify():
    try:
        data = request.get_json(silent=True) or {}
        epic = data.get("epic")
        challenge = data.get("challenge")
        frames = data.get("frames")

        if not face_service.valid_epic(epic):
            return jsonify({"success": False, "message": "Invalid EPIC."}), 400
        if challenge not in ("blink", "left", "right"):
            return jsonify({"success": False, "message": "Invalid challenge."}), 400
        if not isinstance(frames, list) or not (8 <= len(frames) <= 40):
            return jsonify({"success": False, "message": "8-40 frames required."}), 400

        result = face_service.analyse(epic, challenge, frames)
        # Frames are processed in memory only and never written to disk.
        return jsonify({"success": True, **result})

    except Exception as error:
        traceback.print_exc()
        return jsonify({"success": False, "message": str(error)}), 500


@app.post("/enroll")
def enroll():
    """DEMO ONLY: store a reference photo. Disabled unless ALLOW_ENROLL=1."""
    if not ALLOW_ENROLL:
        return jsonify({"success": False, "message": "Enrolment disabled."}), 403
    data = request.get_json(silent=True) or {}
    if not face_service.valid_epic(data.get("epic")) or not data.get("image"):
        return jsonify({"success": False, "message": "epic and image required."}), 400
    face_service.save_reference(data["epic"], data["image"])
    return jsonify({"success": True, "message": f"Reference saved for {data['epic'].upper()}."})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")),
            debug=os.getenv("FLASK_DEBUG", "0") == "1")
