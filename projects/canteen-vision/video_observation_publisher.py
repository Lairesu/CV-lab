import json
import os
from urllib.request import Request, urlopen

from ultralytics import YOLO
from zone_matching import load_zones, person_in_zone

MODEL_PATH = "/workspace/models/yolo26n.pt"
VIDEO_PATH = "/workspace/projects/canteen-vision/videos/smart-canteen-test.mp4"
API_URL = "http://api:8000/internal/vision/observations"
CAMERA_ID = "CAM-02"
WORKER_KEY = os.environ.get("SMART_CANTEEN_WORKER_KEY", "")


def publish_observation(table_id, observation, people_detected):
    payload = {
        "camera_id": CAMERA_ID,
        "table_id": table_id,
        "observation": observation,
        "people_detected": people_detected,
    }
    request = Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Worker-Key": WORKER_KEY},
        method="POST",
    )
    with urlopen(request, timeout=5) as response:
        return response.status


def main():
    # One-shot analysis: summarise the whole video, then publish once per table.
    zones = load_zones()
    if not zones:
        raise RuntimeError("No CAM-02 zones configured")
    print(f"Loaded {len(zones)} camera zones")

    model = YOLO(MODEL_PATH)
    results = model.predict(
        source=VIDEO_PATH,
        stream=True,
        classes=[0],
        conf=0.35,
        vid_stride=24,
        device="cpu",
        verbose=False,
    )

    detected_frames = {zone["table_id"]: 0 for zone in zones}
    peak_people = {zone["table_id"]: 0 for zone in zones}
    frame_count = 0

    for result in results:
        frame_count += 1
        height, width = result.orig_shape
        boxes = result.boxes.xyxy.tolist()

        for zone in zones:
            table_id = zone["table_id"]
            people = sum(person_in_zone(box, width, height, zone) for box in boxes)
            if people > 0:
                detected_frames[table_id] += 1
            peak_people[table_id] = max(peak_people[table_id], people)

    # Never publish "no person" results if the video could not be decoded.
    if frame_count == 0:
        raise RuntimeError("No video frames processed")
    print(f"Processed {frame_count} sampled frames")

    for table_id in sorted(detected_frames):
        if detected_frames[table_id] > 0:
            observation, people = "person_detected", peak_people[table_id]
        else:
            observation, people = "no_person_detected", 0

        status_code = publish_observation(table_id, observation, people)
        print(
            f"{table_id}: {observation}, "
            f"matched frames={detected_frames[table_id]}, HTTP {status_code}"
        )


if __name__ == "__main__":
    main()
