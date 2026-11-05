"use strict";

const IMAGE_CAMERA_ID = "CAM-01";
const VIDEO_CAMERA_ID = "CAM-02";
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MIN_ZONE_SIZE = 0.02;

const adminKeyInput = document.getElementById("admin-key");

const layer = document.getElementById("zone-layer");
const zoneStatus = document.getElementById("zone-status");
const saveButton = document.getElementById("save-zone");
const tableList = document.getElementById("table-list");
const zoneTableSelect = document.getElementById("zone-table-id");

const manualTableSelect = document.getElementById("manual-table-id");
const manualStatusSelect = document.getElementById("table-01-status");
const applyStatusButton = document.getElementById("apply-status");
const statusFeedback = document.getElementById("status-feedback");

const modeTableSelect = document.getElementById("mode-table-id");
const tableModeSelect = document.getElementById("table-status-mode");
const saveTableModeButton = document.getElementById("save-table-mode");
const tableModeStatus = document.getElementById("table-mode-status");

const newTableLabel = document.getElementById("new-table-label");
const newTableSeats = document.getElementById("new-table-seats");
const addTableButton = document.getElementById("add-table");
const addTableStatus = document.getElementById("add-table-status");

const sourceRadios = document.querySelectorAll('input[name="source-mode"]');
const stageImage = document.querySelector(".stage-image");
const stageVideo = document.getElementById("stage-video");
const videoInputRow = document.getElementById("video-input-row");
const videoFile = document.getElementById("video-file");
const frozenFrame = document.getElementById("frozen-video-frame");
const captureButton = document.getElementById("capture-video-frame");

const uploadVideoButton = document.getElementById("upload-video");
const uploadStatus = document.getElementById("upload-status");
const startAnalysisButton = document.getElementById("start-analysis");
const analysisStatus = document.getElementById("analysis-status");

let activeCameraId = IMAGE_CAMERA_ID;
let zones = [];
let drag = null;
let draftZone = null;
let latestZoneLoad = 0;
let videoUrl = null;

function adminKey() {
  return adminKeyInput?.value.trim() ?? "";
}

const ERROR_MESSAGES = {
  400: "invalid request",
  401: "wrong or missing admin key",
  404: "not found",
  409: "already running",
  413: "file is too large",
  422: "invalid value",
  503: "service unavailable",
};

function describeStatus(status) {
  return ERROR_MESSAGES[status] ?? `HTTP ${status}`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(describeStatus(response.status));
  return response.json();
}

function adminJson(method, body) {
  return {
    method,
    headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey() },
    body: JSON.stringify(body),
  };
}

function setDisabled(elements, disabled) {
  for (const el of elements) el.disabled = disabled;
}

// Zones

async function loadZonesFromServer(cameraId = activeCameraId) {
  const data = await requestJson("/api/db/zones");
  if (!Array.isArray(data.zones)) throw new Error("Invalid zone data received");
  return data.zones.filter((zone) => zone.camera_id === cameraId);
}

function createZoneOnServer(tableId, rectangle) {
  return requestJson(
    "/api/db/zones",
    adminJson("POST", { table_id: tableId, camera_id: activeCameraId, ...rectangle }),
  );
}

function deleteZoneOnServer(zoneId) {
  return requestJson(`/api/db/zones/${zoneId}`, {
    method: "DELETE",
    headers: { "X-Admin-Key": adminKey() },
  });
}

// Pointer position as a 0..1 fraction of the drawing layer.
function getPoint(event) {
  const bounds = layer.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

function updateRectangle(el, start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  el.style.left = `${x * 100}%`;
  el.style.top = `${y * 100}%`;
  el.style.width = `${width * 100}%`;
  el.style.height = `${height * 100}%`;

  return { x, y, width, height };
}

function renderZones() {
  layer.replaceChildren();
  for (const zone of zones) {
    const el = document.createElement("div");
    el.className = "zone-preview zone-saved";
    el.dataset.label = zone.label;
    updateRectangle(
      el,
      { x: zone.x, y: zone.y },
      { x: zone.x + zone.width, y: zone.y + zone.height },
    );
    layer.appendChild(el);
  }
}

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
    removeButton.addEventListener("click", async () => {
      removeButton.disabled = true;
      try {
        await deleteZoneOnServer(zone.id);
        zones = zones.filter((saved) => saved.id !== zone.id);
        render();
        zoneStatus.textContent = `${zone.label} zone deleted.`;
      } catch (error) {
        removeButton.disabled = false;
        zoneStatus.textContent = `Could not delete: ${error.message}.`;
      }
    });

    item.append(label, removeButton);
    tableList.appendChild(item);
  }
}

function render() {
  renderZones();
  renderList();
}

async function initializeZones() {
  const requestId = ++latestZoneLoad;
  const cameraId = activeCameraId;

  zoneStatus.textContent = `Loading zones for ${cameraId}...`;
  zones = [];
  draftZone = null;
  saveButton.disabled = true;
  render();

  try {
    const loaded = await loadZonesFromServer(cameraId);
    // Ignore responses that arrive after the admin switched camera.
    if (requestId !== latestZoneLoad || cameraId !== activeCameraId) return;
    zones = loaded;
    render();
    zoneStatus.textContent = `${zones.length} saved zone(s) loaded for ${cameraId}.`;
  } catch (error) {
    if (requestId !== latestZoneLoad) return;
    console.error("Zone loading failed:", error);
    zoneStatus.textContent = `Could not load zones: ${error.message}`;
  }
}

layer.addEventListener("pointerdown", (event) => {
  if (drag || (event.pointerType === "mouse" && event.button !== 0)) return;

  draftZone = null;
  saveButton.disabled = true;
  renderZones();

  const el = document.createElement("div");
  el.className = "zone-preview";
  layer.appendChild(el);

  drag = { pointerId: event.pointerId, start: getPoint(event), element: el };
  layer.setPointerCapture(event.pointerId);
});

layer.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  updateRectangle(drag.element, drag.start, getPoint(event));
});

layer.addEventListener("pointerup", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;

  const zone = updateRectangle(drag.element, drag.start, getPoint(event));

  if (zone.width < MIN_ZONE_SIZE || zone.height < MIN_ZONE_SIZE) {
    drag.element.remove();
    draftZone = null;
    saveButton.disabled = true;
    zoneStatus.textContent = "Zone too small. Try again.";
  } else {
    draftZone = zone;
    saveButton.disabled = false;
    zoneStatus.textContent = "New zone ready. Click Save Zone.";
  }

  drag = null;
});

layer.addEventListener("pointercancel", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.element.remove();
  drag = null;
  draftZone = null;
  saveButton.disabled = true;
  zoneStatus.textContent = "Drawing cancelled.";
});

saveButton.addEventListener("click", async () => {
  if (!draftZone) return;

  const tableId = zoneTableSelect.value;
  if (!tableId) {
    zoneStatus.textContent = "Choose a physical table before saving.";
    return;
  }

  saveButton.disabled = true;
  try {
    await createZoneOnServer(tableId, draftZone);
  } catch (error) {
    saveButton.disabled = false;
    zoneStatus.textContent = `Could not save: ${error.message}.`;
    return;
  }

  draftZone = null;
  try {
    zones = await loadZonesFromServer();
    render();
    zoneStatus.textContent = "Zone saved.";
  } catch {
    zoneStatus.textContent = "Saved, but reload failed. Refresh before saving again.";
  }
});

// Tables, manual status and mode

const tableControls = [
  manualTableSelect,
  applyStatusButton,
  zoneTableSelect,
  modeTableSelect,
  tableModeSelect,
  saveTableModeButton,
];

function addOption(select, value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  select.appendChild(option);
  return option;
}

async function loadDatabaseTables() {
  setDisabled(tableControls, true);
  statusFeedback.textContent = "Loading database tables...";
  tableModeStatus.textContent = "Loading table modes...";

  try {
    const data = await requestJson("/api/db/tables", { cache: "no-store" });
    if (!Array.isArray(data.tables) || data.tables.length === 0) {
      throw new Error("No database tables received");
    }

    manualTableSelect.replaceChildren();
    zoneTableSelect.replaceChildren();
    modeTableSelect.replaceChildren();
    addOption(zoneTableSelect, "", "Choose a physical table");

    for (const table of data.tables) {
      addOption(manualTableSelect, table.id, table.label);
      addOption(zoneTableSelect, table.id, table.label);
      const modeOption = addOption(modeTableSelect, table.id, table.label);
      modeOption.dataset.mode = table.status_mode ?? "manual";
    }

    tableModeSelect.value = modeTableSelect.selectedOptions[0].dataset.mode;
    setDisabled(tableControls, false);
    statusFeedback.textContent = `${data.tables.length} tables loaded.`;
    tableModeStatus.textContent = "Pick a table and a mode, then apply.";
  } catch (error) {
    console.error("Could not load database tables:", error);
    statusFeedback.textContent = "Could not load tables. Is the API running?";
    tableModeStatus.textContent = "Could not load tables.";
  }
}

modeTableSelect.addEventListener("change", () => {
  tableModeSelect.value = modeTableSelect.selectedOptions[0]?.dataset.mode ?? "manual";
  tableModeStatus.textContent = "";
});

saveTableModeButton.addEventListener("click", async () => {
  const tableId = modeTableSelect.value;
  const newMode = tableModeSelect.value;

  if (!tableId) {
    tableModeStatus.textContent = "Choose a physical table.";
    return;
  }
  if (!adminKey()) {
    tableModeStatus.textContent = "Enter the admin key at the top first.";
    return;
  }

  const controls = [saveTableModeButton, modeTableSelect, tableModeSelect];
  setDisabled(controls, true);
  tableModeStatus.textContent = `Saving ${tableId} as ${newMode}...`;

  try {
    const result = await requestJson(
      `/api/admin/tables/${encodeURIComponent(tableId)}/mode`,
      adminJson("PATCH", { mode: newMode }),
    );
    if (result.updated !== true || result.status_mode !== newMode) {
      throw new Error("Unexpected server response");
    }
    modeTableSelect.selectedOptions[0].dataset.mode = newMode;
    tableModeStatus.textContent =
      `${tableId} is now ${newMode}. Student cards refresh automatically.`;
  } catch (error) {
    console.error("Could not change table mode:", error);
    tableModeStatus.textContent = `Could not change mode: ${error.message}.`;
  } finally {
    setDisabled(controls, false);
  }
});

applyStatusButton.addEventListener("click", async () => {
  const tableId = manualTableSelect.value;
  if (!tableId) {
    statusFeedback.textContent = "Please select a table.";
    return;
  }
  if (!adminKey()) {
    statusFeedback.textContent = "Enter the admin key at the top first.";
    return;
  }

  const controls = [applyStatusButton, manualTableSelect, manualStatusSelect];
  setDisabled(controls, true);
  statusFeedback.textContent = "Saving...";

  try {
    const data = await requestJson(
      `/api/db/tables/${encodeURIComponent(tableId)}/status`,
      adminJson("PATCH", { status: manualStatusSelect.value }),
    );
    statusFeedback.textContent = `Saved: ${tableId} is now ${data.status}.`;
  } catch (error) {
    console.error("Status update failed:", error);
    statusFeedback.textContent = `Could not save status: ${error.message}.`;
  } finally {
    setDisabled(controls, false);
  }
});

addTableButton.addEventListener("click", async () => {
  const seats = Number(newTableSeats.value);

  if (!adminKey()) {
    addTableStatus.textContent = "Enter the admin key at the top first.";
    return;
  }
  if (!Number.isInteger(seats) || seats < 1 || seats > 20) {
    addTableStatus.textContent = "Seats must be a whole number from 1 to 20.";
    return;
  }

  addTableButton.disabled = true;
  addTableStatus.textContent = "Adding table...";

  try {
    const table = await requestJson(
      "/api/admin/tables",
      adminJson("POST", { label: newTableLabel.value.trim(), seats }),
    );
    newTableLabel.value = "";
    addTableStatus.textContent = `Added ${table.label} (${table.id}).`;
    await loadDatabaseTables();
  } catch (error) {
    addTableStatus.textContent = `Could not add table: ${error.message}.`;
  } finally {
    addTableButton.disabled = false;
  }
});

// Image / video source

function switchSource(mode) {
  const showingVideo = mode === "video";
  activeCameraId = showingVideo ? VIDEO_CAMERA_ID : IMAGE_CAMERA_ID;

  document.body.classList.toggle("video-preview", showingVideo);
  stageImage.hidden = showingVideo;
  stageVideo.hidden = !showingVideo;
  videoInputRow.hidden = !showingVideo;
  frozenFrame.hidden = true;
  layer.hidden = showingVideo;
  tableList.hidden = showingVideo;
  tableList.style.display = showingVideo ? "none" : "";

  draftZone = null;
  saveButton.disabled = true;

  if (showingVideo) {
    zoneStatus.textContent =
      "Choose a video, then capture a frame to draw zones on.";
  } else {
    stageVideo.pause();
  }

  initializeZones();
}

document.querySelector('input[name="source-mode"][value="video"]').disabled = false;

for (const radio of sourceRadios) {
  radio.addEventListener("change", () => {
    if (radio.checked) switchSource(radio.value);
  });
}

window.addEventListener("pageshow", () => {
  document.querySelector('input[name="source-mode"][value="image"]').checked = true;
  switchSource("image");
});

videoFile.addEventListener("change", () => {
  const file = videoFile.files[0];
  if (!file) return;

  captureButton.disabled = true;
  frozenFrame.hidden = true;
  stageVideo.hidden = false;

  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = URL.createObjectURL(file);
  stageVideo.src = videoUrl;
  stageVideo.load();

  zoneStatus.textContent = "Recording loaded. Use the video controls to play or pause.";
});

stageVideo.addEventListener("loadeddata", () => {
  captureButton.disabled = false;
});

// Freeze the current video frame on a canvas so zones can be drawn on it.
captureButton.addEventListener("click", () => {
  if (stageVideo.readyState < 2) {
    zoneStatus.textContent = "Video frame is not ready yet.";
    return;
  }

  stageVideo.pause();
  frozenFrame.width = stageVideo.videoWidth;
  frozenFrame.height = stageVideo.videoHeight;

  const context = frozenFrame.getContext("2d");
  if (!context) {
    zoneStatus.textContent = "Could not initialize the canvas.";
    return;
  }
  context.drawImage(stageVideo, 0, 0, frozenFrame.width, frozenFrame.height);

  stageVideo.hidden = true;
  frozenFrame.hidden = false;
  document.body.classList.remove("video-preview");
  layer.hidden = false;
  tableList.hidden = false;
  tableList.style.display = "";
  render();

  zoneStatus.textContent = "Frame captured. Choose a table, draw its zone, then save.";
});

// Upload and analysis

uploadVideoButton.addEventListener("click", async () => {
  const file = videoFile.files[0];

  if (!file || !file.name.toLowerCase().endsWith(".mp4")) {
    uploadStatus.textContent = "Please select an MP4 video.";
    return;
  }
  if (!adminKey()) {
    uploadStatus.textContent = "Enter the admin key at the top first.";
    return;
  }
  if (file.size > MAX_VIDEO_BYTES) {
    uploadStatus.textContent = "Video must be under 50 MB.";
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  uploadVideoButton.disabled = true;
  uploadStatus.textContent = "Uploading video...";

  try {
    const response = await fetch(`/api/admin/media/${VIDEO_CAMERA_ID}`, {
      method: "POST",
      headers: { "X-Admin-Key": adminKey() },
      body: formData,
    });
    uploadStatus.textContent = response.ok
      ? "Video uploaded. Start the analysis in step 2."
      : `Upload failed: ${describeStatus(response.status)}.`;
  } catch {
    uploadStatus.textContent = "Cannot connect to the server.";
  } finally {
    uploadVideoButton.disabled = false;
  }
});

startAnalysisButton.addEventListener("click", async () => {
  if (!adminKey()) {
    analysisStatus.textContent = "Enter the admin key at the top first.";
    return;
  }

  startAnalysisButton.disabled = true;
  analysisStatus.textContent = "Requesting YOLO analysis...";

  try {
    const response = await fetch("/api/admin/analysis/start", {
      method: "POST",
      headers: { "X-Admin-Key": adminKey() },
    });

    if (response.status === 202) {
      analysisStatus.textContent = "Analysis started. Watch the student page.";
    } else if (response.status === 409) {
      analysisStatus.textContent = "Analysis is already running.";
    } else {
      analysisStatus.textContent = `Could not start: ${describeStatus(response.status)}.`;
    }
  } catch {
    analysisStatus.textContent = "Cannot reach the server.";
  } finally {
    startAnalysisButton.disabled = false;
  }
});

initializeZones();
loadDatabaseTables();
