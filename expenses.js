const WEB_APP_URL = "PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";

const state = {
  records: [],
  filters: {
    plate: '',
    month: '',
    year: '',
    source: '',
    destination: ''
  }
};

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const elements = {
  plate: document.getElementById('plate-filter'),
  month: document.getElementById('month-filter'),
  year: document.getElementById('year-filter'),
  source: document.getElementById('source-filter'),
  destination: document.getElementById('destination-filter'),
  status: document.getElementById('expenses-status'),
  tableBody: document.getElementById('expenses-table-body'),
  totalTrips: document.getElementById('total-trips'),
  totalDiesel: document.getElementById('total-diesel'),
  totalToll: document.getElementById('total-toll'),
  totalOther: document.getElementById('total-other'),
  totalExpense: document.getElementById('total-expense')
};

function setupNavigation() {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav-links');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

function getField(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key];
  }
  return '';
}

function parseAmount(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function formatCurrency(value) {
  return `₱${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function normalizeDate(value) {
  if (!value) return { display: '', month: '', year: '' };

  const raw = String(value).trim();
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      display: parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' }),
      month: String(parsed.getMonth() + 1),
      year: String(parsed.getFullYear())
    };
  }

  const monthMatch = raw.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/i);
  const yearMatch = raw.match(/\b(20\d{2}|19\d{2})\b/);
  const monthIndex = monthMatch
    ? monthNames.findIndex(month => month.toLowerCase().startsWith(monthMatch[1].slice(0, 3).toLowerCase()))
    : -1;

  return {
    display: raw,
    month: monthIndex >= 0 ? String(monthIndex + 1) : '',
    year: yearMatch ? yearMatch[1] : ''
  };
}

function normalizeRecord(record) {
  const date = normalizeDate(getField(record, ['Trip_Date', 'Trip Date', 'trip_date', 'date', 'Date']));
  const diesel = parseAmount(getField(record, ['Diesel', 'diesel']));
  const toll = parseAmount(getField(record, ['Toll_Fee', 'Toll Fee', 'toll_fee', 'Toll']));
  const other = parseAmount(getField(record, ['Other_Expenses', 'Other Expenses', 'other_expenses', 'Other']));
  const explicitTotal = getField(record, ['Total_Expense', 'Total Expense', 'total_expense', 'Total']);

  return {
    truck: String(getField(record, ['Truck', 'Plate_Number', 'Plate Number', 'Plate', 'truck'])).trim(),
    tripDate: date.display,
    month: date.month,
    year: date.year,
    source: String(getField(record, ['Source', 'source'])).trim(),
    destination: String(getField(record, ['Destination', 'destination'])).trim(),
    diesel,
    toll,
    other,
    total: explicitTotal === '' ? diesel + toll + other : parseAmount(explicitTotal)
  };
}

function extractRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.expenses)) return payload.expenses;
  return [];
}

function setStatus(message) {
  if (elements.status) elements.status.textContent = message;
}

function uniqueValues(records, key) {
  return Array.from(new Set(records.map(record => record[key]).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
}

function populateSelect(select, values, defaultLabel, formatter = value => value) {
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = `<option value="">${defaultLabel}</option>`;
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = formatter(value);
    select.appendChild(option);
  });
  select.value = values.includes(currentValue) ? currentValue : '';
}

function populateFilters(records) {
  populateSelect(elements.plate, uniqueValues(records, 'truck'), 'All Plates');
  populateSelect(elements.month, uniqueValues(records, 'month').sort((a, b) => Number(a) - Number(b)), 'All Months', value => monthNames[Number(value) - 1]);
  populateSelect(elements.year, uniqueValues(records, 'year').sort((a, b) => Number(b) - Number(a)), 'All Years');
  populateSelect(elements.source, uniqueValues(records, 'source'), 'All Sources');
  populateSelect(elements.destination, uniqueValues(records, 'destination'), 'All Destinations');
}

function getFilteredRecords() {
  return state.records.filter(record => {
    return (!state.filters.plate || record.truck === state.filters.plate)
      && (!state.filters.month || record.month === state.filters.month)
      && (!state.filters.year || record.year === state.filters.year)
      && (!state.filters.source || record.source === state.filters.source)
      && (!state.filters.destination || record.destination === state.filters.destination);
  });
}

function renderSummary(records) {
  const totals = records.reduce((sum, record) => {
    sum.diesel += record.diesel;
    sum.toll += record.toll;
    sum.other += record.other;
    sum.expense += record.total;
    return sum;
  }, { diesel: 0, toll: 0, other: 0, expense: 0 });

  elements.totalTrips.textContent = String(records.length);
  elements.totalDiesel.textContent = formatCurrency(totals.diesel);
  elements.totalToll.textContent = formatCurrency(totals.toll);
  elements.totalOther.textContent = formatCurrency(totals.other);
  elements.totalExpense.textContent = formatCurrency(totals.expense);
}

function renderTable(records) {
  if (!elements.tableBody) return;
  if (!records.length) {
    elements.tableBody.innerHTML = '<tr><td colspan="8" class="empty">No expense records match the current filters.</td></tr>';
    return;
  }

  elements.tableBody.innerHTML = records.map(record => `
    <tr>
      <td>${escapeHtml(record.truck)}</td>
      <td>${escapeHtml(record.tripDate)}</td>
      <td>${escapeHtml(record.source)}</td>
      <td>${escapeHtml(record.destination)}</td>
      <td>${formatCurrency(record.diesel)}</td>
      <td>${formatCurrency(record.toll)}</td>
      <td>${formatCurrency(record.other)}</td>
      <td>${formatCurrency(record.total)}</td>
    </tr>
  `).join('');
}

function render() {
  const filteredRecords = getFilteredRecords();
  renderSummary(filteredRecords);
  renderTable(filteredRecords);
  setStatus(`${filteredRecords.length} of ${state.records.length} expense records shown.`);
}

function setupFilters() {
  Object.entries({
    plate: elements.plate,
    month: elements.month,
    year: elements.year,
    source: elements.source,
    destination: elements.destination
  }).forEach(([key, select]) => {
    if (!select) return;
    select.addEventListener('change', () => {
      state.filters[key] = select.value;
      render();
    });
  });
}

async function loadExpenses() {
  if (WEB_APP_URL === "PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE") {
    state.records = [];
    populateFilters(state.records);
    render();
    setStatus('Add your Google Apps Script Web App URL in expenses.js to load live expenses.');
    return;
  }

  try {
    setStatus('Loading expenses...');
    const response = await fetch(WEB_APP_URL);
    if (!response.ok) throw new Error(`Request failed with ${response.status}`);

    const payload = await response.json();
    state.records = extractRecords(payload).map(normalizeRecord);
    populateFilters(state.records);
    render();
  } catch (error) {
    state.records = [];
    populateFilters(state.records);
    renderSummary(state.records);
    renderTable(state.records);
    setStatus('Unable to load expenses. Check the Apps Script URL and web app access.');
  }
}

setupNavigation();
setupFilters();
loadExpenses();
