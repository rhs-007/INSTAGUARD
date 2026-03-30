from flask import Flask, request, jsonify
from nudenet import NudeDetector
import os
import tempfile

app = Flask(__name__)
detector = NudeDetector()

@app.route("/predict", methods=["POST"])
def predict():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    file = request.files["image"]

    suffix = os.path.splitext(file.filename or "upload.jpg")[1] or ".jpg"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        file.save(tmp.name)
        temp_path = tmp.name

    try:
        detections = detector.detect(temp_path)
        return jsonify(detections)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        try:
            os.remove(temp_path)
        except:
            pass


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=True)