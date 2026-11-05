import math
import time

import cv2
from ultralytics import YOLO

from video_observation_publisher import publish_observation
from zone_matching import load_zones, person_in_zone

VIDEO = "/workspace/projects/smart-canteen/media/cam-02.mp4"
MODEL = "/workspace/models/yolo26n.pt"

STRIDE = 24
# A person must stay in a zone this long before the table counts as occupied,
# so someone walking past does not trigger it.
DWELL_SECONDS = 3
# How long a zone must look empty before "no person" is published.
LEAVE_SECONDS = 2
# Re-send an unchanged result before the API's 120 s freshness window expires.
REPUBLISH_SECONDS = 30


def main():
    zones = load_zones()
    if not zones:
        raise RuntimeError("No CAM-02 zones configured")

    video = cv2.VideoCapture(VIDEO)
    fps = video.get(cv2.CAP_PROP_FPS)
    video.release()
    if fps <= 0:
        raise RuntimeError("Cannot read video FPS")

    model = YOLO(MODEL)

    sample_seconds = STRIDE / fps
    needed = {
        "person_detected": max(1, math.ceil(DWELL_SECONDS / sample_seconds)),
        "no_person_detected": max(1, math.ceil(LEAVE_SECONDS / sample_seconds)),
    }

    previous, streak, published, last_sent = {}, {}, {}, {}
    for zone in zones:
        table = zone["table_id"]
        previous[table] = None
        streak[table] = 0
        published[table] = "unknown"
        last_sent[table] = time.monotonic()
        publish_observation(table, "unknown", 0)

    print("Starting timed video analysis...", flush=True)

    results = model.predict(
        source=VIDEO,
        stream=True,
        classes=[0],
        conf=0.35,
        vid_stride=STRIDE,
        device="cpu",
        verbose=False,
    )

    start = time.monotonic()
    frame_count = 0

    for index, result in enumerate(results):
        frame_count += 1

        # Pace samples like the original recording so the dashboard changes in real time.
        remaining = index * STRIDE / fps - (time.monotonic() - start)
        if remaining > 0:
            time.sleep(remaining)

        height, width = result.orig_shape
        boxes = result.boxes.xyxy.tolist()
        now = time.monotonic()

        for zone in zones:
            table = zone["table_id"]
            people = sum(person_in_zone(box, width, height, zone) for box in boxes)
            observation = "person_detected" if people > 0 else "no_person_detected"

            if observation == previous[table]:
                streak[table] += 1
            else:
                previous[table] = observation
                streak[table] = 1

            stable = streak[table] >= needed[observation]
            changed = published[table] != observation
            due = now - last_sent[table] >= REPUBLISH_SECONDS

            if stable and (changed or due):
                publish_observation(table, observation, people)
                published[table] = observation
                last_sent[table] = now
                if changed:
                    print(f"Sample {index + 1}: {table} -> {observation}", flush=True)

    if frame_count == 0:
        raise RuntimeError("No video frames processed")

    print("Timed analysis completed!", flush=True)


if __name__ == "__main__":
    main()
