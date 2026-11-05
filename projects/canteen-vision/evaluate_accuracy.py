"""Measure detection accuracy on a recorded video with a known answer.

Example (inside the vision container):
    python evaluate_accuracy.py --present T-01:5-15

Every sampled frame is checked per table zone: person seen vs. person really
there. Frames close to a change (someone arriving or leaving) are skipped,
because the right answer there is ambiguous.
"""

import argparse
import json

import cv2
from ultralytics import YOLO

from zone_matching import person_in_zone

DEFAULT_VIDEO = "/workspace/projects/smart-canteen/media/cam-02.mp4"
DEFAULT_MODEL = "/workspace/models/yolo26n.pt"


def parse_presence(items):
    # "T-01:5-15" -> {"T-01": [(5.0, 15.0)]}
    presence = {}
    for item in items:
        table, span = item.split(":")
        start, end = (float(x) for x in span.split("-"))
        presence.setdefault(table, []).append((start, end))
    return presence


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", default=DEFAULT_VIDEO)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--zones-json", help="zone list as JSON; default: load from the API")
    parser.add_argument("--present", nargs="+", default=[], help="TABLE:START-END in seconds")
    parser.add_argument("--margin", type=float, default=1.0, help="seconds skipped around each change")
    parser.add_argument("--stride", type=int, default=6, help="check every Nth frame")
    parser.add_argument("--conf", type=float, default=0.35)
    args = parser.parse_args()

    if args.zones_json:
        zones = json.loads(open(args.zones_json, encoding="utf-8").read())
    else:
        from zone_matching import load_zones
        zones = load_zones()
    if not zones:
        raise SystemExit("No zones to evaluate")

    presence = parse_presence(args.present)

    video = cv2.VideoCapture(args.video)
    fps = video.get(cv2.CAP_PROP_FPS)
    video.release()

    model = YOLO(args.model)
    results = model.predict(
        source=args.video,
        stream=True,
        classes=[0],
        conf=args.conf,
        vid_stride=args.stride,
        device="cpu",
        verbose=False,
    )

    stats = {zone["table_id"]: {"correct": 0, "missed": 0, "false_alarm": 0} for zone in zones}

    for index, result in enumerate(results):
        t = index * args.stride / fps
        height, width = result.orig_shape
        boxes = result.boxes.xyxy.tolist()

        for zone in zones:
            table = zone["table_id"]
            spans = presence.get(table, [])
            if any(abs(t - edge) < args.margin for span in spans for edge in span):
                continue

            truth = any(start <= t < end for start, end in spans)
            seen = any(person_in_zone(box, width, height, zone) for box in boxes)

            if seen == truth:
                stats[table]["correct"] += 1
            elif truth:
                stats[table]["missed"] += 1
            else:
                stats[table]["false_alarm"] += 1

    total = {"correct": 0, "missed": 0, "false_alarm": 0}
    print(f"{'table':<8}{'checked':>9}{'correct':>9}{'missed':>8}{'false':>7}{'accuracy':>10}")
    for table, s in sorted(stats.items()):
        checked = sum(s.values())
        for key in total:
            total[key] += s[key]
        accuracy = s["correct"] / checked if checked else 0
        print(f"{table:<8}{checked:>9}{s['correct']:>9}{s['missed']:>8}{s['false_alarm']:>7}{accuracy:>10.0%}")

    checked = sum(total.values())
    print(
        f"\nOverall: {total['correct']}/{checked} checks correct "
        f"({total['correct'] / checked:.0%}), "
        f"{total['missed']} missed, {total['false_alarm']} false alarms"
    )


if __name__ == "__main__":
    main()
