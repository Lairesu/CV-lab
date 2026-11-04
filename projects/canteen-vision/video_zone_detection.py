
from ultralytics import YOLO
from zone_matching import load_zones, person_in_zone

# Paths inside the existing vision container.
MODEL_PATH = "/workspace/models/yolo26n.pt"
VIDEO_PATH = (
    "/workspace/projects/canteen-vision/videos/"
    "smart-canteen-test.mp4"
)

# Load our saved CAM-02 zones from FastAPI.
zones = load_zones()
print(f"Loaded {len(zones)} CAM-02 zones")

if not zones:
    raise RuntimeError("No CAM-02 zones configured")

# Load the pretrained person-detection model.
model = YOLO(MODEL_PATH)

# Analyze sampled frames from the recording.
results = model.predict(
    source=VIDEO_PATH,
    stream=True,
    classes=[0],
    conf=0.35,
    vid_stride=24,
    device="cpu",
    verbose=False,
)

for frame_number, result in enumerate(results, start=1):
    # YOLO reports the original frame dimensions.
    frame_height, frame_width = result.orig_shape

    # Start without occupancy evidence for any table.
    occupied_candidates = set()

    for box in result.boxes.xyxy.tolist():
        # Determine which saved zones contain this person's center.
        for zone in zones:
            if person_in_zone(
                box, frame_width, frame_height, zone
            ):
                occupied_candidates.add(zone["table_id"])

    print(f"\nSample {frame_number}")

    for zone in zones:
        table_id = zone["table_id"]

        if table_id in occupied_candidates:
            status = "POSSIBLY OCCUPIED"
        else:
            status = "UNKNOWN"

        print(f"  {table_id}: {status}")

print("\nVideo-zone analysis completed.")
