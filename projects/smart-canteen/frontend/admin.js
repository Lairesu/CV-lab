"use strict";

/*
 * SMART CANTEEN — ADMIN PAGE
 *
 * 1. Table-zone editor:
 *    Draw and save table zones on images or captured video frames.
 *    Each camera has its own zone configuration.
 *    Storage: SQLite through FastAPI.
 *
 * 2. Manual table-status controls:
 *    Load physical tables and update their statuses.
 *    Storage: SQLite through FastAPI.
 *
 * Automatic YOLO occupancy detection is not implemented yet.
 */

/* PART 1 — PAGE ELEMENTS */

// The transparent layer where we draw rectangles.
const layer = document.getElementById("zone-layer");

// Displays messages about drawing and saving zones.
const status = document.getElementById("zone-status");

// Button used to save a newly drawn zone.
const saveButton = document.getElementById("save-zone");

// List showing configured table zones.
const tableList = document.getElementById("table-list");

/* PART 2 — CAMERA CONFIGURATION AND ZONE STATE */
// Each camera view has its own saved table zones.
const IMAGE_CAMERA_ID = "CAM-01";
const VIDEO_CAMERA_ID = "CAM-02";

// Start with the existing image configuration.
// This will change when switching source modes.
let activeCameraId = IMAGE_CAMERA_ID;

// Start empty until SQLite provides the saved camera zones.
let zones = [];

// Information about an active pointer drag.
let drag = null;

// Coordinates of a newly drawn but unsaved rectangle.
let draftZone = null;

/* ==========================================
   PART 3 — SQLITE ZONE API HELPERS
   ========================================== */

async function createZoneOnServer(tableId, rectangle) {
  // Send the selected table and drawn rectangle to FastAPI.
  const response = await fetch("/api/db/zones", {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      table_id: tableId,

      // Each zone belongs to a configured camera view.
      camera_id: activeCameraId,
      x: rectangle.x,
      y: rectangle.y,
      width: rectangle.width,
      height: rectangle.height,
    }),
  });

  // Don't report success if the server rejected the rectangle.
  if (!response.ok) {
    throw new Error(`Zone save failed: HTTP ${response.status}`);
  }

  // FastAPI returns the saved zone, including its database ID.
  return await response.json();
}


async function loadZonesFromServer(cameraId = activeCameraId) {
  // Request the saved zones from FastAPI.
  const response = await fetch("/api/db/zones");

  // Stop if the request failed.
  if (!response.ok) {
    throw new Error(`Zone loading failed: HTTP ${response.status}`);
  }

  const data = await response.json();

  // Check that the API returned an array.
  if (!Array.isArray(data.zones)) {
    throw new Error("Invalid zone data received");
  }

  // Return only zones belonging to the requested camera.
  return data.zones.filter(
    (zone) => zone.camera_id === cameraId
  );
}

async function deleteZoneOnServer(zoneId) {
  // Tell FastAPI which database zone should be removed.
  // We use its unique ID so other camera zones remain untouched.
  const response = await fetch(`/api/db/zones/${zoneId}`, {
    method: "DELETE",
  });

  // If the zone does not exist or the server fails,
  // don't pretend the deletion was successful.
  if (!response.ok) {
    throw new Error(`Zone deletion failed: HTTP ${response.status}`);
  }

  // Return FastAPI's confirmation of the deleted zone.
  return await response.json();
}
/* ==========================================
   PART 4 — POINTER COORDINATES
   ========================================== */

/*
 * getPoint(event)
 *
 * Converts the pointer's browser position into normalized
 * coordinates relative to our zone layer.
 *
 * Example:
 * x = 0.5 means halfway across the image.
 *
 * Clamping keeps coordinates between 0 and 1.
 */
function getPoint(event) {
  const bounds = layer.getBoundingClientRect();

  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),

    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

/*
 * updateRectangle(element, start, end)
 *
 * Calculates and displays a rectangle between two points.
 *
 * Math.min finds the top-left corner.
 * Math.abs calculates positive width and height.
 *
 * The result works even when dragging backwards.
 *
 * Returns the calculated rectangle coordinates.
 */
function updateRectangle(element, start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);

  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  element.style.left = `${x * 100}%`;
  element.style.top = `${y * 100}%`;
  element.style.width = `${width * 100}%`;
  element.style.height = `${height * 100}%`;

  return { x, y, width, height };
}

/* ==========================================
   PART 5 — RENDER SAVED ZONES
   ========================================== */

/*
 * renderZones()
 *
 * Clears the current visual rectangles and rebuilds them
 * using the saved zones array.
 *
 * Rendering does not modify saved SQLite zones.
 */
function renderZones() {
  layer.replaceChildren();

  for (const zone of zones) {
    const element = document.createElement("div");

    element.className = "zone-preview zone-saved";
    element.dataset.label = zone.label;

    updateRectangle(
      element,
      { x: zone.x, y: zone.y },
      {
        x: zone.x + zone.width,
        y: zone.y + zone.height,
      },
    );

    layer.appendChild(element);
  }
}

/*
 * renderList()
 *
 * Builds the sidebar list of configured zones.
 *
 * Each zone receives a Delete button.
 * Deletion goes through FastAPI before updating the UI.
 */
function renderList() {
  tableList.replaceChildren();

  if (zones.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No configured tables yet.";

    tableList.appendChild(empty);
    return;
  }

  for (const zone of zones) {
    const item = document.createElement("li");

    const label = document.createElement("span");
    label.textContent = zone.label;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Delete";

    // Delete a saved camera zone through FastAPI.
    removeButton.addEventListener("click", async () => {
      // Only database-backed records can be deleted here.
      if (!zone.table_id) {
        status.textContent = "This zone is missing its table ID; deletion blocked.";
        return;
      }

      // Prevent repeated clicks while the request is running.
      removeButton.disabled = true;

      try {
        // Delete from SQLite before removing the rectangle visually.
        await deleteZoneOnServer(zone.id);

        zones = zones.filter((saved) => saved.id !== zone.id);
        render();

        status.textContent = `${zone.label} deleted from SQLite.`;
      } catch (error) {
        // Keep the rectangle if the server could not delete it.
        removeButton.disabled = false;
        status.textContent = `Deletion failed: ${error.message}`;
      }
    });
    // Add the label and Delete button to the list item.
    item.append(label, removeButton);

    // Insert the completed item into the sidebar.
    tableList.appendChild(item);
  }
}

/*
 * render()
 *
 * Refreshes both parts of the zone editor:
 * 1. Rectangles over the active reference image or frame.
 * 2. Configured-table sidebar.
 */
function render() {
  renderZones();
  renderList();
}

/* ==========================================
   PART 6 — DRAWING RECTANGLES
   ========================================== */

/*
 * pointerdown
 *
 * Runs when the user presses their mouse button or
 * touches the drawing layer.
 *
 * Creates a new unsaved rectangle.
 */
layer.addEventListener("pointerdown", (event) => {
  // Ignore another pointer while already drawing.
  // For a mouse, only accept the primary button.
  if (drag || (event.pointerType === "mouse" && event.button !== 0)) {
    return;
  }

  draftZone = null;
  saveButton.disabled = true;

  // Remove old drafts while preserving saved zones.
  renderZones();

  const element = document.createElement("div");
  element.className = "zone-preview";

  layer.appendChild(element);

  // Remember the starting position and pointer.
  drag = {
    pointerId: event.pointerId,
    start: getPoint(event),
    element,
  };

  // Continue receiving this pointer's events while dragging.
  layer.setPointerCapture(event.pointerId);
});

/*
 * pointermove
 *
 * Runs while the pointer moves.
 *
 * Updates the draft rectangle to follow the pointer.
 */
layer.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  updateRectangle(drag.element, drag.start, getPoint(event));
});

/*
 * pointerup
 *
 * Runs when the user releases the pointer.
 *
 * Finalizes the draft rectangle.
 *
 * Very small rectangles are rejected to prevent
 * accidental clicks from creating table zones.
 */
layer.addEventListener("pointerup", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  const zone = updateRectangle(drag.element, drag.start, getPoint(event));

  // Reject rectangles smaller than 2% in either dimension.
  if (zone.width < 0.02 || zone.height < 0.02) {
    drag.element.remove();

    draftZone = null;
    saveButton.disabled = true;

    status.textContent = "Zone too small. Try again.";
  } else {
    draftZone = zone;
    saveButton.disabled = false;

    status.textContent = "New zone ready. Click Save Zone.";
  }

  drag = null;
});

/*
 * pointercancel
 *
 * Cancels the current draft if the browser interrupts
 * the pointer interaction.
 */
layer.addEventListener("pointercancel", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  drag.element.remove();

  drag = null;
  draftZone = null;
  saveButton.disabled = true;

  status.textContent = "Drawing cancelled.";
});


/* ==========================================
   PART 7 — SAVE ZONES TO SQLITE
   ========================================== */

saveButton.addEventListener("click", async () => {
  // Nothing to save if the user has not drawn a rectangle.
  if (!draftZone) return;

  // Every camera zone must belong to a real physical table.
  const tableId = zoneTableSelect.value;

  if (!tableId) {
    status.textContent = "Choose a physical table before saving.";
    return;
  }

  saveButton.disabled = true;
  let saved = false;

  try {
    // Ask FastAPI to save the rectangle in SQLite.
    await createZoneOnServer(tableId, draftZone);
    saved = true;

    // The rectangle is now saved, so clear the draft.
    draftZone = null;

    // Reload database records to get SQLite-generated zone IDs.
    zones = await loadZonesFromServer();
    render();

    status.textContent = "Zone saved to SQLite!";
  } catch (error) {
    if (saved) {
      status.textContent = "Saved, but reload failed. Refresh before saving again.";
    } else {
      saveButton.disabled = false;
      status.textContent = `Save failed: ${error.message}`;
    }
  }
});


/* ==========================================
   PART 8 — LOAD CAMERA ZONES
   ========================================== */

// Track which zone-loading request is the newest.
let latestZoneLoad = 0;

async function initializeZones() {
  // Each request gets its own number and camera ID.
  const requestId = ++latestZoneLoad;
  const requestedCameraId = activeCameraId;

  status.textContent =
    `Loading zones for ${requestedCameraId}...`;

  // Clear previously displayed zones before loading another camera.
  zones = [];
  draftZone = null;
  saveButton.disabled = true;
  render();

  try {
    const loadedZones = await loadZonesFromServer(requestedCameraId);

    // Ignore outdated responses after switching cameras.
    if (
      requestId !== latestZoneLoad ||
      requestedCameraId !== activeCameraId
    ) {
      return;
    }

    zones = loadedZones;
    render();

    status.textContent =
      `${zones.length} saved zone(s) loaded for ${requestedCameraId}.`;

  } catch (error) {
    // An older failed request must not overwrite the current status.
    if (requestId !== latestZoneLoad) return;

    status.textContent =
      `Could not load zones: ${error.message}`;

    console.error("Zone loading failed:", error);
  }
}

// Load saved zones when the admin page starts.
initializeZones();

/* ==========================================
   PART 9 — MANUAL STATUS CONTROLS
   ========================================== */

/*
 * These controls are separate from the zone editor.
 *
 * They operate on database tables identified by:
 * T-01, T-02, T-03 and T-04.
 */

// Dropdown containing database table IDs.
const manualTableSelect = document.getElementById("manual-table-id");

// The zone editor uses this to link rectangles to physical tables.
const zoneTableSelect = document.getElementById("zone-table-id");

// Dropdown containing the desired availability status.
const manualStatusSelect = document.getElementById("table-01-status");

// Button that sends the status update.
const applyStatusButton = document.getElementById("apply-status");

// Displays messages about API requests and results.
const statusFeedback = document.getElementById("status-feedback");

// Keep controls disabled until the database tables load.
manualTableSelect.disabled = true;
applyStatusButton.disabled = true;

/* ==========================================
   PART 10 — LOAD TABLES FROM FASTAPI
   ========================================== */

/*
 * loadDatabaseTables()
 *
 * Requests table records from our backend.
 *
 * 1. Send HTTP GET.
 * 2. Check the HTTP response.
 * 3. Convert JSON into JavaScript data.
 * 4. Create dropdown options.
 * 5. Enable the controls only after loading succeeds.
 */
function loadDatabaseTables() {
  statusFeedback.textContent = "Loading database tables...";

  fetch("/api/db/tables")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    })
    .then((data) => {
      // The API should return an array of table objects.
      if (!Array.isArray(data.tables) || data.tables.length === 0) {
        throw new Error("No database tables received");
      }

      // Clear the previous dropdown options.
      manualTableSelect.replaceChildren();

      // Clear old options and provide an empty initial selection.
      zoneTableSelect.replaceChildren();

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Choose a physical table";

      zoneTableSelect.appendChild(placeholder);

      // Create one option for each database table.
      for (const table of data.tables) {
        const option = document.createElement("option");

        // Internal database identifier, e.g. T-03.
        option.value = table.id;

        // Visible label, e.g. Table 03.
        option.textContent = table.label;

        manualTableSelect.appendChild(option);
        // Copy the option because one HTML element cannot belong
        // to two dropdowns at the same time.
        zoneTableSelect.appendChild(option.cloneNode(true));
      }

      // Now the operator can select a table and update it.
      manualTableSelect.disabled = false;
      applyStatusButton.disabled = false;
      zoneTableSelect.disabled = false;

      statusFeedback.textContent = `${data.tables.length} database tables loaded.`;
    })
    .catch((error) => {
      console.error("Could not load database tables:", error);

      // Don't allow updates when table loading fails.
      manualTableSelect.disabled = true;
      applyStatusButton.disabled = true;
      // Don't allow zone assignment if table loading fails.
      zoneTableSelect.disabled = true;

      statusFeedback.textContent = "Could not load database tables.";
    });
}

/* ==========================================
   PART 11 — UPDATE A TABLE THROUGH FASTAPI
   ========================================== */

/*
 * Update button click event
 *
 * 1. Read the selected database table ID.
 * 2. Read the selected status.
 * 3. Send an HTTP PATCH request.
 * 4. Show success or error feedback.
 *
 * FastAPI validates the request.
 * SQLite stores the updated status.
 */
applyStatusButton.addEventListener("click", () => {
  // Example: T-03.
  const tableId = manualTableSelect.value;

  // Example: available.
  const selectedStatus = manualStatusSelect.value;

  // Don't send a request if no database table is selected.
  if (!tableId) {
    statusFeedback.textContent = "Please select a table.";
    return;
  }

  // Prevent overlapping updates while saving.
  applyStatusButton.disabled = true;
  manualTableSelect.disabled = true;
  manualStatusSelect.disabled = true;

  statusFeedback.textContent = "Saving...";

  // Send the status change to our existing FastAPI endpoint.
  fetch(`/api/db/tables/${encodeURIComponent(tableId)}/status`, {
    method: "PATCH",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      status: selectedStatus,
    }),
  })
    // Check whether FastAPI accepted the request.
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    })

    // Display the saved status returned by FastAPI.
    .then((data) => {
      statusFeedback.textContent = `${tableId} saved as ${data.status}.`;
    })

    // Display errors instead of falsely claiming success.
    .catch((error) => {
      console.error("Status update failed:", error);

      statusFeedback.textContent = `Could not save status (${error.message}).`;
    })

    // Restore the controls after success or failure.
    .finally(() => {
      manualTableSelect.disabled = false;
      manualStatusSelect.disabled = false;
      applyStatusButton.disabled = false;
    });
});

/* ==========================================
   PART 12 — INITIALIZE ADMIN DATABASE UI
   ========================================== */

// Start loading the real database tables when this page loads.
loadDatabaseTables();


/* ==========================================
   PART 13 — SWITCH REFERENCE SOURCES
   ========================================== */

// Controls for choosing the reference source.
const sourceRadios = document.querySelectorAll(
  'input[name="source-mode"]'
);

const stageImage = document.querySelector(".stage-image");
const stageVideo = document.getElementById("stage-video");
const videoInputRow = document.getElementById("video-input-row");
const videoFile = document.getElementById("video-file");

// The frozen frame and its capture button.
const frozenFrame = document.getElementById("frozen-video-frame");
const captureButton = document.getElementById("capture-video-frame");

let videoUrl = null;

// Switch the visible reference source without changing SQLite.
function switchSource(mode) {
  const showingVideo = mode === "video";

  // Select the configuration belonging to this source.
  activeCameraId = showingVideo
    ? VIDEO_CAMERA_ID
    : IMAGE_CAMERA_ID;

  // Hide editing instructions during video preview.
  document.body.classList.toggle("video-preview", showingVideo);

  stageImage.hidden = showingVideo;
  stageVideo.hidden = !showingVideo;
  videoInputRow.hidden = !showingVideo;
  frozenFrame.hidden = true;

  // Hide editing controls during playback; enable them after capture.
  layer.hidden = showingVideo;
  tableList.hidden = showingVideo;
  tableList.style.display = showingVideo ? "none" : "";

  draftZone = null;
  saveButton.disabled = true;

  if (showingVideo) {
    status.textContent =
      "Choose a recording to preview. Existing image zones are protected.";
  } else {
    stageVideo.pause();
  }

  // Reload zones for the newly selected camera.
  initializeZones();
}

// Enable video mode now that its behavior is implemented.
document.querySelector(
  'input[name="source-mode"][value="video"]'
).disabled = false;

// React when the user switches between image and video.
for (const radio of sourceRadios) {
  radio.addEventListener("change", () => {
    if (radio.checked) switchSource(radio.value);
  });
}

// Preview a locally selected recording.
videoFile.addEventListener("change", () => {
  const file = videoFile.files[0];
  if (!file) return;

  // Disable capture while a new recording loads.
  captureButton.disabled = true;
  frozenFrame.hidden = true;
  stageVideo.hidden = false;
  if (videoUrl) URL.revokeObjectURL(videoUrl);

  videoUrl = URL.createObjectURL(file);
  stageVideo.src = videoUrl;
  stageVideo.load();

  status.textContent =
    "Recording loaded. Use the video controls to play or pause.";
});

// Always start with the static-image editor after a page reload.
window.addEventListener("pageshow", () => {
  const imageRadio = document.querySelector(
    'input[name="source-mode"][value="image"]'
  );

  imageRadio.checked = true;
  switchSource("image");
});

/* ==========================================
   PART 14 — CAPTURE FRAMES FOR EDITING
   ========================================== */

// Allow capturing once Firefox has decoded a video frame.
stageVideo.addEventListener("loadeddata", () => {
  captureButton.disabled = false;
});

// Copy the current video frame into the canvas.
captureButton.addEventListener("click", () => {
  if (stageVideo.readyState < 2) {
    status.textContent = "Video frame is not ready yet.";
    return;
  }

  // Freeze playback at the current frame.
  stageVideo.pause();

  // Match the canvas resolution to the video.
  frozenFrame.width = stageVideo.videoWidth;
  frozenFrame.height = stageVideo.videoHeight;

  // Get the canvas drawing interface.
  const context = frozenFrame.getContext("2d");

  if (!context) {
    status.textContent = "Could not initialize the canvas.";
    return;
  }

  // Copy the video frame into the canvas.
  context.drawImage(
    stageVideo,
    0,
    0,
    frozenFrame.width,
    frozenFrame.height
  );

  // Replace the player with the captured image.
  stageVideo.hidden = true;
  frozenFrame.hidden = false;

  // Enable zone editing over the frozen video frame.
  document.body.classList.remove("video-preview");

  // Show the rectangle drawing layer.
  layer.hidden = false;

  // Show this camera's saved table-zone list.
  tableList.hidden = false;
  tableList.style.display = "";

  // Display the zones belonging to the video camera.
  render();

  status.textContent =
    "Frame captured. Select a table, draw a zone, then save it.";
});
