/* enabling javascript's stricter error-checking behavior to catch mistakes that might otherwise 
unnoticed
*/
'use strict';

const demo = window.SMART_CANTEEN_DEMO;
const statusLabels = { available: 'Available', occupied: 'Occupied', unknown: 'Unknown' };
const filters = document.querySelectorAll('[data-filter]');
const grid = document.getElementById('table-grid');

// helper function that creates a table card
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

function makeTableCard(table) {
  const article = element('article', `table-card status-${table.status}`);
  article.setAttribute('aria-label', `${table.label}: ${statusLabels[table.status]}`);
  const top = element('div', 'table-card-top');
  const icon = addText(top, 'span', 'table-icon', '▤');
  icon.setAttribute('aria-hidden', 'true');
  addText(top, 'span', `status-pill ${table.status}`, statusLabels[table.status]);
  article.appendChild(top);

  addText(article, 'h3', 'table-name', table.label);
  addText(article, 'p', 'table-area', table.area);
  const bottom = element('div', 'table-card-bottom');
  addText(bottom, 'span', '', `${table.seats} seats · capacity only`);
  addText(bottom, 'span', 'table-reference', table.id);
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
  document.getElementById('total-tables').textContent = `${demo.tables.length} tables`;
  const track = document.getElementById('distribution-track');
  track.replaceChildren();
  const total = Math.max(demo.tables.length, 1);
  for (const status of ['available', 'occupied', 'unknown']) {
    const segment = element('div', `track-segment ${status}`);
    segment.style.width = `${counts[status] * 100 / total}%`;
    segment.title = `${statusLabels[status]}: ${counts[status]}`;
    track.appendChild(segment);
  }
  track.setAttribute('aria-label', `Sample data: ${counts.available} available, ${counts.occupied} occupied, ${counts.unknown} unknown`);
}

function render(filter = 'all') {
  const visible = filter === 'all' ? demo.tables : demo.tables.filter(t => t.status === filter);
  grid.replaceChildren();
  for (const table of visible) grid.appendChild(makeTableCard(table));
  if (!visible.length) addText(grid, 'p', 'empty-state', 'No sample tables match this filter.');
  document.getElementById('table-count-label').textContent = `Showing ${visible.length} of ${demo.tables.length}`;
  filters.forEach(btn => {
    const selected = btn.dataset.filter === filter;
    btn.classList.toggle('active', selected);
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

if (demo && Array.isArray(demo.tables)) {
  document.getElementById('venue-name').textContent = demo.venue.name;
  document.getElementById('venue-description').textContent = demo.venue.description;
  document.getElementById('venue-type').textContent = demo.venue.type;
  updateOverview();
  render();
  filters.forEach(btn => btn.addEventListener('click', () => render(btn.dataset.filter)));
} else {
  grid.textContent = 'Demo data could not be loaded.';
}
