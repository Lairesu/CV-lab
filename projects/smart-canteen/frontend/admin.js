
'use strict';

/*
 * SMART CANTEEN — ADMIN PAGE
 *
 * This file currently handles TWO independent features:
 *
 * 1. Table-zone editor:
 *    Draw and save rectangles over a reference image.
 *    Storage: browser localStorage.
 *
 * 2. Manual table-status controls:
 *    Load tables from FastAPI and update their statuses.
 *    Storage: SQLite through the backend API.
 *
 * IMPORTANT:
 * No automatic camera occupancy detection exists yet.
 */


/* ==========================================
   PART 1 — FIND THE HTML ELEMENTS
   ========================================== */

// The transparent layer where we draw rectangles.
const layer = document.getElementById('zone-layer');

// Displays messages about drawing and saving zones.
const status = document.getElementById('zone-status');

// Button used to save a newly drawn zone.
const saveButton = document.getElementById('save-zone');

// List showing configured table zones.
const tableList = document.getElementById('table-list');


/* ==========================================
   PART 2 — LOCAL ZONE DATA
   ========================================== */

// localStorage keys identify where the browser saves zones.
// OLD_KEY is kept so older saved data can be migrated.
const STORAGE_KEY = 'smart-canteen:demo-zones:v2';
const OLD_KEY = 'smart-canteen:demo-zone:v1';

// Load saved zones when this script starts.
let zones = loadZones();

// Calculate the next internal zone ID.
let nextTableId = Math.max(0, ...zones.map(z => z.id)) + 1;

// Information about an active pointer drag.
let drag = null;

// Coordinates of a newly drawn but unsaved rectangle.
let draftZone = null;


/* ==========================================
   PART 3 — VALIDATE ZONE COORDINATES
   ========================================== */

/*
 * validZone()
 *
 * Checks whether an object contains valid rectangle coordinates.
 *
 * Coordinates are normalized from 0 to 1:
 * 0 = beginning of the image
 * 1 = end of the image
 *
 * Returns true for a valid rectangle, otherwise false.
 */
function validZone(z) {
  if (!z) return false;

  const values = [z.x, z.y, z.width, z.height];

  return values.every(Number.isFinite) &&
    z.x >= 0 &&
    z.y >= 0 &&
    z.width > 0 &&
    z.height > 0 &&
    z.x + z.width <= 1.000001 &&
    z.y + z.height <= 1.000001;
}


/* ==========================================
   PART 4 — LOAD AND SAVE ZONES
   ========================================== */

/*
 * loadZones()
 *
 * Retrieves previously saved rectangles from localStorage.
 *
 * It also supports migrating our older single-zone format
 * into the newer multiple-zone format.
 *
 * Returns an array of saved zones.
 */
function loadZones() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved !== null) {
      const data = JSON.parse(saved);

      if (!Array.isArray(data)) {
        throw new Error('Invalid saved zone collection');
      }

      // Ignore invalid saved records.
      return data.filter(z =>
        validZone(z) &&
        Number.isInteger(z.id) &&
        z.id > 0
      );
    }

    // Migration: check for an old single-zone record.
    const old = localStorage.getItem(OLD_KEY);

    if (old) {
      const zone = JSON.parse(old);

      if (validZone(zone)) {
        const migrated = [{
          id: 1,
          label: 'Table 01',
          ...zone
        }];

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(migrated)
        );

        return migrated;
      }
    }

  } catch (error) {
    console.error('Unable to load zones:', error);
  }

  // If nothing is saved, begin with an empty array.
  return [];
}


/*
 * storeZones(updated)
 *
 * Saves the provided zone array into localStorage.
 *
 * JSON.stringify converts JavaScript objects into text.
 *
 * Returns true if saving succeeds, otherwise false.
 */
function storeZones(updated) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(updated)
    );

    return true;

  } catch (error) {
    console.error('Unable to save zones:', error);
    status.textContent = 'Saving failed.';

    return false;
  }
}


/* ==========================================
   PART 5 — POINTER COORDINATES
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
    x: Math.max(0, Math.min(1,
      (event.clientX - bounds.left) / bounds.width)),

    y: Math.max(0, Math.min(1,
      (event.clientY - bounds.top) / bounds.height))
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
   PART 6 — RENDER SAVED ZONES
   ========================================== */

/*
 * renderZones()
 *
 * Clears the current visual rectangles and rebuilds them
 * using the saved zones array.
 *
 * This does not delete anything from localStorage.
 */
function renderZones() {
  layer.replaceChildren();

  for (const zone of zones) {
    const element = document.createElement('div');

    element.className = 'zone-preview zone-saved';
    element.dataset.label = zone.label;

    updateRectangle(
      element,
      { x: zone.x, y: zone.y },
      {
        x: zone.x + zone.width,
        y: zone.y + zone.height
      }
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
 * The delete action updates localStorage and redraws the UI.
 */
function renderList() {
  tableList.replaceChildren();

  if (zones.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No configured tables yet.';

    tableList.appendChild(empty);
    return;
  }

  for (const zone of zones) {
    const item = document.createElement('li');

    const label = document.createElement('span');
    label.textContent = zone.label;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Delete';

    // Remove only the selected zone.
    removeButton.addEventListener('click', () => {
      const updated = zones.filter(z => z.id !== zone.id);

      if (storeZones(updated)) {
        zones = updated;
        render();

        status.textContent = `${zone.label} deleted.`;
      }
    });

    item.append(label, removeButton);
    tableList.appendChild(item);
  }
}


/*
 * render()
 *
 * Refreshes both parts of the zone editor:
 * 1. Rectangles over the image.
 * 2. Configured-table sidebar.
 */
function render() {
  renderZones();
  renderList();
}


/* ==========================================
   PART 7 — DRAWING RECTANGLES
   ========================================== */

/*
 * pointerdown
 *
 * Runs when the user presses their mouse button or
 * touches the drawing layer.
 *
 * Creates a new unsaved rectangle.
 */
layer.addEventListener('pointerdown', event => {

  // Ignore another pointer while already drawing.
  // For a mouse, only accept the primary button.
  if (
    drag ||
    (event.pointerType === 'mouse' && event.button !== 0)
  ) {
    return;
  }

  draftZone = null;
  saveButton.disabled = true;

  // Remove old drafts while preserving saved zones.
  renderZones();

  const element = document.createElement('div');
  element.className = 'zone-preview';

  layer.appendChild(element);

  // Remember the starting position and pointer.
  drag = {
    pointerId: event.pointerId,
    start: getPoint(event),
    element
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
layer.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  updateRectangle(
    drag.element,
    drag.start,
    getPoint(event)
  );
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
layer.addEventListener('pointerup', event => {
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  const zone = updateRectangle(
    drag.element,
    drag.start,
    getPoint(event)
  );

  // Reject rectangles smaller than 2% in either dimension.
  if (zone.width < 0.02 || zone.height < 0.02) {
    drag.element.remove();

    draftZone = null;
    saveButton.disabled = true;

    status.textContent = 'Zone too small. Try again.';

  } else {
    draftZone = zone;
    saveButton.disabled = false;

    status.textContent = 'New zone ready. Click Save Zone.';
  }

  drag = null;
});


/*
 * pointercancel
 *
 * Cancels the current draft if the browser interrupts
 * the pointer interaction.
 */
layer.addEventListener('pointercancel', event => {
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  drag.element.remove();

  drag = null;
  draftZone = null;
  saveButton.disabled = true;

  status.textContent = 'Drawing cancelled.';
});


/* ==========================================
   PART 8 — TABLE LABEL GENERATION
   ========================================== */

/*
 * nextAvailableTableNumber()
 *
 * Finds the smallest unused display number.
 *
 * Example:
 * Existing labels: Table 01, Table 02, Table 04
 * Result: 3
 *
 * Display labels are different from internal IDs.
 */
function nextAvailableTableNumber() {
  const usedLabels = new Set(
    zones.map(zone => zone.label)
  );

  let number = 1;

  while (
    usedLabels.has(
      `Table ${String(number).padStart(2, '0')}`
    )
  ) {
    number++;
  }

  return number;
}


/* ==========================================
   PART 9 — SAVE NEW RECTANGLES
   ========================================== */

/*
 * Save Zone button
 *
 * Converts the current draft into a saved zone.
 *
 * The new zone receives:
 * - An internal numeric ID.
 * - A visible table label.
 * - Normalized rectangle coordinates.
 */
saveButton.addEventListener('click', () => {
  if (!draftZone) return;

  const id = nextTableId;

  const newZone = {
    id,
    label: `Table ${String(nextAvailableTableNumber()).padStart(2, '0')}`,
    ...draftZone
  };

  const updated = [...zones, newZone];

  if (storeZones(updated)) {
    zones = updated;
    nextTableId++;

    draftZone = null;
    saveButton.disabled = true;

    render();

    status.textContent = `${newZone.label} saved!`;
  }
});


// Display the zones already saved in this browser.
render();
status.textContent = `${zones.length} saved table zone(s) loaded.`;


/* ==========================================
   PART 10 — MANUAL STATUS CONTROLS
   ========================================== */

/*
 * These controls are separate from the zone editor.
 *
 * They operate on database tables identified by:
 * T-01, T-02, T-03 and T-04.
 */

// Dropdown containing database table IDs.
const manualTableSelect = document.getElementById('manual-table-id');

// Dropdown containing the desired availability status.
const manualStatusSelect = document.getElementById('table-01-status');

// Button that sends the status update.
const applyStatusButton = document.getElementById('apply-status');

// Displays messages about API requests and results.
const statusFeedback = document.getElementById('status-feedback');


// Keep controls disabled until the database tables load.
manualTableSelect.disabled = true;
applyStatusButton.disabled = true;


/* ==========================================
   PART 11 — LOAD TABLES FROM FASTAPI
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
  statusFeedback.textContent = 'Loading database tables...';

  fetch('/api/db/tables')
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    })
    .then(data => {

      // The API should return an array of table objects.
      if (!Array.isArray(data.tables) || data.tables.length === 0) {
        throw new Error('No database tables received');
      }

      // Clear the previous dropdown options.
      manualTableSelect.replaceChildren();

      // Create one option for each database table.
      for (const table of data.tables) {
        const option = document.createElement('option');

        // Internal database identifier, e.g. T-03.
        option.value = table.id;

        // Visible label, e.g. Table 03.
        option.textContent = table.label;

        manualTableSelect.appendChild(option);
      }

      // Now the operator can select a table and update it.
      manualTableSelect.disabled = false;
      applyStatusButton.disabled = false;

      statusFeedback.textContent =
        `${data.tables.length} database tables loaded.`;
    })
    .catch(error => {
      console.error('Could not load database tables:', error);

      // Don't allow updates when table loading fails.
      manualTableSelect.disabled = true;
      applyStatusButton.disabled = true;

      statusFeedback.textContent =
        'Could not load database tables.';
    });
}


/* ==========================================
   PART 12 — UPDATE A TABLE THROUGH FASTAPI
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
applyStatusButton.addEventListener('click', () => {

  // Example: T-03.
  const tableId = manualTableSelect.value;

  // Example: available.
  const selectedStatus = manualStatusSelect.value;

  // Don't send a request if no database table is selected.
  if (!tableId) {
    statusFeedback.textContent = 'Please select a table.';
    return;
  }

  // Prevent overlapping updates while saving.
  applyStatusButton.disabled = true;
  manualTableSelect.disabled = true;
  manualStatusSelect.disabled = true;

  statusFeedback.textContent = 'Saving...';

  // Send the status change to our existing FastAPI endpoint.
  fetch(`/api/db/tables/${encodeURIComponent(tableId)}/status`, {
    method: 'PATCH',

    headers: {
      'Content-Type': 'application/json'
    },

    body: JSON.stringify({
      status: selectedStatus
    })
  })

    // Check whether FastAPI accepted the request.
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    })

    // Display the saved status returned by FastAPI.
    .then(data => {
      statusFeedback.textContent =
        `${tableId} saved as ${data.status}.`;
    })

    // Display errors instead of falsely claiming success.
    .catch(error => {
      console.error('Status update failed:', error);

      statusFeedback.textContent =
        `Could not save status (${error.message}).`;
    })

    // Restore the controls after success or failure.
    .finally(() => {
      manualTableSelect.disabled = false;
      manualStatusSelect.disabled = false;
      applyStatusButton.disabled = false;
    });
});


/* ==========================================
   PART 13 — INITIALIZE ADMIN DATABASE UI
   ========================================== */

// Start loading the real database tables when this page loads.
loadDatabaseTables();
