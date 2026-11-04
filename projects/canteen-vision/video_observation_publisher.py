
import json
from urllib.request import Request, urlopen

from ultralytics import YOLO
from zone_matching import load_zones, person_in_zone


MODEL_PATH = "/workspace/models/yolo26n.pt"

VIDEO_PATH = (
    "/workspace/projects/canteen-vision/videos/"
    "smart-canteen-test.mp4"
)

API_URL = "http://api:8000/internal/vision/observations"
CAMERA_ID = "CAM-02"


def publish_observation(table_id, observation, people_detected):
    """Send a camera observation to FastAPI."""

    payload = {
        "camera_id": CAMERA_ID,
        "table_id": table_id,
        "observation": observation,
        "people_detected": people_detected,
    }

    request = Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urlopen(request, timeout=5) as response:
        return response.status


def main():
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

    # Count how many sampled frames contain a person in each zone.
    detected_frames = {
        zone["table_id"]: 0 for zone in zones
    }

    # Maximum number of detected people in a table zone.
    peak_people = {
        zone["table_id"]: 0 for zone in zones
    }

    frame_count = 0

    for result in results:
        frame_count += 1

        height, width = result.orig_shape
        boxes = result.boxes.xyxy.tolist()

        for zone in zones:
            table_id = zone["table_id"]

            people = sum(
                person_in_zone(box, width, height, zone)
                for box in boxes
            )

            if people > 0:
                detected_frames[table_id] += 1

            peak_people[table_id] = max(
                peak_people[table_id],
                people,
            )

    # Never publish empty results if video decoding failed.
    if frame_count == 0:
        raise RuntimeError("No video frames processed")

    print(f"Processed {frame_count} sampled frames")

    # Publish after video analysis completes successfully.
    for table_id in sorted(detected_frames):
        if detected_frames[table_id] > 0:
            observation = "person_detected"
            people = peak_people[table_id]
        else:
            observation = "no_person_detected"
            people = 0

        status_code = publish_observation(
            table_id,
            observation,
            people,
        )

        print(
            f"{table_id}: {observation}, "
            f"matched frames={detected_frames[table_id]}, "
            f"POST HTTP {status_code}"
        )

    print("Automatic observation publishing completed!")


if __name__ == "__main__":
    main()
