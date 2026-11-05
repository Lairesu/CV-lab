from ultralytics import YOLO
from collections import Counter

# load the pretrained AI model
# Image to analyze
# Run object detection
# count detected objects
	# save the image with bounding bozes

# loading Pre-trainde AI model (YOLO)
model = YOLO("/workspace/models/yolo26n.pt")

# load image to analyze
image = "/workspace/models/image.png"

# Run the program for detection
results = model.predict(
    source=image,
    conf=0.35,
    verbose=False
)

#count the detected objects
for result in results:
	objects = []

	for box in result.boxes:
		class_id =  int(box.cls[0])
		name = model.names[class_id]
		objects.append(name)

	counts = Counter(objects)

	print("\nObjects detected: ")
	for name, count in counts.items():
		print(f"{name}: {count}")

	# save the image with boundary boxes
	result.save(
        	filename="/workspace/projects/canteen-vision/count_result.jpg"
    )

print("\nFinished!")

