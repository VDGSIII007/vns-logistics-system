const SPREADSHEET_ID = "1a1nwEPLb0RdG-ttwsOVSWhplVuQWImHcRdiRsE5etvc";
const DETAIL_SHEET_NAME = "2026_Expense_Details";
const SUMMARY_SHEET_NAME = "2026_Monthly_Summary";

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwfjBLe8rc9Uuwf6LzZr-J4vnTfr3np0Y92WSK4HT2syHxRaXTF6MRt9WpBjH7_WuFn/exec";

const ALIASES = {
  plate: ["Plate", "Truck", "Plate Number", "Plate_Number", "Truck Plate", "truck"],
  date: ["Date", "Trip_Date", "Trip Date", "Date_Trip", "Liquidation_Date", "Liquidation Date", "date"],
  month: ["Month", "Month Key", "Month_Key"],
  source: ["Source", "Origin", "From", "source"],
  destination: ["Destination", "To", "destination"],
  diesel: ["Diesel", "Fuel", "Fuel Cost", "diesel"],
  dieselLiters: [
    "Diesel Liters",
    "Diesel_Liters",
    "Fuel Liters",
    "Fuel_Liters",
    "Liters",
    "Liter",
    "No. of Liters",
    "No of Liters"
  ],
  dieselPricePerLiter: [
    "Diesel Price Per Liter",
    "Diesel_Price_Per_Liter",
    "Price Per Liter",
    "Price/Liter",
    "PHP/Liter",
    "Fuel Price"
  ],
  driver: ["Bayad Driver", "Driver Salary", "Driver_Salary"],
  helper: ["Bayad Helper", "Helper Salary", "Helper_Salary"],
  toll: ["Toll Fee", "Toll_Fee", "Toll", "NLEX", "SLEX", "toll_fee"],
  passway: ["Pass Way", "Passway", "Pass_Way"],
  parking: ["Parking"],
  lagayLoaded: ["Lagay Loaded", "Lagay_Loaded"],
  lagayEmpty: ["Lagay Empty", "Lagay_Empty"],
  luna: ["Luna"],
  mano: ["Mano"],
  vulcanize: ["Vulcanize"],
  allowanceDriver: ["Allowance Driver", "Allowance_Driver"],
  allowanceHelper: ["Allowance Helper", "Allowance_Helper"],
  hugasTruck: ["Hugas Truck", "Hugas_Truck"],
  checkpoint: ["Checkpoint"],
  other: ["Other Expenses", "Other_Expenses", "Others", "other_expenses"],
  total: ["Total Expense", "Total_Expense", "Total", "Grand Total", "total_expense"]
};

const EXPENSE_FIELDS = [
  { key: 'diesel', label: 'Diesel', aliases: ALIASES.diesel },
  { key: 'driver', label: 'Bayad Driver', aliases: ALIASES.driver },
  { key: 'helper', label: 'Bayad Helper', aliases: ALIASES.helper },
  { key: 'toll', label: 'Toll Fee', aliases: ALIASES.toll },
  { key: 'passway', label: 'Pass Way', aliases: ALIASES.passway },
  { key: 'parking', label: 'Parking', aliases: ALIASES.parking },
  { key: 'lagayLoaded', label: 'Lagay Loaded', aliases: ALIASES.lagayLoaded },
  { key: 'lagayEmpty', label: 'Lagay Empty', aliases: ALIASES.lagayEmpty },
  { key: 'luna', label: 'Luna', aliases: ALIASES.luna },
  { key: 'mano', label: 'Mano', aliases: ALIASES.mano },
  { key: 'vulcanize', label: 'Vulcanize', aliases: ALIASES.vulcanize },
  { key: 'allowanceDriver', label: 'Allowance Driver', aliases: ALIASES.allowanceDriver },
  { key: 'allowanceHelper', label: 'Allowance Helper', aliases: ALIASES.allowanceHelper },
  { key: 'hugasTruck', label: 'Hugas Truck', aliases: ALIASES.hugasTruck },
  { key: 'checkpoint', label: 'Checkpoint', aliases: ALIASES.checkpoint },
  { key: 'other', label: 'Other Expenses', aliases: ALIASES.other }
];

const DETAIL_FIELDS = [
  { key: 'diesel', label: 'Diesel', formatter: formatMoney },
  { key: 'dieselLiters', label: 'Diesel Liters', formatter: formatLiters },
  { key: 'dieselPricePerLiter', label: 'Diesel Price/Liter', formatter: formatPricePerLiter },
  { key: 'driver', label: 'Bayad Driver', formatter: formatMoney },
  { key: 'helper', label: 'Bayad Helper', formatter: formatMoney },
  { key: 'toll', label: 'Toll Fee', formatter: formatMoney },
  { key: 'passway', label: 'Pass Way', formatter: formatMoney },
  { key: 'parking', label: 'Parking', formatter: formatMoney },
  { key: 'lagayLoaded', label: 'Lagay Loaded', formatter: formatMoney },
  { key: 'lagayEmpty', label: 'Lagay Empty', formatter: formatMoney },
  { key: 'luna', label: 'Luna', formatter: formatMoney },
  { key: 'mano', label: 'Mano', formatter: formatMoney },
  { key: 'vulcanize', label: 'Vulcanize', formatter: formatMoney },
  { key: 'allowanceDriver', label: 'Allowance Driver', formatter: formatMoney },
  { key: 'allowanceHelper', label: 'Allowance Helper', formatter: formatMoney },
  { key: 'hugasTruck', label: 'Hugas Truck', formatter: formatMoney },
  { key: 'checkpoint', label: 'Checkpoint', formatter: formatMoney },
  { key: 'other', label: 'Other Expenses', formatter: formatMoney },
  { key: 'total', label: 'Total Expense', formatter: formatMoney }
];

const state = {
  records: [],
  filters: {
    plate: '',
    month: '',
    source: '',
    destination: '',
    search: ''
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
  source: document.getElementById('source-filter'),
  destination: document.getElementById('destination-filter'),
  search: document.getElementById('search-filter'),
  status: document.getElementById('expenses-status'),
  tableBody: document.getElementById('expenses-table-body'),
  totalTrips: document.getElementById('total-trips'),
  totalDiesel: document.getElementById('total-diesel'),
  totalDieselLiters: document.getElementById('total-diesel-liters'),
  avgDieselPrice: document.getElementById('avg-diesel-price'),
  totalDriver: document.getElementById('total-driver'),
  totalHelper: document.getElementById('total-helper'),
  totalToll: document.getElementById('total-toll'),
  totalOther: document.getElementById('total-other'),
  totalExpense: document.getElementById('total-expense'),
  totalPassway: document.getElementById('total-passway'),
  totalParking: document.getElementById('total-parking'),
  totalLagayLoaded: document.getElementById('total-lagay-loaded'),
  totalLagayEmpty: document.getElementById('total-lagay-empty'),
  totalLuna: document.getElementById('total-luna'),
  totalMano: document.getElementById('total-mano'),
  totalVulcanize: document.getElementById('total-vulcanize'),
  totalAllowanceDriver: document.getElementById('total-allowance-driver'),
  totalAllowanceHelper: document.getElementById('total-allowance-helper'),
  totalHugasTruck: document.getElementById('total-hugas-truck'),
  totalCheckpoint: document.getElementById('total-checkpoint'),
  breakdownOther: document.getElementById('breakdown-other')
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

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[\s_.\-/]+/g, '');
}

function getValue(row, fieldOrAliases) {
  const aliases = Array.isArray(fieldOrAliases) ? fieldOrAliases : [fieldOrAliases];

  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && row[alias] !== '') return row[alias];
  }

  const normalizedLookup = Object.keys(row).reduce((lookup, key) => {
    lookup[normalizeKey(key)] = key;
    return lookup;
  }, {});

  for (const alias of aliases) {
    const matchingKey = normalizedLookup[normalizeKey(alias)];
    if (matchingKey && row[matchingKey] !== undefined && row[matchingKey] !== null && row[matchingKey] !== '') {
      return row[matchingKey];
    }
  }

  return '';
}

function getNumber(row, fieldOrAliases) {
  return parseNumber(getValue(row, fieldOrAliases));
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function getTollAmount(row) {
  const directValue = getValue(row, ALIASES.toll.filter(alias => !['NLEX', 'SLEX'].includes(alias)));
  if (directValue !== '') return parseNumber(directValue);
  return getNumber(row, 'NLEX') + getNumber(row, 'SLEX');
}

function formatMoney(value) {
  return `PHP ${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;
}

function formatLiters(value) {
  if (!value || value <= 0) return '-';
  return `${Number(value).toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })} L`;
}

function formatPricePerLiter(value) {
  if (!value || value <= 0) return '-';
  return `PHP ${Number(value).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}/L`;
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
  if (!value) return '';

  const raw = String(value).trim();
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
  }

  return raw;
}

function normalizeMonth(value, dateValue) {
  const raw = String(value || '').trim();
  if (raw) {
    const numericMonth = raw.match(/^(?:2026[-/])?(\d{1,2})$/);
    if (numericMonth) {
      const monthIndex = Number(numericMonth[1]) - 1;
      return monthNames[monthIndex] || raw;
    }

    const parsedMonth = new Date(raw);
    if (!Number.isNaN(parsedMonth.getTime())) {
      return parsedMonth.toLocaleDateString('en-PH', { year: 'numeric', month: 'long' });
    }

    return raw;
  }

  const dateText = String(dateValue || '');
  const dateMonthMatch = dateText.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/i);
  const monthIndex = dateMonthMatch
    ? monthNames.findIndex(month => month.toLowerCase().startsWith(dateMonthMatch[1].slice(0, 3).toLowerCase()))
    : -1;
  if (monthIndex >= 0) return monthNames[monthIndex];

  const parsed = new Date(dateText);
  return Number.isNaN(parsed.getTime()) ? '' : monthNames[parsed.getMonth()];
}

function calculateExpenseTotal(expenses) {
  return EXPENSE_FIELDS.reduce((sum, field) => sum + expenses[field.key], 0);
}

function normalizeRecord(row, index) {
  const date = normalizeDate(getValue(row, ALIASES.date));
  const month = normalizeMonth(getValue(row, ALIASES.month), date);
  const expenses = EXPENSE_FIELDS.reduce((values, field) => {
    values[field.key] = field.key === 'toll' ? getTollAmount(row) : getNumber(row, field.aliases);
    return values;
  }, {});

  const dieselLiters = getNumber(row, ALIASES.dieselLiters);
  const explicitPricePerLiter = getNumber(row, ALIASES.dieselPricePerLiter);
  const dieselPricePerLiter = explicitPricePerLiter || (dieselLiters > 0 && expenses.diesel > 0 ? expenses.diesel / dieselLiters : 0);
  const explicitTotal = getNumber(row, ALIASES.total);
  const calculatedTotal = calculateExpenseTotal(expenses);
  const total = explicitTotal > 0 ? explicitTotal : calculatedTotal;

  const normalized = {
    id: `expense-${index}`,
    plate: String(getValue(row, ALIASES.plate)).trim(),
    date,
    month,
    source: String(getValue(row, ALIASES.source)).trim(),
    destination: String(getValue(row, ALIASES.destination)).trim(),
    dieselLiters,
    dieselPricePerLiter,
    total,
    raw: row,
    ...expenses
  };

  normalized.searchText = [
    normalized.plate,
    normalized.date,
    normalized.month,
    normalized.source,
    normalized.destination,
    ...Object.values(row).map(value => String(value ?? ''))
  ].join(' ').toLowerCase();

  return normalized;
}

function setStatus(message, isError = false) {
  if (!elements.status) return;
  elements.status.textContent = message;
  elements.status.style.color = isError ? 'var(--red)' : 'var(--muted)';
}

function uniqueValues(records, key) {
  return Array.from(new Set(records.map(record => record[key]).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
}

function populateSelect(select, values, defaultLabel) {
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = `<option value="">${defaultLabel}</option>`;
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  select.value = values.includes(currentValue) ? currentValue : '';
}

function populateFilters(records) {
  populateSelect(elements.plate, uniqueValues(records, 'plate'), 'All Plates');
  populateSelect(elements.month, uniqueValues(records, 'month'), 'All Months');
  populateSelect(elements.source, uniqueValues(records, 'source'), 'All Sources');
  populateSelect(elements.destination, uniqueValues(records, 'destination'), 'All Destinations');
}

function getFilteredRecords() {
  const search = state.filters.search.trim().toLowerCase();

  return state.records.filter(record => {
    return (!state.filters.plate || record.plate === state.filters.plate)
      && (!state.filters.month || record.month === state.filters.month)
      && (!state.filters.source || record.source === state.filters.source)
      && (!state.filters.destination || record.destination === state.filters.destination)
      && (!search || record.searchText.includes(search));
  });
}

function sumRecords(records, key) {
  return records.reduce((sum, record) => sum + (Number(record[key]) || 0), 0);
}

function setText(element, text) {
  if (element) element.textContent = text;
}

function renderSummary(records) {
  const totals = {
    diesel: sumRecords(records, 'diesel'),
    dieselLiters: sumRecords(records, 'dieselLiters'),
    driver: sumRecords(records, 'driver'),
    helper: sumRecords(records, 'helper'),
    toll: sumRecords(records, 'toll'),
    passway: sumRecords(records, 'passway'),
    parking: sumRecords(records, 'parking'),
    lagayLoaded: sumRecords(records, 'lagayLoaded'),
    lagayEmpty: sumRecords(records, 'lagayEmpty'),
    luna: sumRecords(records, 'luna'),
    mano: sumRecords(records, 'mano'),
    vulcanize: sumRecords(records, 'vulcanize'),
    allowanceDriver: sumRecords(records, 'allowanceDriver'),
    allowanceHelper: sumRecords(records, 'allowanceHelper'),
    hugasTruck: sumRecords(records, 'hugasTruck'),
    checkpoint: sumRecords(records, 'checkpoint'),
    other: sumRecords(records, 'other'),
    total: sumRecords(records, 'total')
  };

  setText(elements.totalTrips, String(records.length));
  setText(elements.totalDiesel, formatMoney(totals.diesel));
  setText(elements.totalDieselLiters, formatLiters(totals.dieselLiters));
  setText(elements.avgDieselPrice, totals.dieselLiters > 0 ? formatPricePerLiter(totals.diesel / totals.dieselLiters) : '-');
  setText(elements.totalDriver, formatMoney(totals.driver));
  setText(elements.totalHelper, formatMoney(totals.helper));
  setText(elements.totalToll, formatMoney(totals.toll));
  setText(elements.totalOther, formatMoney(totals.other));
  setText(elements.totalExpense, formatMoney(totals.total));
  setText(elements.totalPassway, formatMoney(totals.passway));
  setText(elements.totalParking, formatMoney(totals.parking));
  setText(elements.totalLagayLoaded, formatMoney(totals.lagayLoaded));
  setText(elements.totalLagayEmpty, formatMoney(totals.lagayEmpty));
  setText(elements.totalLuna, formatMoney(totals.luna));
  setText(elements.totalMano, formatMoney(totals.mano));
  setText(elements.totalVulcanize, formatMoney(totals.vulcanize));
  setText(elements.totalAllowanceDriver, formatMoney(totals.allowanceDriver));
  setText(elements.totalAllowanceHelper, formatMoney(totals.allowanceHelper));
  setText(elements.totalHugasTruck, formatMoney(totals.hugasTruck));
  setText(elements.totalCheckpoint, formatMoney(totals.checkpoint));
  setText(elements.breakdownOther, formatMoney(totals.other));
}

function buildDetails(record) {
  return DETAIL_FIELDS.map(field => `
    <div>
      <span>${escapeHtml(field.label)}</span>
      <strong>${escapeHtml(field.formatter(record[field.key]))}</strong>
    </div>
  `).join('');
}

function renderTable(records) {
  if (!elements.tableBody) return;
  if (!records.length) {
    elements.tableBody.innerHTML = '<tr><td colspan="16" class="empty">No 2026 expense records match the current filters.</td></tr>';
    return;
  }

  elements.tableBody.innerHTML = records.map(record => `
    <tr>
      <td>${escapeHtml(record.plate)}</td>
      <td>${escapeHtml(record.date)}</td>
      <td>${escapeHtml(record.month)}</td>
      <td>${escapeHtml(record.source)}</td>
      <td>${escapeHtml(record.destination)}</td>
      <td>${formatMoney(record.diesel)}</td>
      <td>${formatLiters(record.dieselLiters)}</td>
      <td>${formatPricePerLiter(record.dieselPricePerLiter)}</td>
      <td>${formatMoney(record.driver)}</td>
      <td>${formatMoney(record.helper)}</td>
      <td>${formatMoney(record.toll)}</td>
      <td>${formatMoney(record.passway)}</td>
      <td>${formatMoney(record.parking)}</td>
      <td>${formatMoney(record.other)}</td>
      <td>${formatMoney(record.total)}</td>
      <td><button class="details-button" type="button" data-detail-id="${escapeHtml(record.id)}">View Details</button></td>
    </tr>
    <tr class="expense-details-row" id="${escapeHtml(record.id)}" hidden>
      <td colspan="16">
        <div class="expense-details">${buildDetails(record)}</div>
      </td>
    </tr>
  `).join('');
}

function render() {
  const filteredRecords = getFilteredRecords();
  renderSummary(filteredRecords);
  renderTable(filteredRecords);
  setStatus(`${filteredRecords.length} of ${state.records.length} records shown from ${DETAIL_SHEET_NAME}.`);
}

function setupFilters() {
  Object.entries({
    plate: elements.plate,
    month: elements.month,
    source: elements.source,
    destination: elements.destination,
    search: elements.search
  }).forEach(([key, field]) => {
    if (!field) return;
    field.addEventListener(key === 'search' ? 'input' : 'change', () => {
      state.filters[key] = field.value;
      render();
    });
  });
}

function setupDetailsToggle() {
  if (!elements.tableBody) return;
  elements.tableBody.addEventListener('click', event => {
    const button = event.target.closest('.details-button');
    if (!button) return;

    const detailsRow = document.getElementById(button.dataset.detailId);
    if (!detailsRow) return;

    const isHidden = detailsRow.hasAttribute('hidden');
    detailsRow.toggleAttribute('hidden', !isHidden);
    button.textContent = isHidden ? 'Hide Details' : 'View Details';
  });
}

async function loadExpenses() {
  try {
    setStatus(`Loading 2026 expense data from ${DETAIL_SHEET_NAME}...`);
    const response = await fetch(WEB_APP_URL);
    if (!response.ok) throw new Error(`Request failed with ${response.status}`);

    const result = await response.json();
    if (!result || result.success === false) {
      setStatus(result && result.message ? result.message : 'Could not load 2026 expense data. Please check the Apps Script URL or sheet permissions.', true);
      return;
    }

    state.records = Array.isArray(result.data) ? result.data.map(normalizeRecord) : [];
    populateFilters(state.records);
    render();
  } catch (error) {
    state.records = [];
    populateFilters(state.records);
    renderSummary(state.records);
    renderTable(state.records);
    setStatus('Could not load 2026 expense data. Please check the Apps Script URL or sheet permissions.', true);
  }
}

setupNavigation();
setupFilters();
setupDetailsToggle();
loadExpenses();
