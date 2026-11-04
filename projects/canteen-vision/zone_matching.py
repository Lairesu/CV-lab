import json
from urllib.request import urlopen


API_URL = "http://api:8000/api/db/zones"
CAMERA_ID = "CAM-02"


def load_zones():
    # Load the zones configured for our video camera.
    with urlopen(API_URL, timeout=5) as response:
        data = json.load(response)

    return [
        zone for zone in data["zones"]
        if zone["camera_id"] == CAMERA_ID
    ]


def person_in_zone(box, frame_width, frame_height, zone):
    # YOLO bounding box: left, top, right, bottom (pixels).
    x1, y1, x2, y2 = box

    # Convert the person's center to normalized coordinates.
    center_x = ((x1 + x2) / 2) / frame_width
    center_y = ((y1 + y2) / 2) / frame_height

    # Check whether the center is inside this table zone.
    return (
        zone["x"] <= center_x <= zone["x"] + zone["width"]
        and
        zone["y"] <= center_y <= zone["y"] + zone["height"]
    )


if __name__ == "__main__":
    zones = load_zones()

    print(f"Loaded {len(zones)} zones for {CAMERA_ID}")

    # Simulate a person at the center of each configured zone.
    # This tests our geometry without depending on YOLO yet.
    width, height = 1280, 720

    for zone in zones:
        center_x = (zone["x"] + zone["width"] / 2) * width
        center_y = (zone["y"] + zone["height"] / 2) * height

        fake_box = (
            center_x - 10,
            center_y - 20,
            center_x + 10,
            center_y + 20,
        )

        matches = [
            saved["table_id"]
            for saved in zones
            if person_in_zone(fake_box, width, height, saved)
        ]

        print(f"{zone['table_id']} test: matches {matches}")

        assert zone["table_id"] in matches

    print("Zone matching tests passed!")
