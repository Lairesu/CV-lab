
'use strict';

// Get the existing application object and HTML elements.
const demo = window.SMART_CANTEEN_DEMO;

const statusLabels = {
  available: 'Available',
  occupied: 'Occupied',
  unknown: 'Unknown'
};

const filters = document.querySelectorAll('[data-filter]');
const grid = document.getElementById('table-grid');

// Request fresh table data every five seconds.
const REFRESH_INTERVAL_MS = 5000;

// Remember which filter the student has selected.
let currentFilter = 'all';

// Prevent multiple requests from overlapping.
let requestInProgress = false;

// Track whether at least one API request has succeeded.
let hasLoadedData = false;

// Create a message showing whether the data is up to date.
const syncStatus = document.createElement('p');
syncStatus.className = 'data-sync-status';
syncStatus.setAttribute('role', 'status');


// Create an HTML element with optional class and text.
function element(tag, className, content) {
  const el = document.createElement(tag);

  if (className) {
    el.className = className;
  }

  if (content !== undefined) {
    el.textContent = content;
  }

  return el;
}


// Create a text element and add it to a parent element.
function addText(parent, tag, className, value) {
  const child = element(tag, className, value);

  parent.appendChild(child);

  return child;
}


// Build one table card from a database table record.
function makeTableCard(table) {
  const article = element(
    'article',
    `table-card status-${table.status}`
  );

  article.setAttribute(
    'aria-label',
    `${table.label}: ${statusLabels[table.status]}`
  );

  const top = element('div', 'table-card-top');

  const icon = addText(top, 'span', 'table-icon', '▤');
  icon.setAttribute('aria-hidden', 'true');

  addText(
    top,
    'span',
    `status-pill ${table.status}`,
    statusLabels[table.status]
  );

  article.appendChild(top);

  addText(article, 'h3', 'table-name', table.label);
  addText(article, 'p', 'table-area', table.area);

  const bottom = element('div', 'table-card-bottom');

  addText(
    bottom,
    'span',
    '',
    `${table.seats} seats · capacity only`
  );

  addText(bottom, 'span', 'table-reference', table.id);

  article.appendChild(bottom);

  return article;
}


// Recalculate table counts and the availability distribution.
function updateOverview() {
  const counts = {
    available: 0,
    occupied: 0,
    unknown: 0
  };

  for (const table of demo.tables) {
    if (counts[table.status] !== undefined) {
      counts[table.status] += 1;
    }
  }

  for (const status of Object.keys(counts)) {
    document.getElementById(`${status}-count`).textContent =
      String(counts[status]);
  }

  document.getElementById('total-tables').textContent =
    `${demo.tables.length} tables`;

  const track = document.getElementById('distribution-track');

  track.replaceChildren();

  const total = Math.max(demo.tables.length, 1);

  for (const status of ['available', 'occupied', 'unknown']) {
    const segment = element(
      'div',
      `track-segment ${status}`
    );

    segment.style.width =
      `${counts[status] * 100 / total}%`;

    segment.title =
      `${statusLabels[status]}: ${counts[status]}`;

    track.appendChild(segment);
  }

  track.setAttribute(
    'aria-label',
    `Manual demo data: ${counts.available} available, ` +
    `${counts.occupied} occupied, ${counts.unknown} unknown`
  );
}


// Render the table cards using the currently selected filter.
function render(filter = currentFilter) {
  const visible = filter === 'all'
    ? demo.tables
    : demo.tables.filter(table => table.status === filter);

  // Remove the previous cards before creating new ones.
  grid.replaceChildren();

  for (const table of visible) {
    grid.appendChild(makeTableCard(table));
  }

  if (visible.length === 0) {
    addText(
      grid,
      'p',
      'empty-state',
      'No tables match this filter.'
    );
  }

  document.getElementById('table-count-label').textContent =
    `Showing ${visible.length} of ${demo.tables.length}`;

  // Keep the correct filter button visually selected.
  filters.forEach(button => {
    const selected = button.dataset.filter === filter;

    button.classList.toggle('active', selected);
    button.setAttribute(
      'aria-pressed',
      selected ? 'true' : 'false'
    );
  });
}


// Retrieve the latest table records from FastAPI.
function loadTables() {

  // Skip this refresh if the previous request is still running.
  if (requestInProgress) {
    return;
  }

  requestInProgress = true;

  fetch('/api/db/tables', {
    cache: 'no-store'
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`API returned HTTP ${response.status}`);
      }

      return response.json();
    })

    .then(data => {
      // Check that the API provided an array of tables.
      if (!Array.isArray(data.tables)) {
        throw new Error('Invalid table data');
      }

      // Replace the previous table data.
      demo.tables = data.tables;

      hasLoadedData = true;

      // Recalculate counts and redraw the active filter.
      updateOverview();
      render(currentFilter);

      syncStatus.textContent =
        'Manually updated demo data · ' +
        'Refreshes every 5 seconds · ' +
        'Not camera-detected occupancy';
    })

    .catch(error => {
      console.error('Could not refresh tables:', error);

      if (hasLoadedData) {
        // Keep the last successful records, but warn the user.
        syncStatus.textContent =
          'Connection problem: displayed table statuses ' +
          'may be outdated. Retrying...';
      } else {
        // No verified database records have loaded yet.
        document.getElementById('total-tables').textContent =
          'Data unavailable';

        grid.textContent =
          'Table information is unavailable. Retrying...';

        syncStatus.textContent =
          'Could not connect to the table database.';
      }
    })

    .finally(() => {
      // Permit the next scheduled refresh.
      requestInProgress = false;
    });
}


// Initialize the student dashboard after the page loads.
if (demo && Array.isArray(demo.tables)) {

  // Match the database's demo-cafe venue instead of
  // showing the old North Campus Canteen sample heading.
  document.getElementById('venue-name').textContent =
    'Demo Café';

  document.getElementById('venue-description').textContent =
    'Reference café · Manually updated demonstration';

  document.getElementById('venue-type').textContent =
    'Café';

  // Insert the data freshness message above the cards.
  grid.before(syncStatus);

  // Clear the old Session 02 sample records.
  demo.tables = [];

  updateOverview();

  grid.textContent = 'Loading table information...';
  syncStatus.textContent = 'Connecting to the demo database...';

  // Remember filter selections instead of resetting to All.
  filters.forEach(button => {
    button.addEventListener('click', () => {
      currentFilter = button.dataset.filter;

      if (hasLoadedData) {
        render(currentFilter);
      }
    });
  });

  // Load tables immediately.
  loadTables();

  // Continue checking for updates every five seconds.
  setInterval(loadTables, REFRESH_INTERVAL_MS);

} else {
  grid.textContent = 'Application data could not be initialized.';
}
