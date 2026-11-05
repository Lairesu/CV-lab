"use strict";

const demo = window.SMART_CANTEEN_DEMO;

const REFRESH_INTERVAL_MS = 5000;

const statusLabels = {
  available: "Available",
  occupied: "Occupied",
  unknown: "Unknown",
};

const statusIcons = {
  available: "✓",
  occupied: "●",
  unknown: "?",
};

const filters = document.querySelectorAll("[data-filter]");
const grid = document.getElementById("table-grid");
const lastUpdated = document.getElementById("last-updated");

const syncStatus = document.createElement("p");
syncStatus.className = "data-sync-status";
syncStatus.setAttribute("role", "status");

let currentFilter = "all";
let requestInProgress = false;
let hasLoadedData = false;
let lastSuccess = 0;

function element(tag, className, content) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (content !== undefined) el.textContent = content;
  return el;
}

function addText(parent, tag, className, value) {
  const child = element(tag, className, value);
  parent.appendChild(child);
  return child;
}

// Automatic tables are camera estimates; manual tables are set by staff.
function statusSource(table) {
  return table.status_mode === "automatic" ? "Camera estimate" : "Set by staff";
}

function makeTableCard(table) {
  const label = statusLabels[table.status];
  const source = statusSource(table);

  const article = element("article", `table-card status-${table.status}`);
  article.setAttribute("aria-label", `${table.label}: ${label}, ${source}`);

  const top = element("div", "table-card-top");
  const icon = addText(top, "span", `table-icon ${table.status}`, statusIcons[table.status]);
  icon.setAttribute("aria-hidden", "true");
  addText(top, "span", `status-pill ${table.status}`, label);
  article.appendChild(top);

  addText(article, "h3", "table-name", table.label);
  addText(article, "p", "table-area", source);

  const bottom = element("div", "table-card-bottom");
  addText(bottom, "span", "", `${table.seats} seats`);
  addText(bottom, "span", "table-reference", table.id);
  article.appendChild(bottom);

  return article;
}

function updateOverview() {
  const counts = { available: 0, occupied: 0, unknown: 0 };

  for (const table of demo.tables) {
    if (counts[table.status] !== undefined) counts[table.status] += 1;
  }

  for (const status of Object.keys(counts)) {
    document.getElementById(`${status}-count`).textContent = String(counts[status]);
  }

  document.getElementById("total-tables").textContent = `${demo.tables.length} tables`;

  const track = document.getElementById("distribution-track");
  const total = Math.max(demo.tables.length, 1);
  track.replaceChildren();

  for (const status of ["available", "occupied", "unknown"]) {
    const segment = element("div", `track-segment ${status}`);
    segment.style.width = `${(counts[status] * 100) / total}%`;
    segment.title = `${statusLabels[status]}: ${counts[status]}`;
    track.appendChild(segment);
  }

  track.setAttribute(
    "aria-label",
    `Table status: ${counts.available} available, ` +
      `${counts.occupied} occupied, ${counts.unknown} unknown`,
  );
}

function render(filter = currentFilter) {
  const visible =
    filter === "all"
      ? demo.tables
      : demo.tables.filter((table) => table.status === filter);

  grid.replaceChildren();
  for (const table of visible) {
    grid.appendChild(makeTableCard(table));
  }
  if (visible.length === 0) {
    addText(grid, "p", "empty-state", "No tables match this filter.");
  }

  document.getElementById("table-count-label").textContent =
    `Showing ${visible.length} of ${demo.tables.length}`;

  filters.forEach((button) => {
    const selected = button.dataset.filter === filter;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });
}

function updateLastUpdated() {
  if (!lastUpdated || !lastSuccess) return;

  const seconds = Math.round((Date.now() - lastSuccess) / 1000);
  const stale = seconds > 15;
  const dot = '<span class="live-dot" aria-hidden="true"></span>';

  lastUpdated.classList.toggle("stale", stale);
  lastUpdated.innerHTML = dot + (seconds < 2 ? "Updated just now" : `Updated ${seconds} s ago`);
}

function loadTables() {
  if (requestInProgress) return;
  requestInProgress = true;

  fetch("/api/db/tables", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`API returned HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      if (!Array.isArray(data.tables)) throw new Error("Invalid table data");

      demo.tables = data.tables;
      hasLoadedData = true;
      lastSuccess = Date.now();
      updateOverview();
      render(currentFilter);
      updateLastUpdated();

      syncStatus.textContent =
        "Camera results are estimates · Available is set by staff";
    })
    .catch((error) => {
      console.error("Could not refresh tables:", error);

      if (hasLoadedData) {
        syncStatus.textContent =
          "Connection problem: statuses may be outdated. Retrying...";
      } else {
        document.getElementById("total-tables").textContent = "Data unavailable";
        grid.textContent = "Table information is unavailable. Retrying...";
        syncStatus.textContent = "Could not connect to the table database.";
      }
    })
    .finally(() => {
      requestInProgress = false;
    });
}

if (demo && Array.isArray(demo.tables)) {
  document.getElementById("venue-name").textContent = "Demo Canteen";
  document.getElementById("venue-description").textContent =
    "4 tables · staff updates and camera estimates";
  document.getElementById("venue-type").textContent = "Canteen";

  grid.before(syncStatus);

  // Drop the static sample tables; real data comes from the API.
  demo.tables = [];
  updateOverview();
  grid.textContent = "Loading table information...";
  syncStatus.textContent = "Connecting to the demo database...";

  filters.forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;
      if (hasLoadedData) render(currentFilter);
    });
  });

  loadTables();
  setInterval(loadTables, REFRESH_INTERVAL_MS);
  setInterval(updateLastUpdated, 1000);
} else {
  grid.textContent = "Application data could not be initialized.";
}
