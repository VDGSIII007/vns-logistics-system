const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav-links');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }));
}

initRepairTabs();

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

const repairInput = document.getElementById('repair-input');
const requestTypeSelect = document.getElementById('request-type-select');
const parseButton = document.getElementById('parse-button');
const exampleButton = document.getElementById('example-button');
const selectAllRowsButton = document.getElementById('select-all-rows-button');
const unselectAllRowsButton = document.getElementById('unselect-all-rows-button');
const removeUncheckedRowsButton = document.getElementById('remove-unchecked-rows-button');
const tableBody = document.getElementById('repair-table-body');
const generateButton = document.getElementById('generate-button');
const financeOutput = document.getElementById('finance-output');
const saveButton = document.getElementById('save-button');
const saveStatus = document.getElementById('save-status');
const tabButtons = document.querySelectorAll('.module-tab');
const tabPanels = document.querySelectorAll('.tab-panel');
const manualEntryForm = document.getElementById('manual-entry-form');
const manualRequestTypeSelect = document.getElementById('manual-request-type');
const manualRequestCards = document.querySelectorAll('.manual-request-card');
const manualSaveStatus = document.getElementById('manual-save-status');
const saveStatusChangesButton = document.getElementById('save-status-changes-button');
const refreshRecordsButton = document.getElementById('refresh-records-button');
const savedRecordsSelectAll = document.getElementById('savedRecordsSelectAll');
const selectAllSavedRecordsBtn = document.getElementById('selectAllSavedRecordsBtn');
const unselectAllSavedRecordsBtn = document.getElementById('unselectAllSavedRecordsBtn');
const generateViberFollowupBtn = document.getElementById('generateViberFollowupBtn');
const viberFollowupPanel = document.getElementById('viberFollowupPanel');
const viberFollowupOutput = document.getElementById('viberFollowupOutput');
const copyViberFollowupBtn = document.getElementById('copyViberFollowupBtn');
const editViberFollowupBtn = document.getElementById('editViberFollowupBtn');
const clearViberFollowupBtn = document.getElementById('clearViberFollowupBtn');
const closeViberFollowupBtn = document.getElementById('closeViberFollowupBtn');
const closeViberFollowupBottomBtn = document.getElementById('closeViberFollowupBottomBtn');
const copyViberFollowupStatus = document.getElementById('copyViberFollowupStatus');
const recordsPlateGroupFilter = document.getElementById('records-plate-group-filter');
const recordsPlateFilter = document.getElementById('records-plate-filter');
const recordsTypeFilter = document.getElementById('records-type-filter');
const recordsRepairStatusFilter = document.getElementById('records-repair-status-filter');
const recordsPaymentStatusFilter = document.getElementById('records-payment-status-filter');
const recordsApprovalStatusFilter = document.getElementById('records-approval-status-filter');
const recordsDateTypeFilter = document.getElementById('records-date-type-filter');
const recordsDateFromFilter = document.getElementById('records-date-from-filter');
const recordsDateToFilter = document.getElementById('records-date-to-filter');
const recordsClearFiltersButton = document.getElementById('records-clear-filters-button');
const recordsQuickFilterButtons = document.querySelectorAll('[data-records-quick-filter]');
const recordsStatus = document.getElementById('records-status');
const recordsCount = document.getElementById('records-count');
const recordsTotalCost = document.getElementById('records-total-cost');
const savedRecordsBody = document.getElementById('saved-records-body');
const recordDetailsPanel = document.getElementById('record-details-panel');
const recordDetailsContent = document.getElementById('record-details-content');
const closeRecordDetails = document.getElementById('close-record-details');
const paymentUpdatePanel = document.getElementById('payment-update-panel');
const paymentUpdateForm = document.getElementById('payment-update-form');
const closePaymentUpdate = document.getElementById('close-payment-update');
const cancelPaymentUpdateButton = document.getElementById('cancel-payment-update-button');
const paymentRecordIndex = document.getElementById('payment-record-index');
const paymentPlateNumber = document.getElementById('payment-plate-number');
const paymentItemWork = document.getElementById('payment-item-work');
const paymentOriginalTotal = document.getElementById('payment-original-total');
const paymentFinalCost = document.getElementById('payment-final-cost');
const paymentStatusField = document.getElementById('payment-status-field');
const paymentDateField = document.getElementById('payment-date-field');
const paymentReferenceField = document.getElementById('payment-reference-field');
const paymentNotesField = document.getElementById('payment-notes-field');
const paymentUpdateStatus = document.getElementById('payment-update-status');
const refreshGarageTrucksButton = document.getElementById('refresh-garage-trucks-button');
const garageTimeFilter = document.getElementById('garage-time-filter');
const garageTruckSearch = document.getElementById('garageTruckSearch');
const garageTruckSearchBtn = document.getElementById('garageTruckSearchBtn');
const garageTruckClearBtn = document.getElementById('garageTruckClearBtn');
const garageTrucksStatus = document.getElementById('garage-trucks-status');
const majadaGarageBody = document.getElementById('majada-garage-body');
const valenzuelaGarageBody = document.getElementById('valenzuela-garage-body');
const majadaGarageCount = document.getElementById('majada-garage-count');
const valenzuelaGarageCount = document.getElementById('valenzuela-garage-count');
const majadaGarageCardCount = document.getElementById('majada-garage-card-count');
const valenzuelaGarageCardCount = document.getElementById('valenzuela-garage-card-count');
const garageTotalShown = document.getElementById('garage-total-shown');
const garageHiddenOldCount = document.getElementById('garage-hidden-old-count');
const addForRepairButton = document.getElementById('add-for-repair-button');
const cancelForRepairButton = document.getElementById('cancel-for-repair-button');
const forRepairLocalForm = document.getElementById('for-repair-local-form');
const forRepairLocalStatus = document.getElementById('for-repair-local-status');
const forRepairLocalBody = document.getElementById('for-repair-local-body');

let savedRepairRecords = [];
let hiddenMisalignedRecordCount = 0;
let garageTruckRecords = [];
let garageTruckSearchQuery = '';
let localForRepairTrucks = [];
let savedRecordsQuickFilter = '';
let savedParsedRequestSignature = '';
let savedParsedRowKeys = new Set();
const REPAIR_CHANGE_REQUESTS_KEY = 'vnsRepairChangeRequests';
const REPAIR_PAYMENT_UPDATES_KEY = 'vnsRepairPaymentUpdates';
const REPAIR_DELETED_IDS_KEY = 'vnsRepairDeletedIds';
const FOR_REPAIR_TRUCKS_KEY = 'vnsForRepairTrucks';
const TRUCK_MASTER_KEY = 'vnsTruckMaster';
const LEGACY_TRUCK_MASTER_KEY = 'vnsTruckMasterfile';
const REPAIR_PLATE_GROUPS = [
  { value: '', label: 'All Groups' },
  { value: 'Bottle', label: 'Bottle' },
  { value: 'Sugar', label: 'Sugar' },
  { value: 'Preform / Resin', label: 'Preform / Resin' },
  { value: 'Caps / Crown', label: 'Caps / Crown' },
  { value: 'Unknown / Needs Update', label: 'Needs Update / Unknown' }
];

function createRepairLocalId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function initRepairTabs() {
  const buttons = document.querySelectorAll('.repair-tab-button');
  if (!buttons.length) return;
  buttons.forEach(button => {
    button.addEventListener('click', () => switchRepairTab(button.dataset.repairTab));
  });
  switchRepairTab(document.querySelector('.repair-tab-button.active')?.dataset.repairTab || 'repair-truck-tab');
}

function switchRepairTab(tabId) {
  document.querySelectorAll('.repair-tab-button').forEach(button => {
    const active = button.dataset.repairTab === tabId;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.repair-tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === tabId);
  });
}

const REPAIR_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzSxpVjoHxkXo95FIJL6MBWFsHQBaRbWU-AabblQ1e15jSJpYZTmA4rc41g3uTH2j_x5w/exec";
const VIBER_EXAMPLES = {
  'Auto Detect': `PARTS REQUEST
Date: 5/7/2026
Plate: CAA 5021
Truck: Foton Flatbed
Driver: Cogonon
Parts Needed:
1 set Trailer Hose
Total: 1,500
Remarks: For repair approval`,
  'Parts Request': `PARTS REQUEST
Date: 5/7/2026
Plate: CAA 5021
Truck: Foton Flatbed
Driver: Cogonon
Parts Needed:
1 set Trailer Hose
Total: 1,500
Remarks: For repair approval`,
  'Safety Equipment Request': `EQUIPMENT REQUEST
Date: 5/7/2026
Equipment Item: Hard Hat
Quantity: 6 pcs
Unit Price: 250
Units Affected:
CAC 4355 - Driver Larry Garibay
CAB 9837 - Driver Jebron Aspera
Total: 1,500
Remarks: Safety equipment request`,
  'Labor Payment Request': `LABOR PAYMENT REQUEST
Date: 5/7/2026
Plate: NUB 9941
Truck: Foton
Driver: Ramil LabasBas
PAYEE: Ramel LabasLas Atm
ITEMS:
kabit lona
welding bracket
Total: 4,600
Remarks: Labor`,
  'Completed Repair': `COMPLETED REPAIR
Date Finished: 5/7/2026
Plate: CAA 5021
Driver: Cogonon
Work Done:
Replaced trailer hose
Parts Used:
1 set Trailer Hose
Labor Cost: 500
Total Cost: 2,000
Mechanic: Bong
Remarks: Unit released`,
  'Repair Monitoring Update': `REPAIR MONITORING UPDATE
Date: 5/7/2026
Plate: CAA 5021
Driver: Cogonon
Update:
Unit is still under repair. Waiting for parts delivery.
Mechanic: Bong
Remarks: Follow up tomorrow`
};

function formatCurrency(value) {
  if (value === '' || value === null || Number.isNaN(Number(value))) return '';
  const number = Number(value);
  return number.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function extractRequestedBy(lines) {
  for (const line of lines) {
    const normalized = line.replace(/[\u2066-\u2069]/g, '').trim();
    const senderMatch = normalized.match(/\] *([^:]+?):/);
    if (senderMatch) {
      const sender = senderMatch[1].replace(/[\u2066-\u2069]/g, '').trim();
      if (!/(driver|helper|total|work done|repair done|done|remarks|mechanic|technician|labor|labor cost|photo|picture|image|pic|receipt|resibo)/i.test(sender)) return sender;
    }
    const colonMatch = normalized.match(/^([^:]+?):\s*/);
    if (colonMatch) {
      const label = colonMatch[1].trim();
      if (!/(driver|helper|total|work done|repair done|done|remarks|mechanic|technician|labor|labor cost|photo|picture|image|pic|receipt|resibo|\[)/i.test(label)) return label;
    }
  }
  return '';
}

function stripViberPrefix(line) {
  const normalized = line.replace(/[\u2066-\u2069]/g, '').trim();
  const prefixMatch = normalized.match(/^\[[^\]]+\]\s*[^:]+:\s*(.*)$/);
  return prefixMatch ? prefixMatch[1].trim() : normalized;
}

function normalizePlate(plateText) {
  const plateMatch = String(plateText || '').toUpperCase().match(/\b([A-Z]{2,4})\s?(\d{3,4})\b/);
  return plateMatch ? `${plateMatch[1]}${plateMatch[2]}` : '';
}

function parsePrice(value) {
  if (!value) return '';
  return parseFloat(value.replace(/,/g, ''));
}

function detectRequestType(text) {
  if (/\b(safety equipment|hard hat|helmet|vest|ppe|reflectorized)\b/i.test(text)) {
    return 'Safety Equipment Request';
  }
  if (/\bremarks?\s*[:;-]\s*labor\b|\b(kabit|welding|vulcanize|pintura|palit\s+studbolt|kabit\s+lona)\b/i.test(text)) {
    return 'Labor Payment Request';
  }
  if (/\b(repair monitoring|monitoring update|repair update|status update|update repair)\b/i.test(text)) {
    return 'Repair Monitoring Update';
  }
  if (/\b(finished repair|done repair|tapos|natapos|completed|unit released|released)\b/i.test(text)) {
    return 'Completed Repair';
  }
  return 'Parts Request';
}

function extractLineValue(text, labels) {
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:${labels.join('|')})\\s*[:;-]\\s*(.+)`, 'i');
  const match = text.match(pattern);
  return match ? match[1].trim() : '';
}

function extractMoneyFromText(text, labels) {
  const value = extractLineValue(text, labels);
  const match = value.match(/\d[\d,]*(?:\.\d+)?/);
  return match ? parsePrice(match[0]) : '';
}

function extractLink(text, labels) {
  const labelPattern = labels.join('|');
  const labeled = text.match(new RegExp(`(?:${labelPattern})\\s*[:;-]?\\s*(https?:\\/\\/\\S+)`, 'i'));
  if (labeled) return labeled[1].trim();
  const links = text.match(/https?:\/\/\S+/gi) || [];
  return links[0] || '';
}

function getDefaultStatuses(requestType) {
  if (requestType === 'Completed Repair') {
    return { status: 'Completed', repairStatus: 'Completed', paymentStatus: 'N/A' };
  }
  if (requestType === 'Repair Monitoring Update') {
    return { status: 'For Review', repairStatus: 'In progress', paymentStatus: 'N/A' };
  }
  return { status: 'Draft', repairStatus: 'Pending', paymentStatus: 'Unpaid' };
}

function getCategoryForRequest(requestType, item = '') {
  if (requestType === 'Labor Payment Request') return 'Labor';
  if (requestType === 'Safety Equipment Request' || /hard hat|helmet|vest|ppe|reflectorized/i.test(item)) return 'Safety Equipment';
  return 'Repair Parts';
}

function cleanMoney(value) {
  return String(value || '').replace(/PHP|â‚±|₱/g, '').replace(/,/g, '').trim();
}

function getSelectedRequestType() {
  return requestTypeSelect ? requestTypeSelect.value : 'Auto Detect';
}

function applyRequestTypeRules(row) {
  if (row.requestType === 'Completed Repair') {
    return {
      ...row,
      status: 'Completed',
      repairStatus: 'Completed',
      paymentStatus: /^paid$/i.test(row.paymentStatus) ? 'Paid' : 'N/A'
    };
  }

  if (row.requestType === 'Repair Monitoring Update') {
    return {
      ...row,
      status: row.status || 'For Review',
      repairStatus: row.repairStatus || 'In progress',
      paymentStatus: 'N/A'
    };
  }

  if (row.requestType === 'Equipment Request') {
    return {
      ...row,
      category: 'Safety Equipment',
      status: row.status || 'Draft',
      repairStatus: row.repairStatus || 'Pending',
      paymentStatus: row.paymentStatus || 'Unpaid'
    };
  }

  if (row.requestType === 'Labor Payment Request') {
    return {
      ...row,
      category: 'Labor',
      laborCost: row.laborCost || row.totalCost,
      status: row.status || 'Draft',
      repairStatus: row.repairStatus || 'Pending',
      paymentStatus: row.paymentStatus || 'Unpaid'
    };
  }

  if (row.requestType === 'Parts Request' || row.requestType === 'Safety Equipment Request') {
    return {
      ...row,
      status: row.status || 'Draft',
      repairStatus: row.repairStatus || 'Pending',
      paymentStatus: row.paymentStatus || 'Unpaid'
    };
  }

  return row;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function findTotalMatch(line) {
  const matches = Array.from(line.matchAll(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/g));
  if (!matches.length) return null;
  const quantityMatch = line.match(/^(\d+)\s*(?:pcs|pc|set)\b/i);
  if (matches.length === 1 && quantityMatch && matches[0].index === 0) return null;
  return matches[matches.length - 1];
}

function normalizeRequestDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return text;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  if (!month || !day || !year) return text;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function findLooseDateLine(lines) {
  return lines.find(line => /^\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})$/.test(String(line || '').trim())) || '';
}

function findLooseTruckType(lines) {
  const truckLine = lines.find(line => (
    /\b(foton|isuzu|hino|mitsubishi|wing\s*van|wingvan|trailer|trailler|flatbed|elf|forward|aluminum van|dropside|closed van)\b/i.test(line) &&
    !normalizePlate(line) &&
    !/^(date|plate|driver|payee|total|remarks?|items?)\s*[:;-]/i.test(line)
  ));
  return truckLine ? truckLine.trim() : '';
}

function parseRepairLabelLine(line) {
  const match = String(line || '').match(/^([A-Za-z][A-Za-z /\t]*?)\s*[:;]\s*(.*)$/);
  if (!match) return null;
  const rawLabel = match[1].replace(/\s+/g, ' ').trim().toLowerCase();
  const value = match[2].trim();
  const labels = {
    date: 'date',
    plate: 'plate',
    truck: 'truck',
    driver: 'driver',
    helper: 'helper',
    item: 'item',
    items: 'item',
    'parts needed': 'item',
    'parts used': 'item',
    'equipment item': 'item',
    supplier: 'supplier',
    payee: 'payee',
    odometer: 'odometer',
    odo: 'odometer',
    priority: 'priority',
    status: 'repairStatus',
    'repair status': 'repairStatus',
    mechanic: 'mechanic',
    technician: 'mechanic',
    shop: 'shopName',
    'shop name': 'shopName',
    'approval status': 'approvalStatus',
    'approved by': 'approvedBy',
    total: 'total',
    'total cost': 'total',
    remarks: 'remarks',
    remark: 'remarks',
    'work done': 'workDone',
    done: 'workDone',
    update: 'workDone'
  };
  const label = labels[rawLabel];
  return label ? { label, value } : null;
}

function requestHasScopedContent(request) {
  return ['item', 'supplier', 'payee', 'totalCost', 'remarks', 'workDone'].some(field => String(request[field] || '').trim());
}

function requestCanCommit(request) {
  return Boolean(String(request.item || '').trim() || String(request.totalCost || '').trim());
}

function appendRequestField(request, field, value) {
  const text = String(value || '').trim();
  if (!text) return;
  request[field] = request[field] ? `${request[field]}\n${text}` : text;
}

function extractQuantityFromItem(item) {
  const match = String(item || '').match(/\b(\d+)\s*(pcs?|pieces?|sets?|set)\b/i);
  if (!match) return { quantity: '', unit: '', item: String(item || '').trim() };
  const unit = match[2].toLowerCase().replace(/^pieces?$/, 'pcs').replace(/^pc$/, 'pcs').replace(/^sets$/, 'set');
  let cleanedItem = String(item || '').trim();
  if (match.index === 0) {
    cleanedItem = cleanedItem.slice(match[0].length).trim();
  }
  return {
    quantity: match[1],
    unit,
    item: cleanedItem || String(item || '').trim()
  };
}

function normalizePayeeName(value) {
  const text = String(value || '').trim();
  if (!text || text !== text.toUpperCase() || !/^[A-Z .'-]+$/.test(text)) return text;
  return text.toLowerCase().replace(/\b[a-z]/g, char => char.toUpperCase());
}

function createRepairRowFromRequest(request, carryForward, requestTypeOverride) {
  if (!requestCanCommit(request)) return null;

  const selectedRequestType = requestTypeOverride && requestTypeOverride !== 'Auto Detect'
    ? requestTypeOverride
    : detectRequestType([request.item, request.workDone, request.remarks].join('\n'));
  const requestType = selectedRequestType === 'Labor Payment Request' ? 'Parts Request' : selectedRequestType;
  const defaultStatuses = getDefaultStatuses(requestType);
  const totalNumber = parsePrice(String(request.totalCost || '').match(/\d[\d,]*(?:\.\d+)?/)?.[0] || '');
  const quantityInfo = extractQuantityFromItem(request.item);
  const quantityNumber = quantityInfo.quantity ? Number(quantityInfo.quantity) : '';
  const unitCost = quantityNumber && totalNumber ? totalNumber / quantityNumber : '';
  const totalCost = totalNumber !== '' ? formatCurrency(totalNumber) : '';
  const category = getCategoryForRequest(requestType, quantityInfo.item);
  const plateNumber = normalizePlate(request.plateNumber) || carryForward.plateNumber || '';
  const truckInfo = getTruckInfoByPlate(plateNumber);

  return applyRequestTypeRules({
    requestType,
    date: normalizeRequestDate(request.date),
    dateFinished: '',
    requestedBy: request.requestedBy || '',
    plateNumber,
    truckType: request.truckType || carryForward.truckType || truckInfo?.truckType || '',
    driver: request.driver || carryForward.driver || '',
    helper: request.helper || carryForward.helper || '',
    odometer: request.odometer || '',
    priority: request.priority || '',
    workDone: request.workDone || '',
    item: quantityInfo.item,
    quantity: quantityInfo.quantity ? `${quantityInfo.quantity} ${quantityInfo.unit}` : '',
    unitCost: unitCost !== '' ? formatCurrency(unitCost) : '',
    partsCost: requestType === 'Labor Payment Request' ? '' : totalCost,
    laborCost: requestType === 'Labor Payment Request' ? totalCost : '',
    totalCost,
    category,
    mechanic: request.mechanic || '',
    shopName: request.shopName || '',
    approvalStatus: request.approvalStatus || '',
    approvedBy: request.approvedBy || '',
    photoLink: '',
    receiptLink: '',
    supplier: request.supplier || '',
    payee: normalizePayeeName(request.payee),
    remarks: request.remarks || '',
    status: defaultStatuses.status,
    repairStatus: request.repairStatus || defaultStatuses.repairStatus,
    paymentStatus: defaultStatuses.paymentStatus
  });
}

function parseRequestBlockMessage(message, requestTypeOverride = 'Auto Detect') {
  const rawLines = String(message || '')
    .replace(/[\u2066-\u2069]/g, '')
    .split(/\r?\n/)
    .map(stripViberPrefix)
    .map(line => line.trim())
    .filter(Boolean);

  const rows = [];
  const carryForward = { plateNumber: '', truckType: '', driver: '', helper: '' };
  let current = {};
  let activeMultilineField = '';

  const commitCurrent = () => {
    const row = createRepairRowFromRequest(current, carryForward, requestTypeOverride);
    if (!row) return;
    rows.push(row);
    if (row.plateNumber) carryForward.plateNumber = row.plateNumber;
    if (row.truckType) carryForward.truckType = row.truckType;
    if (row.driver) carryForward.driver = row.driver;
    if (row.helper) carryForward.helper = row.helper;
  };

  for (const line of rawLines) {
    const labeled = parseRepairLabelLine(line);

    if (labeled && (labeled.label === 'date' || labeled.label === 'plate') && requestHasScopedContent(current)) {
      commitCurrent();
      current = {};
      activeMultilineField = '';
    }

    if (!labeled) {
      if (activeMultilineField) appendRequestField(current, activeMultilineField, line);
      continue;
    }

    const { label, value } = labeled;
    activeMultilineField = '';

    if (label === 'date') current.date = normalizeRequestDate(value);
    if (label === 'plate') current.plateNumber = normalizePlate(value);
    if (label === 'truck') current.truckType = value;
    if (label === 'driver') current.driver = value;
    if (label === 'helper') current.helper = value;
    if (label === 'odometer') current.odometer = value;
    if (label === 'priority') current.priority = value;
    if (label === 'repairStatus') current.repairStatus = value;
    if (label === 'mechanic') current.mechanic = value;
    if (label === 'shopName') current.shopName = value;
    if (label === 'approvalStatus') current.approvalStatus = value;
    if (label === 'approvedBy') current.approvedBy = value;
    if (label === 'supplier') current.supplier = value;
    if (label === 'payee') current.payee = value;
    if (label === 'remarks') current.remarks = value;
    if (label === 'workDone') current.workDone = value;
    if (label === 'total') current.totalCost = value;
    if (label === 'item') appendRequestField(current, 'item', value);

    if (['item', 'remarks', 'workDone'].includes(label) && !value) {
      activeMultilineField = label;
    }
  }

  commitCurrent();
  return rows;
}

function parseSegment(segment, requestTypeOverride = 'Auto Detect') {
  const cleaned = segment.replace(/[\u2066-\u2069]/g, '').trim();
  const rawLines = cleaned.split(/\r?\n/).map(line => line.trim());
  const cleanedLines = rawLines.map(stripViberPrefix);
  const lines = [];
  for (const line of cleanedLines) {
    if (!line) continue;
    if (/^\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(line) && lines.length) {
      lines[lines.length - 1] += ` ${line}`;
    } else {
      lines.push(line);
    }
  }

  const dateMatch = cleaned.match(/\[.*?(\d{1,2}\s+[A-Za-z]+\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
  const date = dateMatch ? dateMatch[1] : '';
  const requestedBy = extractRequestedBy(rawLines);
  const parseText = lines.join('\n');
  const requestType = requestTypeOverride && requestTypeOverride !== 'Auto Detect' ? requestTypeOverride : detectRequestType(parseText);
  const defaultStatuses = getDefaultStatuses(requestType);
  const plateNumber = normalizePlate(parseText);
  const truckTypeMatch = parseText.match(/\b(foton|isuzu|wingvan|flatbed)\b/i);
  const truckType = truckTypeMatch ? truckTypeMatch[1] : '';
  const driverMatch = parseText.match(/driver\s*[:;]\s*(.+)/i);
  const driver = driverMatch ? driverMatch[1].trim() : '';
  const helperMatch = parseText.match(/helper\s*[:;]\s*(.+)/i);
  const helper = helperMatch ? helperMatch[1].trim() : '';
  const isCompletedHistory = requestType === 'Completed Repair' || requestType === 'Repair Monitoring Update';
  const dateFinished = isCompletedHistory ? date : '';
  const mechanic = extractLineValue(parseText, ['mechanic', 'technician']);
  const workDone = extractLineValue(parseText, ['work done', 'repair done', 'done', 'remarks']) || (isCompletedHistory ? parseText.replace(/\n+/g, ' ').trim() : '');
  const laborCost = extractMoneyFromText(parseText, ['labor cost', 'labor']);
  const receiptLink = extractLink(parseText, ['receipt', 'resibo']);
  const photoLink = extractLink(parseText, ['photo', 'picture', 'image', 'pic']);

  const items = [];
  for (const line of lines) {
    const normalizedLine = line.replace(/[\u2068\u2069]/g, '').trim();
    if (/^\[/.test(normalizedLine)) continue;
    if (/^Total:/i.test(normalizedLine)) continue;
    if (/^Driver[:;]/i.test(normalizedLine) || /^Helper[:;]/i.test(normalizedLine)) continue;
    if (/^(Work Done|Repair Done|Done|Remarks|Mechanic|Technician|Labor|Labor Cost|Photo|Picture|Image|Pic|Receipt|Resibo)[:;-]/i.test(normalizedLine)) continue;

    const totalMatch = findTotalMatch(normalizedLine);
    const hasPrice = Boolean(totalMatch);
    const hasQuantity = /^(\d+)\s*(?:pcs|pc|set)\b/i.test(normalizedLine);
    const hasItemKeyword = /\b(hard hat|headlight|hose|seal|bonding|oil seal|trailer hose|isuzu|foton|wingvan|flatbed)\b/i.test(normalizedLine);
    const isPlateLine = /\b([A-Z]{2,4})\s?(\d{3,4})\b/.test(normalizedLine) && !hasQuantity && !/hard hat|headlight|hose|seal|bonding/i.test(normalizedLine);
    if (!hasPrice && !hasQuantity && !hasItemKeyword) continue;
    if (isPlateLine && !/hard hat/i.test(normalizedLine)) continue;

    const totalCost = totalMatch ? parsePrice(totalMatch[0]) : '';
    const textBefore = totalMatch ? normalizedLine.slice(0, totalMatch.index).trim() : normalizedLine;
    const qtyMatch = textBefore.match(/^(\d+)\s*(pcs|pc|set)?\s*/i);
    const quantity = qtyMatch ? `${qtyMatch[1]}${qtyMatch[2] ? ` ${qtyMatch[2].toLowerCase()}` : ''}` : '';
    let item = textBefore;
    if (qtyMatch) item = textBefore.slice(qtyMatch[0].length).trim();
    if (!item) item = normalizedLine;

    const category = getCategoryForRequest(requestType, item);
    const quantityNumber = qtyMatch ? Number(qtyMatch[1]) : '';
    const unitCost = quantityNumber && totalCost ? totalCost / quantityNumber : '';
    const formattedTotalCost = totalCost !== '' ? formatCurrency(totalCost) : '';
    const formattedLaborCost = laborCost !== '' ? formatCurrency(laborCost) : '';

    items.push(applyRequestTypeRules({
      requestType,
      date,
      dateFinished,
      requestedBy,
      plateNumber,
      truckType,
      driver,
      helper,
      workDone,
      item,
      payee: '',
      quantity,
      unitCost: unitCost !== '' ? formatCurrency(unitCost) : '',
      partsCost: requestType === 'Labor Payment Request' ? '' : formattedTotalCost,
      laborCost: requestType === 'Labor Payment Request' ? (formattedLaborCost || formattedTotalCost) : formattedLaborCost,
      totalCost: formattedTotalCost,
      category,
      mechanic,
      photoLink,
      receiptLink,
      status: category === 'Safety Equipment' ? 'Draft' : defaultStatuses.status,
      repairStatus: defaultStatuses.repairStatus,
      paymentStatus: defaultStatuses.paymentStatus
    }));
  }

  if (!items.length && requestType !== 'Parts Request') {
    items.push(applyRequestTypeRules({
      requestType,
      date,
      dateFinished,
      requestedBy,
      plateNumber,
      truckType,
      driver,
      helper,
      workDone,
      item: '',
      payee: '',
      quantity: '',
      unitCost: '',
      partsCost: '',
      laborCost: laborCost !== '' ? formatCurrency(laborCost) : '',
      totalCost: laborCost !== '' ? formatCurrency(laborCost) : '',
      category: getCategoryForRequest(requestType),
      mechanic,
      photoLink,
      receiptLink,
      status: defaultStatuses.status,
      repairStatus: defaultStatuses.repairStatus,
      paymentStatus: defaultStatuses.paymentStatus
    }));
  }

  return items;
}

function extractLaborValue(lines, labelPattern) {
  const regex = new RegExp(`^${labelPattern}\\s*[:;-]\\s*(.+)$`, 'i');
  for (const line of lines) {
    const match = line.match(regex);
    if (match) return match[1].trim();
  }
  if (labelPattern === 'date') return normalizeRequestDate(findLooseDateLine(lines));
  if (labelPattern === 'plate') return normalizePlate(lines.join('\n'));
  if (labelPattern === 'truck') return findLooseTruckType(lines);
  return '';
}

function extractLaborPayee(lines) {
  for (const line of lines) {
    const match = line.match(/^payee\s*[:;]\s*(.+)$/i);
    if (match) return match[1].trim();
  }
  return '';
}

function isLaborMetadataLine(line) {
  return /^(date|plate|truck|driver|payee|total|remarks?|items?)\s*[:;-]/i.test(line);
}

function extractLaborItems(lines) {
  const items = [];
  let inItems = false;

  for (const line of lines) {
    if (/^items?\s*[:;-]?\s*/i.test(line)) {
      inItems = true;
      const inlineItem = line.replace(/^items?\s*[:;-]?\s*/i, '').trim();
      if (inlineItem) items.push(inlineItem);
      continue;
    }

    if (inItems && /^(date|plate|truck|driver|payee|total|remarks?)\s*[:;-]/i.test(line)) {
      inItems = false;
    }

    if (inItems && line) items.push(line);
  }

  if (items.length) return items.join('\n');

  return lines
    .filter(line => {
      if (!line || /^\[/.test(line) || isLaborMetadataLine(line)) return false;
      if (line === findLooseDateLine(lines)) return false;
      if (/^[A-Z]{2,4}\s?\d{3,4}$/i.test(line.trim())) return false;
      if (line === findLooseTruckType(lines)) return false;
      return !/^payee\s*[:;-]?|^total\s*[:;-]?|^remarks?\s*[:;-]?/i.test(line);
    })
    .join('\n');
}

function splitLaborBlocks(message) {
  const lines = message
    .replace(/[\u2066-\u2069]/g, '')
    .split(/\r?\n/)
    .map(stripViberPrefix)
    .map(line => line.trim())
    .filter(Boolean);

  const blocks = [];
  let current = [];

  for (const line of lines) {
    if (/^date\s*[:;-]/i.test(line) && current.length) {
      blocks.push(current);
      current = [];
    }
    current.push(line);
  }

  if (current.length) blocks.push(current);
  const labeledBlocks = blocks.filter(block => block.some(line => /^date\s*[:;-]/i.test(line) || /^plate\s*[:;-]/i.test(line)));
  if (labeledBlocks.length) return labeledBlocks;
  return lines.length ? [lines] : [];
}

function parseLaborPaymentMessage(message) {
  return splitLaborBlocks(message).map(block => {
    const date = extractLaborValue(block, 'date');
    const totalValue = extractLaborValue(block, 'total');
    const totalNumber = parsePrice((totalValue.match(/\d[\d,]*(?:\.\d+)?/) || [''])[0]);
    const totalCost = totalNumber !== '' ? formatCurrency(totalNumber) : '';

    return applyRequestTypeRules({
      requestType: 'Labor Payment Request',
      date,
      dateFinished: '',
      requestedBy: '',
      plateNumber: normalizePlate(extractLaborValue(block, 'plate')),
      truckType: extractLaborValue(block, 'truck'),
      driver: extractLaborValue(block, 'driver'),
      helper: '',
      workDone: extractLaborItems(block),
      item: '',
      quantity: '',
      unitCost: '',
      partsCost: '',
      laborCost: totalCost,
      totalCost,
      category: 'Labor',
      mechanic: '',
      photoLink: '',
      receiptLink: '',
      payee: extractLaborPayee(block),
      remarks: extractLaborValue(block, 'remarks?'),
      status: 'Draft',
      repairStatus: 'Pending',
      paymentStatus: 'Unpaid'
    });
  });
}

function parseViberMessage(message, requestTypeOverride = 'Auto Detect') {
  const selectedRequestType = requestTypeOverride && requestTypeOverride !== 'Auto Detect' ? requestTypeOverride : detectRequestType(message);
  if (selectedRequestType === 'Labor Payment Request') {
    return parseLaborPaymentMessage(message);
  }

  if (selectedRequestType === 'Parts Request' || selectedRequestType === 'Safety Equipment Request') {
    return parseRequestBlockMessage(message, requestTypeOverride);
  }

  const segments = message.split(/\n\s*\n/).map(segment => segment.trim()).filter(Boolean);
  let rows = [];
  for (const segment of segments) {
    rows = rows.concat(parseSegment(segment, requestTypeOverride));
  }
  return rows;
}

function buildRepairTable(rows) {
  if (!tableBody) return;
  if (!rows.length) {
    tableBody.innerHTML = '<tr><td colspan="12" class="empty">No repair records yet. Paste a Viber message and click Parse Message.</td></tr>';
    return;
  }

  tableBody.innerHTML = rows.map(row => {
    return `
      <tr>
        <td>${row.date}</td>
        <td>${row.requestedBy}</td>
        <td>${row.plateNumber}</td>
        <td>${row.truckType}</td>
        <td>${row.driver}</td>
        <td>${row.helper}</td>
        <td>${row.item}</td>
        <td>${row.quantity}</td>
        <td>${row.unitCost ? '₱' + row.unitCost : ''}</td>
        <td>${row.totalCost ? '₱' + row.totalCost : ''}</td>
        <td>${row.category}</td>
        <td>
          <select>
            <option value="Draft">Draft</option>
            <option value="For Review">For Review</option>
            <option value="Approved">Approved</option>
            <option value="For Payment">For Payment</option>
            <option value="Paid">Paid</option>
            <option value="Completed">Completed</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');
}

function collectTableRows() {
  if (!tableBody) return [];
  return Array.from(tableBody.querySelectorAll('tr')).map(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length !== 12) return null;
    return {
      date: cells[0].textContent.trim(),
      requestedBy: cells[1].textContent.trim(),
      plateNumber: cells[2].textContent.trim(),
      truckType: cells[3].textContent.trim(),
      driver: cells[4].textContent.trim(),
      helper: cells[5].textContent.trim(),
      item: cells[6].textContent.trim(),
      quantity: cells[7].textContent.trim(),
      unitCost: cells[8].textContent.trim(),
      totalCost: cells[9].textContent.trim(),
      category: cells[10].textContent.trim(),
      status: tr.querySelector('select') ? tr.querySelector('select').value : 'Draft'
    };
  }).filter(Boolean);
}

function buildRepairTable(rows) {
  if (!tableBody) return;
  if (!rows.length) {
    tableBody.innerHTML = '<tr><td colspan="24" class="empty">No repair records yet. Paste a Viber message and click Parse Message.</td></tr>';
    return;
  }

  const displayRows = rows.map(row => (
    row.requestType === 'Completed Repair'
      ? { ...row, requestType: 'Repair Monitoring Update' }
      : row
  ));

  tableBody.innerHTML = displayRows.map(row => `
    <tr
      data-supplier="${escapeHtml(row.supplier)}"
      data-remarks="${escapeHtml(row.remarks)}"
      data-odometer="${escapeHtml(row.odometer)}"
      data-priority="${escapeHtml(row.priority)}"
      data-shop-name="${escapeHtml(row.shopName)}"
      data-outside-shop-cost="${escapeHtml(row.outsideShopCost)}"
      data-towing-cost="${escapeHtml(row.towingCost)}"
      data-other-cost="${escapeHtml(row.otherCost)}"
      data-approval-status="${escapeHtml(row.approvalStatus)}"
      data-approved-by="${escapeHtml(row.approvedBy)}"
    >
      <td><input data-field="selected" type="checkbox" checked aria-label="Select parsed row"></td>
      <td>
        <select data-field="requestType">
          <option value="Parts Request"${row.requestType === 'Parts Request' ? ' selected' : ''}>Parts Request</option>
          <option value="Labor Payment Request"${row.requestType === 'Labor Payment Request' ? ' selected' : ''}>Labor Payment Request</option>
          <option value="Safety Equipment Request"${row.requestType === 'Safety Equipment Request' ? ' selected' : ''}>Equipment Request</option>
          <option value="Repair Monitoring Update"${row.requestType === 'Repair Monitoring Update' ? ' selected' : ''}>Other Repair Request</option>
        </select>
      </td>
      <td>${escapeHtml(row.date)}</td>
      <td><input data-field="dateFinished" value="${escapeHtml(row.dateFinished)}" placeholder="Date finished"></td>
      <td>${escapeHtml(row.requestedBy)}</td>
      <td>${escapeHtml(row.plateNumber)}</td>
      <td>${escapeHtml(row.truckType)}</td>
      <td>${escapeHtml(row.driver)}</td>
      <td>${escapeHtml(row.payee)}</td>
      <td>${escapeHtml(row.helper)}</td>
      <td><input data-field="workDone" value="${escapeHtml(row.workDone)}" placeholder="Work done"></td>
      <td>${escapeHtml(row.item)}</td>
      <td>${escapeHtml(row.quantity)}</td>
      <td>${row.unitCost ? 'PHP ' + escapeHtml(row.unitCost) : ''}</td>
      <td><input data-field="partsCost" value="${escapeHtml(row.partsCost || row.totalCost)}" placeholder="0"></td>
      <td><input data-field="laborCost" value="${escapeHtml(row.laborCost)}" placeholder="0"></td>
      <td>${row.totalCost ? 'PHP ' + escapeHtml(row.totalCost) : ''}</td>
      <td>${escapeHtml(row.category)}</td>
      <td><input data-field="mechanic" value="${escapeHtml(row.mechanic)}" placeholder="Mechanic"></td>
      <td><input data-field="photoLink" value="${escapeHtml(row.photoLink)}" placeholder="Photo URL"></td>
      <td><input data-field="receiptLink" value="${escapeHtml(row.receiptLink)}" placeholder="Receipt URL"></td>
      <td>
        <select data-field="status">
          <option value="Draft"${row.status === 'Draft' ? ' selected' : ''}>Draft</option>
          <option value="For Review"${row.status === 'For Review' ? ' selected' : ''}>For Review</option>
          <option value="Approved"${row.status === 'Approved' ? ' selected' : ''}>Approved</option>
          <option value="For Payment"${row.status === 'For Payment' ? ' selected' : ''}>For Payment</option>
          <option value="Paid"${row.status === 'Paid' ? ' selected' : ''}>Paid</option>
          <option value="Completed"${row.status === 'Completed' ? ' selected' : ''}>Completed</option>
        </select>
      </td>
      <td><input data-field="repairStatus" value="${escapeHtml(row.repairStatus)}" placeholder="Repair status"></td>
      <td><input data-field="paymentStatus" value="${escapeHtml(row.paymentStatus)}" placeholder="Payment status"></td>
    </tr>
  `).join('');
}

function collectTableRows() {
  if (!tableBody) return [];
  return Array.from(tableBody.querySelectorAll('tr')).map(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length !== 24) return null;
    const getInput = field => tr.querySelector(`[data-field="${field}"]`)?.value.trim() || '';
    const selected = tr.querySelector('[data-field="selected"]')?.checked;
    if (!selected) return null;
    return applyRequestTypeRules({
      requestType: getInput('requestType'),
      date: cells[2].textContent.trim(),
      dateFinished: getInput('dateFinished'),
      requestedBy: cells[4].textContent.trim(),
      plateNumber: cells[5].textContent.trim(),
      truckType: cells[6].textContent.trim(),
      driver: cells[7].textContent.trim(),
      payee: cells[8].textContent.trim(),
      supplier: tr.dataset.supplier || '',
      helper: cells[9].textContent.trim(),
      workDone: getInput('workDone'),
      item: cells[11].textContent.trim(),
      quantity: cells[12].textContent.trim(),
      unitCost: cells[13].textContent.trim(),
      partsCost: getInput('partsCost'),
      laborCost: getInput('laborCost'),
      totalCost: cells[16].textContent.trim(),
      category: cells[17].textContent.trim(),
      mechanic: getInput('mechanic'),
      odometer: tr.dataset.odometer || '',
      priority: tr.dataset.priority || '',
      shopName: tr.dataset.shopName || '',
      outsideShopCost: tr.dataset.outsideShopCost || '',
      towingCost: tr.dataset.towingCost || '',
      otherCost: tr.dataset.otherCost || '',
      approvalStatus: tr.dataset.approvalStatus || '',
      approvedBy: tr.dataset.approvedBy || '',
      photoLink: getInput('photoLink'),
      receiptLink: getInput('receiptLink'),
      status: getInput('status') || 'Draft',
      repairStatus: getInput('repairStatus'),
      paymentStatus: getInput('paymentStatus'),
      remarks: tr.dataset.remarks || '',
      payee: cells[8].textContent.trim()
    });
  }).filter(Boolean);
}

function buildFinanceMessage(rows) {
  if (!rows.length) {
    return 'No repair records available. Parse a Viber message first.';
  }

  const lines = rows.map(row => {
    const parts = [];
    if (row.plateNumber) parts.push(`Plate: ${row.plateNumber}`);
    if (row.driver) parts.push(`Driver: ${row.driver}`);
    if (row.helper) parts.push(`Helper: ${row.helper}`);
    if (row.item) parts.push(`Item: ${row.item}`);
    if (row.quantity) parts.push(`Qty: ${row.quantity}`);
    if (row.totalCost) parts.push(`Total: ${row.totalCost}`);
    if (row.status) parts.push(`Status: ${row.status}`);
    return `- ${parts.join(' | ')}`;
  });

  const totalAmount = rows.reduce((sum, row) => {
    const value = Number(row.totalCost.replace(/[^0-9.]/g, ''));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return `Please prepare payment for the following repair requests:\n\n${lines.join('\n')}\n\nTotal amount: ₱${formatCurrency(totalAmount)}.`;
}

function buildFinanceMessage(rows) {
  if (!rows.length) {
    return 'No repair records available. Parse a Viber message first.';
  }

  if (rows.some(row => row.finalCost || row.payee)) {
    const lines = ['Good day po.', '', 'For payment/deposit po:', ''];
    rows.forEach(row => {
      if (row.plateNumber) lines.push(`Plate: ${row.plateNumber}`);
      if (row.driver) lines.push(`Driver: ${row.driver}`);
      if (row.requestType) lines.push(`Request Type: ${row.requestType}`);
      if (row.item || row.workDone) lines.push(`Item/Work Done: ${row.item || row.workDone}`);
      lines.push(`Amount: ${formatFollowupAmount(row.finalCost || row.totalCost)}`);
      if (row.payee) lines.push(`Payee: ${row.payee}`);
      lines.push('');
    });
    lines.push('Thank you.');
    return lines.join('\n');
  }

  const isRepairSummary = rows.every(row => row.requestType === 'Completed Repair' || row.requestType === 'Repair Monitoring Update');

  const lines = rows.map(row => {
    const parts = [];
    if (row.requestType) parts.push(`Type: ${row.requestType}`);
    if (row.plateNumber) parts.push(`Plate: ${row.plateNumber}`);
    if (row.driver) parts.push(`Driver: ${row.driver}`);
    if (row.payee) parts.push(`Payee: ${row.payee}`);
    if (row.helper) parts.push(`Helper: ${row.helper}`);
    if (row.item) parts.push(`Parts: ${row.item}`);
    if (row.quantity) parts.push(`Qty: ${row.quantity}`);
    if (row.workDone) parts.push(`Work Done: ${row.workDone}`);
    if (row.mechanic) parts.push(`Mechanic: ${row.mechanic}`);
    if (row.dateFinished) parts.push(`Date Finished: ${row.dateFinished}`);
    if (row.status) parts.push(`Status: ${row.status}`);
    if (row.repairStatus) parts.push(`Repair Status: ${row.repairStatus}`);
    if (!isRepairSummary && row.totalCost) parts.push(`Total: ${row.totalCost}`);
    return `- ${parts.join(' | ')}`;
  });

  if (isRepairSummary) {
    return `Repair monitoring summary:\n\n${lines.join('\n')}`;
  }

  const totalAmount = rows.reduce((sum, row) => {
    const total = cleanMoney(row.totalCost) || cleanMoney(row.partsCost);
    const value = Number(total);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return `Please prepare finance/deposit payment for the following repair parts requests:\n\n${lines.join('\n')}\n\nTotal amount: PHP ${formatCurrency(totalAmount)}.`;
}

function cleanMoney(value) {
  return String(value || '').replace(/PHP/gi, '').replace(/[^\d.-]/g, '').trim();
}

function hasRepairPayloadContent(row) {
  return [
    row.item,
    row.workDone,
    row.plateNumber,
    row.truckType,
    row.driver,
    row.requestedBy,
    row.totalCost,
    row.partsCost,
    row.laborCost,
    row.odometer,
    row.shopName,
    row.outsideShopCost,
    row.supplier,
    row.payee,
    row.remarks
  ].some(value => String(value || '').trim());
}

function buildRepairPayload(rows, sourceMessage, createdAt, paymentMessage) {
  return rows.filter(hasRepairPayloadContent).map((row, index) => {
    const partsCost = cleanMoney(row.partsCost || (row.requestType === 'Labor Payment Request' ? '' : row.totalCost));
    const laborCost = cleanMoney(row.laborCost);
    const outsideShopCost = cleanMoney(row.outsideShopCost);
    const towingCost = cleanMoney(row.towingCost);
    const otherCost = cleanMoney(row.otherCost);
    const totalCost = cleanMoney(row.totalCost) || String(
      (Number(partsCost) || 0) +
      (Number(laborCost) || 0) +
      (Number(outsideShopCost) || 0) +
      (Number(towingCost) || 0) +
      (Number(otherCost) || 0) ||
      ''
    );

    return {
      Request_ID: `${Date.now()}_${index}`,
      Request_Type: row.requestType,
      Date_Requested: row.date,
      Date_Finished: row.dateFinished,
      Requested_By: row.requestedBy,
      Plate_Number: row.plateNumber,
      Truck_Type: row.truckType,
      Driver: row.driver,
      Helper: row.helper,
      Odometer: row.odometer || '',
      Priority: row.priority || '',
      Category: row.category,
      Repair_Parts: row.item,
      Work_Done: row.workDone,
      Quantity: row.quantity,
      Unit_Cost: cleanMoney(row.unitCost),
      Parts_Cost: partsCost,
      Labor_Cost: laborCost,
      Outside_Shop_Cost: outsideShopCost,
      Towing_Cost: towingCost,
      Other_Cost: otherCost,
      Original_Total_Cost: totalCost,
      Final_Cost: totalCost,
      Total_Cost: totalCost,
      Supplier: row.supplier || '',
      Supplier_Contact: row.supplierContact || '',
      Payee: row.payee || '',
      Assigned_To: row.assignedTo || row.mechanic || '',
      Shop_Name: row.shopName || '',
      Status: row.status,
      Repair_Status: row.repairStatus,
      Payment_Status: row.paymentStatus,
      Approval_Status: row.approvalStatus || '',
      Approved_By: row.approvedBy || '',
      Proof_Of_Payment: '',
      Receipt_Link: row.receiptLink,
      Photo_Link: row.photoLink,
      Mechanic: row.mechanic,
      Remarks: row.remarks || '',
      Cost_Remarks: row.costRemarks || '',
      Source_Message: sourceMessage,
      Created_At: createdAt,
      Payment_Message: paymentMessage,
      Saved_By: '',
      Last_Updated: createdAt
    };
  });
}

function normalizeSavedRecords(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.records)) return data.records;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

function getRecordValue(record, key) {
  const pascalKey = key.replace(/_([a-z])/gi, (_, char) => char.toUpperCase());
  const lowerCamelKey = pascalKey.charAt(0).toLowerCase() + pascalKey.slice(1);
  const spacedKey = key.replace(/_/g, ' ');
  const lowerKey = key.toLowerCase();
  return record[key] ??
    record[lowerKey] ??
    record[key.replace(/_/g, '')] ??
    record[pascalKey] ??
    record[lowerCamelKey] ??
    record[spacedKey] ??
    record[spacedKey.toLowerCase()] ??
    '';
}

function getGarageTruckValue(record, key) {
  const camelKey = key.replace(/_([a-z])/gi, (_, char) => char.toUpperCase());
  const lowerCamelKey = camelKey.charAt(0).toLowerCase() + camelKey.slice(1);
  const spacedKey = key.replace(/_/g, ' ');
  return record[key] ?? record[camelKey] ?? record[lowerCamelKey] ?? record[key.replace(/_/g, '')] ?? record[spacedKey] ?? '';
}

function getGarageTruckLocation(record) {
  return String(
    getGarageTruckValue(record, 'Garage_Location') ||
    getGarageTruckValue(record, 'Garage') ||
    ''
  ).trim();
}

function getGarageTruckTimestamp(record) {
  const value = getGarageTruckValue(record, 'Timestamp');
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function filterGarageTrucksByTimestamp(records) {
  const filter = garageTimeFilter?.value || '3d';
  if (filter === 'all') return records;

  const hoursByFilter = {
    '24h': 24,
    '3d': 72,
    '7d': 168
  };
  const hours = hoursByFilter[filter] || 72;
  const cutoff = Date.now() - (hours * 60 * 60 * 1000);

  return records.filter(record => {
    const timestamp = getGarageTruckTimestamp(record);
    return timestamp && timestamp.getTime() >= cutoff;
  });
}

function normalizeGaragePlateSearch(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function filterGarageTrucksBySearch(records) {
  const query = normalizeGaragePlateSearch(garageTruckSearchQuery);
  if (!query) return records;

  return records.filter(record => {
    const plateNumber = normalizeGaragePlateSearch(getGarageTruckValue(record, 'Plate_Number'));
    return plateNumber.includes(query);
  });
}

function countHiddenOldGarageRecords(records) {
  const filter = garageTimeFilter?.value || '3d';
  if (filter === 'all') return 0;
  return records.length - filterGarageTrucksByTimestamp(records).length;
}

function splitGarageTruckRecords(records) {
  const filteredRecords = filterGarageTrucksBySearch(filterGarageTrucksByTimestamp(records));
  return {
    majada: filteredRecords.filter(record => getGarageTruckLocation(record) === 'Majada Garage'),
    valenzuela: filteredRecords.filter(record => getGarageTruckLocation(record) === 'Valenzuela Garage')
  };
}

function applyGarageTruckSearch() {
  garageTruckSearchQuery = garageTruckSearch?.value.trim() || '';
  renderGarageTrucks();
}

function clearGarageTruckSearch() {
  garageTruckSearchQuery = '';
  if (garageTruckSearch) garageTruckSearch.value = '';
  renderGarageTrucks();
}

function formatGarageTimestamp(value) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return String(value || '');
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(timestamp);
}

function getGarageSourceBadge(value) {
  const source = String(value || '').trim();
  const compactSource = source.replace(/\s+/g, '');
  let label = source || 'Unknown';
  let type = 'other';

  if (/bottle/i.test(compactSource)) {
    label = 'Bottle';
    type = 'bottle';
  } else if (/sugar/i.test(compactSource)) {
    label = 'Sugar';
    type = 'sugar';
  } else if (/caps.?crown/i.test(compactSource)) {
    label = 'CapsCrown';
    type = 'capscrown';
  } else if (/preform|resin/i.test(compactSource)) {
    label = 'PreformResin';
    type = 'preformresin';
  }

  return `<span class="garage-source-badge ${type}">${escapeHtml(label)}</span>`;
}

function buildGarageMapLink(value) {
  const link = String(value || '').trim();
  if (!link) return '';
  return `<a href="${escapeHtml(link)}" target="_blank" rel="noopener">Open Map</a>`;
}

function renderGarageTruckRows(tbody, records, emptyMessage) {
  if (!tbody) return;
  if (!records.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">${escapeHtml(emptyMessage)}</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(record => `
    <tr>
      <td>${escapeHtml(truncateRecordValue(getGarageTruckValue(record, 'Plate_Number'), 18))}</td>
      <td>${escapeHtml(truncateRecordValue(getGarageTruckValue(record, 'Status'), 28))}</td>
      <td>${escapeHtml(formatGarageTimestamp(getGarageTruckValue(record, 'Timestamp')))}</td>
      <td>${getGarageSourceBadge(getGarageTruckValue(record, 'Source'))}</td>
      <td>${buildGarageMapLink(getGarageTruckValue(record, 'Map_Link'))}</td>
    </tr>
  `).join('');
}

async function loadGarageTrucks() {
  if (!majadaGarageBody || !valenzuelaGarageBody || !garageTrucksStatus) return;

  garageTrucksStatus.textContent = 'Loading garage trucks...';
  if (refreshGarageTrucksButton) refreshGarageTrucksButton.disabled = true;
  majadaGarageBody.innerHTML = '<tr><td colspan="5" class="empty">Loading Majada garage trucks...</td></tr>';
  valenzuelaGarageBody.innerHTML = '<tr><td colspan="5" class="empty">Loading Valenzuela garage trucks...</td></tr>';

  try {
    const response = await fetch(`${REPAIR_WEB_APP_URL}?action=garageTrucks`);
    const data = await response.json();
    garageTruckRecords = Array.isArray(data?.trucks) ? data.trucks : [];
    renderGarageTrucks();
  } catch (error) {
    majadaGarageBody.innerHTML = '<tr><td colspan="5" class="empty">Unable to load Majada garage trucks.</td></tr>';
    valenzuelaGarageBody.innerHTML = '<tr><td colspan="5" class="empty">Unable to load Valenzuela garage trucks.</td></tr>';
    if (majadaGarageCount) majadaGarageCount.textContent = '0';
    if (valenzuelaGarageCount) valenzuelaGarageCount.textContent = '0';
    if (majadaGarageCardCount) majadaGarageCardCount.textContent = '0';
    if (valenzuelaGarageCardCount) valenzuelaGarageCardCount.textContent = '0';
    if (garageTotalShown) garageTotalShown.textContent = '0';
    if (garageHiddenOldCount) garageHiddenOldCount.textContent = '0';
    garageTrucksStatus.textContent = 'Error loading garage trucks.';
  } finally {
    if (refreshGarageTrucksButton) refreshGarageTrucksButton.disabled = false;
  }
}

function renderGarageTrucks() {
  if (!majadaGarageBody || !valenzuelaGarageBody || !garageTrucksStatus) return;
  const garageTrucks = splitGarageTruckRecords(garageTruckRecords);
  const totalShown = garageTrucks.majada.length + garageTrucks.valenzuela.length;
  const hiddenOldRecords = countHiddenOldGarageRecords(garageTruckRecords);
  const searchQuery = garageTruckSearchQuery.trim();
  const emptySuffix = searchQuery ? ` matching "${searchQuery}"` : '';

  renderGarageTruckRows(majadaGarageBody, garageTrucks.majada, `No Majada garage trucks found for this time range${emptySuffix}.`);
  renderGarageTruckRows(valenzuelaGarageBody, garageTrucks.valenzuela, `No Valenzuela garage trucks found for this time range${emptySuffix}.`);
  if (majadaGarageCount) majadaGarageCount.textContent = String(garageTrucks.majada.length);
  if (valenzuelaGarageCount) valenzuelaGarageCount.textContent = String(garageTrucks.valenzuela.length);
  if (majadaGarageCardCount) majadaGarageCardCount.textContent = String(garageTrucks.majada.length);
  if (valenzuelaGarageCardCount) valenzuelaGarageCardCount.textContent = String(garageTrucks.valenzuela.length);
  if (garageTotalShown) garageTotalShown.textContent = String(totalShown);
  if (garageHiddenOldCount) garageHiddenOldCount.textContent = String(hiddenOldRecords);
  const searchText = searchQuery ? ` matching "${searchQuery}"` : '';
  garageTrucksStatus.textContent = `Showing ${totalShown} of ${garageTruckRecords.length} garage truck${garageTruckRecords.length === 1 ? '' : 's'}${searchText}.`;
}

function getForRepairLocalValue(field) {
  return forRepairLocalForm?.querySelector(`[data-for-repair-field="${field}"]`)?.value.trim() || '';
}

function loadLocalForRepairTrucks() {
  try {
    localForRepairTrucks = JSON.parse(localStorage.getItem(FOR_REPAIR_TRUCKS_KEY) || '[]');
  } catch (error) {
    localForRepairTrucks = [];
  }
  renderLocalForRepairTrucks();
}

function renderForRepairTrucks() {
  renderLocalForRepairTrucks();
}

function saveLocalForRepairTrucks() {
  localStorage.setItem(FOR_REPAIR_TRUCKS_KEY, JSON.stringify(localForRepairTrucks));
}

function saveForRepairTruck(record) {
  record.forRepairId = record.forRepairId || createRepairLocalId('for_repair');
  record.createdAt = record.createdAt || new Date().toISOString();
  record.updatedAt = new Date().toISOString();
  localForRepairTrucks.unshift(record);
  saveLocalForRepairTrucks();
  renderLocalForRepairTrucks();
}

function syncForRepairTruck(record) {
  return fetch(REPAIR_WEB_APP_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'saveForRepairTruck',
      record: {
        For_Repair_ID: record.forRepairId,
        Plate_Number: record.plateNumber || '',
        Group_Category: record.groupCategory || '',
        Truck_Type: record.truckType || '',
        Garage_Location: record.garageLocation || '',
        Repair_Issue: record.repairIssue || '',
        Start_Date: record.startDate || '',
        Estimated_Finish_Date: record.estimatedFinishDate || '',
        End_Date: record.endDate || '',
        Repair_Status: record.repairStatus || '',
        Remarks: record.remarks || '',
        Created_At: record.createdAt || '',
        Updated_At: record.updatedAt || ''
      }
    })
  });
}

async function deleteForRepairTruck(index) {
  const record = localForRepairTrucks[index];
  if (!record) return;
  if (!window.confirm('Delete this for-repair record? This will hide it but keep a cloud log.')) return;
  const reason = window.prompt('Reason for delete? (optional)') ?? '';

  const now = new Date().toISOString();
  const updatedRecord = { ...record, isDeleted: true, deletedAt: now, deleteReason: reason, updatedAt: now };
  localForRepairTrucks[index] = updatedRecord;
  saveLocalForRepairTrucks();
  renderLocalForRepairTrucks();
  if (forRepairLocalStatus) forRepairLocalStatus.textContent = 'Deleted locally. Syncing delete to cloud...';

  try {
    await fetch(REPAIR_WEB_APP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'deleteForRepairTruck',
        forRepairId: record.forRepairId,
        deletedBy: 'Web User',
        deleteReason: reason
      })
    });
    console.log('[ForRepair] Delete sync success:', record.forRepairId);
    if (forRepairLocalStatus) forRepairLocalStatus.textContent = 'Deleted and logged in cloud.';
  } catch (error) {
    console.error('[ForRepair] Delete sync failed:', error);
    if (forRepairLocalStatus) forRepairLocalStatus.textContent = 'Deleted locally. Cloud sync failed.';
  }
}

async function completeForRepairTruck(index) {
  const record = localForRepairTrucks[index];
  if (!record) return;
  if (!window.confirm('Mark this repair as completed?')) return;
  const today = new Date().toISOString().slice(0, 10);
  const completedDate = window.prompt('Completion date:', record.endDate || today);
  if (completedDate === null) return;

  const updatedRecord = {
    ...record,
    endDate: completedDate || today,
    repairStatus: 'Completed',
    updatedAt: new Date().toISOString()
  };
  localForRepairTrucks[index] = updatedRecord;
  saveLocalForRepairTrucks();
  renderLocalForRepairTrucks();
  if (forRepairLocalStatus) forRepairLocalStatus.textContent = 'Completed locally. Syncing to cloud...';

  try {
    await syncForRepairTruck(updatedRecord);
    console.log('[ForRepair] Complete sync success:', updatedRecord.forRepairId);
    if (forRepairLocalStatus) forRepairLocalStatus.textContent = 'Completed and synced to cloud.';
  } catch (error) {
    console.error('[ForRepair] Complete sync failed:', error);
    if (forRepairLocalStatus) forRepairLocalStatus.textContent = 'Completed locally. Cloud sync failed.';
  }
}

function renderLocalForRepairTrucks() {
  if (!forRepairLocalBody) return;
  const visible = localForRepairTrucks.filter(r => !r.isDeleted);
  if (!visible.length) {
    forRepairLocalBody.innerHTML = '<tr><td colspan="9" class="empty">No for repair trucks added yet.</td></tr>';
    return;
  }

  forRepairLocalBody.innerHTML = visible.map(record => {
    const actualIndex = localForRepairTrucks.indexOf(record);
    const isCompleted = /completed/i.test(record.repairStatus || '');
    return `
      <tr>
        <td>${escapeHtml(truncateRecordValue(record.plateNumber, 18))}</td>
        <td>${escapeHtml(truncateRecordValue(record.garageLocation, 28))}</td>
        <td>${escapeHtml(truncateRecordValue(record.repairIssue))}</td>
        <td>${escapeHtml(truncateRecordValue(record.startDate, 18))}</td>
        <td>${escapeHtml(truncateRecordValue(record.estimatedFinishDate, 18))}</td>
        <td>${escapeHtml(truncateRecordValue(record.endDate, 18))}</td>
        <td>${escapeHtml(truncateRecordValue(record.repairStatus, 24))}</td>
        <td>${escapeHtml(truncateRecordValue(record.remarks))}</td>
        <td>
          <div class="change-request-actions">
            ${isCompleted
              ? '<span class="save-status">Completed</span>'
              : `<button class="details-button action-mini-button" type="button" data-for-repair-complete="${actualIndex}">Complete</button>`
            }
            <button class="details-button action-mini-button" type="button" data-for-repair-delete="${actualIndex}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function truncateRecordValue(value, maxLength = 70) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function getStatusBadgeClass(type, value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'status-pending';

  if (/(cancel|reject|declin)/.test(normalized)) return 'status-cancelled';
  if (/unpaid/.test(normalized)) return 'status-unpaid';
  if (/(paid|done|finished|complete)/.test(normalized)) {
    if (/partial/.test(normalized)) return 'status-partial';
    return type === 'payment' ? 'status-paid' : 'status-completed';
  }
  if (/partial/.test(normalized)) return 'status-partial';
  if (/for deposit/.test(normalized)) return 'status-for-deposit';
  if (/(ongoing|in progress|for repair|for payment)/.test(normalized)) return 'status-ongoing';
  if (/(approved|review)/.test(normalized)) return 'status-approved';
  if (/(pending|draft|n\/a|na)/.test(normalized)) return 'status-pending';
  return 'status-pending';
}

function renderStatusBadge(type, value) {
  const text = truncateRecordValue(value || 'Not set', 24);
  return `<span class="status-badge ${getStatusBadgeClass(type, value)}">${escapeHtml(text)}</span>`;
}

function formatDateDisplay(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return truncateRecordValue(text, 24);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function formatDateTimeDisplay(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return truncateRecordValue(text, 32);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function formatPeso(value) {
  const cleaned = cleanMoney(value);
  if (!cleaned) return '';
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return '';
  return `PHP ${formatCurrency(amount)}`;
}

function formatFollowupAmount(value) {
  return formatPeso(value) || 'PHP 0';
}

function getFirstRecordValue(record, keys) {
  for (const key of keys) {
    const value = getRecordValue(record, key);
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function getOriginalTotalCost(record) {
  return getFirstRecordValue(record, ['Original_Total_Cost', 'Original Total Cost', 'Total_Cost', 'Total Cost']);
}

function getFinalCost(record) {
  return getFirstRecordValue(record, ['Final_Cost', 'Final Cost', 'Approved_Cost', 'Approved Cost', 'Total_Cost', 'Total Cost']);
}

function getCostRemarks(record) {
  return getFirstRecordValue(record, ['Cost_Remarks', 'Cost Remarks']);
}

function getMoneyNumber(value) {
  const cleaned = cleanMoney(value);
  if (!cleaned) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function formatMoneyInput(value) {
  const amount = getMoneyNumber(value);
  return amount === null ? '' : String(amount);
}

function buildSavingsLabel(originalValue, finalValue) {
  const original = getMoneyNumber(originalValue);
  const final = getMoneyNumber(finalValue);
  if (original === null || final === null || original === final) return '';
  const difference = Math.abs(original - final);
  return `<span class="cost-delta-label">Difference: PHP ${escapeHtml(formatCurrency(difference))}</span>`;
}

function getCostDeltaDisplay(originalValue, finalValue) {
  const original = getMoneyNumber(originalValue);
  const final = getMoneyNumber(finalValue);
  if (original === null || final === null || original === final) {
    return { text: '', added: false };
  }
  return {
    text: `Difference: PHP ${formatCurrency(Math.abs(original - final))}`,
    added: final > original
  };
}

function normalizeDuplicateText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeDuplicatePlate(value) {
  return String(value || '').replace(/\s+/g, '').trim().toUpperCase();
}

function normalizeDuplicateDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return text.replace(/\s+/g, ' ').toLowerCase();
}

function normalizeDuplicateCost(value) {
  const amount = getMoneyNumber(value);
  return amount === null ? '' : String(Math.round(amount * 100) / 100);
}

function getRowItemOrWorkDone(row) {
  return String(row?.item || row?.workDone || '').trim();
}

function createDuplicateKey(parts) {
  return [
    normalizeDuplicateDate(parts.date),
    normalizeDuplicatePlate(parts.plateNumber),
    normalizeDuplicateText(parts.driver),
    normalizeDuplicateText(parts.itemOrWorkDone),
    normalizeDuplicateCost(parts.totalCost)
  ].join('|');
}

function getParsedRepairDuplicateKey(row, includeDriver = true) {
  return createDuplicateKey({
    date: row.date,
    plateNumber: row.plateNumber,
    driver: includeDriver ? row.driver : '',
    itemOrWorkDone: getRowItemOrWorkDone(row),
    totalCost: row.totalCost
  });
}

function getSavedRepairDuplicateKey(record) {
  return createDuplicateKey({
    date: getRecordValue(record, 'Date_Requested'),
    plateNumber: getRecordValue(record, 'Plate_Number'),
    driver: getRecordValue(record, 'Driver'),
    itemOrWorkDone: getRecordValue(record, 'Repair_Parts') || getRecordValue(record, 'Work_Done'),
    totalCost: getOriginalTotalCost(record) || getRecordValue(record, 'Total_Cost')
  });
}

function hasDuplicateParsedRows(rows) {
  const seen = new Set();
  return rows.some(row => {
    const key = getParsedRepairDuplicateKey(row, false);
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

function findMatchingSavedRecord(row) {
  const key = getParsedRepairDuplicateKey(row, true);
  return savedRepairRecords.find(record => getSavedRepairDuplicateKey(record) === key);
}

function getParsedRowsSignature(rows) {
  return rows.map(row => JSON.stringify({
    requestType: row.requestType || '',
    date: row.date || '',
    dateFinished: row.dateFinished || '',
    plateNumber: row.plateNumber || '',
    driver: row.driver || '',
    item: row.item || '',
    workDone: row.workDone || '',
    quantity: row.quantity || '',
    unitCost: cleanMoney(row.unitCost),
    partsCost: cleanMoney(row.partsCost),
    laborCost: cleanMoney(row.laborCost),
    totalCost: cleanMoney(row.totalCost),
    status: row.status || '',
    repairStatus: row.repairStatus || '',
    paymentStatus: row.paymentStatus || ''
  })).join('\n');
}

function areParsedRowsAlreadySaved(rows) {
  if (!rows.length) return false;
  const signature = getParsedRowsSignature(rows);
  if (savedParsedRequestSignature && signature === savedParsedRequestSignature) return true;
  return rows.every(row => savedParsedRowKeys.has(getParsedRepairDuplicateKey(row, true)));
}

function markParsedRowsSaved(rows) {
  savedParsedRequestSignature = getParsedRowsSignature(rows);
  rows.forEach(row => savedParsedRowKeys.add(getParsedRepairDuplicateKey(row, true)));
  markVisibleParsedRowsSaved();
}

function resetParsedSavedState() {
  savedParsedRequestSignature = '';
  savedParsedRowKeys = new Set();
  if (tableBody) {
    tableBody.querySelectorAll('tr').forEach(row => {
      row.classList.remove('parsed-row-saved');
      row.removeAttribute('data-parsed-saved');
    });
  }
}

function markVisibleParsedRowsSaved() {
  if (!tableBody) return;
  collectTableRows().forEach(row => {
    const key = getParsedRepairDuplicateKey(row, true);
    if (!savedParsedRowKeys.has(key)) return;
    const tableRow = Array.from(tableBody.querySelectorAll('tr')).find(tr => {
      const checkbox = tr.querySelector('[data-field="selected"]');
      if (!checkbox) return false;
      const cells = tr.querySelectorAll('td');
      return cells.length === 24 &&
        normalizeDuplicateDate(cells[2].textContent.trim()) === normalizeDuplicateDate(row.date) &&
        normalizeDuplicatePlate(cells[5].textContent.trim()) === normalizeDuplicatePlate(row.plateNumber) &&
        normalizeDuplicateText(cells[7].textContent.trim()) === normalizeDuplicateText(row.driver) &&
        normalizeDuplicateCost(cells[16].textContent.trim()) === normalizeDuplicateCost(row.totalCost);
    });
    if (tableRow) {
      tableRow.classList.add('parsed-row-saved');
      tableRow.dataset.parsedSaved = 'true';
    }
  });
}

function confirmPossibleSavedDuplicates(rows) {
  const approvedRows = [];
  rows.forEach(row => {
    const duplicate = findMatchingSavedRecord(row);
    if (!duplicate) {
      approvedRows.push(row);
      return;
    }

    const amount = formatPeso(row.totalCost) || 'PHP 0';
    const item = getRowItemOrWorkDone(row) || '-';
    const plate = row.plateNumber || '-';
    const saveAnyway = window.confirm(`Possible duplicate found for ${plate} - ${item} - ${amount}. Save anyway?`);
    if (saveAnyway) approvedRows.push(row);
  });
  return approvedRows;
}

function getTypeBadgeClass(value) {
  const normalized = String(value || '').toLowerCase();
  if (/labor/.test(normalized)) return 'type-labor';
  if (/completed/.test(normalized)) return 'type-completed';
  if (/monitoring/.test(normalized)) return 'type-monitoring';
  if (/equipment|safety/.test(normalized)) return 'type-equipment';
  return 'type-parts';
}

function getCategoryBadgeClass(value) {
  const normalized = String(value || '').toLowerCase();
  if (/labor/.test(normalized)) return 'category-labor';
  if (/equipment|safety/.test(normalized)) return 'category-equipment';
  return 'category-repair-parts';
}

function renderTypeBadge(value) {
  const text = truncateRecordValue(value || 'Request', 34);
  return `<span class="type-badge ${getTypeBadgeClass(value)}">${escapeHtml(text)}</span>`;
}

function renderCategoryBadge(value) {
  const text = truncateRecordValue(value || 'Uncategorized', 28);
  return `<span class="category-badge ${getCategoryBadgeClass(value)}">${escapeHtml(text)}</span>`;
}

function renderClampedCell(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return `<span class="cell-clamp" title="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
}

function getVisibleSavedRecordCheckboxes() {
  if (!savedRecordsBody) return [];
  return Array.from(savedRecordsBody.querySelectorAll('.savedRecordCheckbox'));
}

function setVisibleSavedRecordSelection(checked) {
  getVisibleSavedRecordCheckboxes().forEach(checkbox => {
    checkbox.checked = checked;
  });
  if (savedRecordsSelectAll) savedRecordsSelectAll.checked = checked && getVisibleSavedRecordCheckboxes().length > 0;
}

function getSelectedSavedRecords() {
  return getVisibleSavedRecordCheckboxes()
    .filter(checkbox => checkbox.checked)
    .map(checkbox => savedRepairRecords[Number(checkbox.dataset.recordIndex)])
    .filter(Boolean);
}

function getFollowupItemText(record) {
  const item = String(getRecordValue(record, 'Repair_Parts') || '').trim();
  const workDone = String(getRecordValue(record, 'Work_Done') || '').trim();
  return item || workDone || '-';
}

function buildViberFollowupMessage(records) {
  const lines = ['Good day po.', '', 'For follow-up po ng repair/parts request:', ''];
  records.forEach((record, index) => {
    const originalCost = getOriginalTotalCost(record);
    const finalCost = getFinalCost(record);
    const originalAmount = getMoneyNumber(originalCost);
    const finalAmount = getMoneyNumber(finalCost);
    lines.push(`${index + 1}. Plate: ${getRecordValue(record, 'Plate_Number') || '-'}`);
    lines.push(`Driver: ${getRecordValue(record, 'Driver') || '-'}`);
    lines.push(`Request Type: ${getRecordValue(record, 'Request_Type') || '-'}`);
    lines.push(`Item/Work Done: ${getFollowupItemText(record)}`);
    lines.push(`Amount: ${formatFollowupAmount(finalCost)}`);
    if (originalAmount !== null && finalAmount !== null && originalAmount !== finalAmount) {
      lines.push(`Original Amount: ${formatFollowupAmount(originalCost)}`);
    }
    if (getRecordValue(record, 'Payee')) lines.push(`Payee: ${getRecordValue(record, 'Payee')}`);
    lines.push(`Repair Status: ${getRecordValue(record, 'Repair_Status') || '-'}`);
    lines.push(`Payment Status: ${getRecordValue(record, 'Payment_Status') || '-'}`);
    lines.push(`Remarks: ${getRecordValue(record, 'Remarks') || '-'}`);
    lines.push('');
  });
  lines.push('Kindly update po if done, pending, paid, or for deposit. Thank you.');
  return lines.join('\n');
}

function generateViberFollowupMessage() {
  const selectedRecords = getSelectedSavedRecords();
  if (!selectedRecords.length) {
    alert('Please select at least one repair record.');
    return;
  }
  if (!viberFollowupPanel || !viberFollowupOutput) return;
  viberFollowupOutput.value = buildViberFollowupMessage(selectedRecords);
  viberFollowupOutput.readOnly = false;
  viberFollowupPanel.hidden = false;
  if (editViberFollowupBtn) editViberFollowupBtn.textContent = 'Done Editing';
  if (copyViberFollowupStatus) copyViberFollowupStatus.textContent = '';
}

function closeViberFollowupPanel() {
  if (viberFollowupPanel) viberFollowupPanel.hidden = true;
  if (copyViberFollowupStatus) copyViberFollowupStatus.textContent = '';
}

function clearViberFollowupMessage() {
  if (viberFollowupOutput) viberFollowupOutput.value = '';
  if (copyViberFollowupStatus) copyViberFollowupStatus.textContent = '';
}

function toggleViberFollowupEditing() {
  if (!viberFollowupOutput || !editViberFollowupBtn) return;
  viberFollowupOutput.readOnly = !viberFollowupOutput.readOnly;
  editViberFollowupBtn.textContent = viberFollowupOutput.readOnly ? 'Edit Message' : 'Done Editing';
  if (!viberFollowupOutput.readOnly) viberFollowupOutput.focus();
}

async function copyViberFollowupMessage() {
  if (!viberFollowupOutput) return;
  const text = viberFollowupOutput.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    viberFollowupOutput.select();
    document.execCommand('copy');
  }
  if (copyViberFollowupStatus) copyViberFollowupStatus.textContent = 'Message copied.';
}

function isPaymentStatusEditable(record) {
  return ['Parts Request', 'Equipment Request', 'Labor Payment Request'].includes(String(getRecordValue(record, 'Request_Type')));
}

function buildStatusOptions(options, currentValue) {
  return options.map(option =>
    `<option value="${escapeHtml(option)}"${String(currentValue) === option ? ' selected' : ''}>${escapeHtml(option)}</option>`
  ).join('');
}

function buildPaymentStatusActions(record, recordIndex) {
  const hasPaymentUpdate = getRepairPaymentValue(record, 'hasPaymentUpdate');
  const updatedAt = getRepairPaymentValue(record, 'updatedAt');
  const updatedTitle = updatedAt ? `Payment / final cost updated: ${formatDateTimeDisplay(updatedAt)}` : 'Payment / final cost updated';
  return `
    <div class="change-request-actions">
      <button class="details-button action-mini-button" type="button" data-record-index="${recordIndex}">View</button>
      <button class="payment-cost-button action-mini-button" type="button" data-payment-cost="${recordIndex}">Payment</button>
      <div class="more-actions-wrap">
        <button class="more-actions-button action-mini-button" type="button" data-more-actions="${recordIndex}" aria-expanded="false">More</button>
        <div class="more-actions-menu" data-more-menu="${recordIndex}" hidden>
          <button class="request-edit-button" type="button" data-change-request="edit" data-record-index="${recordIndex}">Request Edit</button>
          <button class="request-delete-button" type="button" data-change-request="delete" data-record-index="${recordIndex}">Delete</button>
        </div>
      </div>
      ${hasPaymentUpdate ? `<span class="payment-updated-indicator" title="${escapeHtml(updatedTitle)}">Updated</span>` : ''}
      <span class="row-status-message" data-row-status="${recordIndex}"></span>
    </div>
  `;
}

function readRepairChangeRequests() {
  try {
    const raw = localStorage.getItem(REPAIR_CHANGE_REQUESTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function readRepairDeletedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(REPAIR_DELETED_IDS_KEY) || '[]'));
  } catch (error) {
    return new Set();
  }
}

function addRepairDeletedId(id) {
  const ids = readRepairDeletedIds();
  ids.add(String(id));
  localStorage.setItem(REPAIR_DELETED_IDS_KEY, JSON.stringify([...ids]));
}

function readRepairPaymentUpdates() {
  try {
    const raw = localStorage.getItem(REPAIR_PAYMENT_UPDATES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function writeRepairPaymentUpdates(updates) {
  localStorage.setItem(REPAIR_PAYMENT_UPDATES_KEY, JSON.stringify(updates));
}

function getRepairRecordId(record) {
  return String(getRecordValue(record, 'Request_ID') || getSavedRepairDuplicateKey(record) || '').trim();
}

function getRepairPaymentPatch(record) {
  const recordId = getRepairRecordId(record);
  const updates = readRepairPaymentUpdates();
  return recordId ? updates[recordId] || {} : {};
}

function getRepairPaymentValue(record, field) {
  const patch = getRepairPaymentPatch(record);
  const fieldMap = {
    finalCost: ['Final_Cost', 'Final Cost', 'Approved_Cost', 'Approved Cost', 'Total_Cost', 'Total Cost'],
    paymentStatus: ['Payment_Status', 'paymentStatus'],
    paymentDate: ['Payment_Date', 'paymentDate', 'Paid_At', 'paidAt'],
    paymentReference: ['Payment_Reference', 'paymentReference', 'Proof_Of_Payment', 'proofOfPayment'],
    paymentNotes: ['Payment_Notes', 'paymentNotes'],
    updatedAt: ['Updated_At', 'updatedAt'],
    updatedBy: ['Updated_By', 'updatedBy'],
    hasPaymentUpdate: ['hasPaymentUpdate']
  };
  if (field === 'hasPaymentUpdate') return Boolean(patch.hasPaymentUpdate || record?.hasPaymentUpdate);
  if (patch[field] !== undefined && patch[field] !== null && String(patch[field]).trim() !== '') return patch[field];
  const keys = fieldMap[field] || [];
  for (const key of keys) {
    const value = getRecordValue(record, key);
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  if (field === 'paymentStatus') return 'Unpaid';
  if (field === 'finalCost') return getOriginalTotalCost(record) || getRecordValue(record, 'Total_Cost');
  return '';
}

function applyRepairPaymentPatchToRecord(record, patch) {
  record.Final_Cost = cleanMoney(patch.finalCost) || cleanMoney(getOriginalTotalCost(record) || getRecordValue(record, 'Total_Cost'));
  record.Payment_Status = patch.paymentStatus || 'Unpaid';
  record.Payment_Date = patch.paymentDate || '';
  record.Payment_Reference = patch.paymentReference || '';
  record.Payment_Notes = patch.paymentNotes || '';
  record.Updated_At = patch.updatedAt || new Date().toISOString();
  record.Updated_By = patch.updatedBy || 'Local User';
  record.hasPaymentUpdate = Boolean(patch.hasPaymentUpdate);
}

function saveRepairChangeRequest(record, requestType, reason) {
  const requests = readRepairChangeRequests();
  const now = new Date().toISOString();
  const normalizedType = requestType === 'delete' ? 'Delete' : 'Edit';
  const request = {
    id: `repair_change_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    repairRecordId: getRepairRecordId(record),
    requestType: normalizedType,
    reason: String(reason || '').trim(),
    requestedAt: now,
    requestedBy: 'Web User',
    approvalStatus: 'Pending Owner Approval',
    approvedBy: '',
    approvedAt: '',
    remarks: '',
    requestSnapshot: { ...record }
  };
  localStorage.setItem(REPAIR_CHANGE_REQUESTS_KEY, JSON.stringify([request].concat(requests)));
  return request;
}

function requestSavedRepairChange(recordIndex, requestType, button) {
  const record = savedRepairRecords[recordIndex];
  if (!record || !recordsStatus) return;
  const reason = window.prompt('Reason for edit request? This will not change the saved repair record.');
  if (reason === null) return;
  saveRepairChangeRequest(record, requestType, reason);
  const rowStatus = button?.closest('.change-request-actions')?.querySelector(`[data-row-status="${recordIndex}"]`);
  if (rowStatus) rowStatus.textContent = 'Edit request saved';
  recordsStatus.textContent = `Edit request saved to ${REPAIR_CHANGE_REQUESTS_KEY}. Saved record was not changed.`;
}

async function deleteRepairRecordLocal(recordIndex) {
  const record = savedRepairRecords[recordIndex];
  if (!record || !recordsStatus) return;
  const recordId = getRepairRecordId(record);
  if (!recordId) {
    recordsStatus.textContent = 'Cannot delete: record has no ID.';
    return;
  }
  if (!window.confirm('Delete this repair request? This will hide it but keep a log.')) return;
  const reason = window.prompt('Reason for delete? (optional)') ?? '';

  // Save locally first — row disappears immediately
  addRepairDeletedId(recordId);
  recordsStatus.textContent = 'Deleted locally. Syncing delete to cloud...';
  renderSavedRecords();

  // Sync to cloud (no-cors — success = no network error)
  try {
    await fetch(REPAIR_WEB_APP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'deleteRepairRequest',
        requestId: recordId,
        deletedBy: 'Web User',
        deleteReason: reason
      })
    });
    console.log('[Repair] Delete sync success:', recordId);
    recordsStatus.textContent = 'Deleted and logged in cloud.';
  } catch (error) {
    console.error('[Repair] Delete sync failed:', error);
    recordsStatus.textContent = 'Deleted locally. Cloud sync failed.';
  }
}

function updateRecordsSummary(records) {
  const totalCost = records.reduce((sum, record) => {
    const value = Number(cleanMoney(getRepairPaymentValue(record, 'finalCost')));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  if (recordsCount) recordsCount.textContent = String(records.length);
  if (recordsTotalCost) recordsTotalCost.textContent = `PHP ${formatCurrency(totalCost)}`;
}

function isLikelyPlateNumber(value) {
  const text = String(value || '').trim().toUpperCase();
  return !text || /^[A-Z]{2,4}\s?\d{3,4}$/.test(text);
}

function hasRawMessageText(value) {
  const text = String(value || '');
  return /\[[^\]]+\]\s*[^:]+:|Driver\s*[:;]|Helper\s*[:;]|Total\s*:/i.test(text);
}

function hasTimestampText(value) {
  return /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{1,2}:\d{2}\s*(?:AM|PM)\b/i.test(String(value || ''));
}

function hasLongPaymentText(value) {
  const text = String(value || '').trim();
  return text.length > 60 || /please prepare|payment|total amount|repair monitoring summary/i.test(text);
}

function isMisalignedSavedRecord(record) {
  return !isLikelyPlateNumber(getRecordValue(record, 'Plate_Number')) ||
    hasRawMessageText(getRecordValue(record, 'Status')) ||
    hasTimestampText(getRecordValue(record, 'Repair_Status')) ||
    hasLongPaymentText(getRecordValue(record, 'Payment_Status'));
}

function normalizeStatusFilterValue(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDateForFilter(dateValue) {
  const raw = String(dateValue || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function getRepairRecordDateByType(record, dateType = 'dateRequested') {
  const type = dateType || 'dateRequested';
  const dateMap = {
    dateRequested: ['dateRequested', 'Date_Requested', 'date', 'requestDate'],
    startDate: ['startDate', 'Start_Date'],
    endDate: ['endDate', 'End_Date', 'dateFinished', 'Date_Finished'],
    paymentDate: ['paymentDate', 'Payment_Date', 'paidAt', 'Paid_At'],
    createdAt: ['createdAt', 'Created_At', 'Timestamp']
  };
  const keys = dateMap[type] || dateMap.dateRequested;

  for (const key of keys) {
    const value = record?.[key] ?? getRecordValue(record, key);
    const normalized = normalizeDateForFilter(value);
    if (normalized) return normalized;
  }
  return '';
}

function filterSavedRecords(records) {
  const plate = (recordsPlateFilter?.value || '').trim().toLowerCase();
  const requestType = recordsTypeFilter?.value || '';
  const repairStatus = normalizeStatusFilterValue(recordsRepairStatusFilter?.value || '');
  const paymentStatus = normalizeStatusFilterValue(recordsPaymentStatusFilter?.value || '');
  const approvalStatus = normalizeStatusFilterValue(recordsApprovalStatusFilter?.value || '');
  const dateType = recordsDateTypeFilter?.value || 'dateRequested';
  const dateFrom = normalizeDateForFilter(recordsDateFromFilter?.value || '');
  const dateTo = normalizeDateForFilter(recordsDateToFilter?.value || '');
  const dateFilterActive = Boolean(dateFrom || dateTo);

  const deletedIds = readRepairDeletedIds();
  const alignedRecords = records.filter(record =>
    !isMisalignedSavedRecord(record) &&
    !deletedIds.has(getRepairRecordId(record))
  );
  hiddenMisalignedRecordCount = records.length - alignedRecords.length;

  return alignedRecords.filter(record => {
    const recordPlate = String(getRecordValue(record, 'Plate_Number')).toLowerCase();
    const recordType = String(getRecordValue(record, 'Request_Type'));
    const recordRepairStatus = String(getRecordValue(record, 'Repair_Status'));
    const recordPaymentStatus = String(getRepairPaymentValue(record, 'paymentStatus'));
    const recordApprovalStatus = String(getRecordValue(record, 'Approval_Status') || getRecordValue(record, 'approvalStatus') || getRecordValue(record, 'Status'));
    const normalizedRepairStatus = normalizeStatusFilterValue(recordRepairStatus);
    const normalizedPaymentStatus = normalizeStatusFilterValue(recordPaymentStatus);
    const normalizedApprovalStatus = normalizeStatusFilterValue(recordApprovalStatus);
    const recordDate = getRepairRecordDateByType(record, dateType);
    const matchesQuickFilter =
      !savedRecordsQuickFilter ||
      (savedRecordsQuickFilter === 'unpaid' && normalizedPaymentStatus === 'unpaid') ||
      (savedRecordsQuickFilter === 'forDeposit' && normalizedPaymentStatus === 'for deposit') ||
      (savedRecordsQuickFilter === 'notFinished' && !['done', 'completed', 'cancelled'].includes(normalizedRepairStatus)) ||
      (savedRecordsQuickFilter === 'completed' && ['done', 'completed'].includes(normalizedRepairStatus));

    return (!plate || recordPlate.includes(plate)) &&
      (!requestType || recordType === requestType) &&
      (!repairStatus || normalizedRepairStatus === repairStatus) &&
      (!paymentStatus || normalizedPaymentStatus === paymentStatus) &&
      (!approvalStatus || normalizedApprovalStatus === approvalStatus) &&
      (!dateFilterActive || (recordDate && (!dateFrom || recordDate >= dateFrom) && (!dateTo || recordDate <= dateTo))) &&
      matchesQuickFilter;
  });
}

function setQuickFilterActiveState() {
  recordsQuickFilterButtons.forEach(button => {
    const quickFilter = button.dataset.recordsQuickFilter || '';
    button.classList.toggle('active', quickFilter === savedRecordsQuickFilter);
  });
}

function clearSavedRecordFilters() {
  if (recordsPlateGroupFilter) recordsPlateGroupFilter.value = '';
  if (recordsPlateFilter) recordsPlateFilter.value = '';
  populateRepairPlateSelect('records');
  if (recordsTypeFilter) recordsTypeFilter.value = '';
  if (recordsRepairStatusFilter) recordsRepairStatusFilter.value = '';
  if (recordsPaymentStatusFilter) recordsPaymentStatusFilter.value = '';
  if (recordsApprovalStatusFilter) recordsApprovalStatusFilter.value = '';
  if (recordsDateTypeFilter) recordsDateTypeFilter.value = '';
  if (recordsDateFromFilter) recordsDateFromFilter.value = '';
  if (recordsDateToFilter) recordsDateToFilter.value = '';
  savedRecordsQuickFilter = '';
  setQuickFilterActiveState();
  renderSavedRecords();
}

function applySavedRecordsQuickFilter(filter) {
  if (filter === 'clear') {
    clearSavedRecordFilters();
    return;
  }

  savedRecordsQuickFilter = filter;
  if (filter === 'unpaid') {
    if (recordsRepairStatusFilter) recordsRepairStatusFilter.value = '';
    if (recordsPaymentStatusFilter) recordsPaymentStatusFilter.value = 'Unpaid';
  } else if (filter === 'forDeposit') {
    if (recordsRepairStatusFilter) recordsRepairStatusFilter.value = '';
    if (recordsPaymentStatusFilter) recordsPaymentStatusFilter.value = 'For Deposit';
  } else if (filter === 'notFinished') {
    if (recordsRepairStatusFilter) recordsRepairStatusFilter.value = '';
    if (recordsPaymentStatusFilter) recordsPaymentStatusFilter.value = '';
    savedRecordsQuickFilter = 'notFinished';
  } else if (filter === 'completed') {
    if (recordsRepairStatusFilter) recordsRepairStatusFilter.value = '';
    if (recordsPaymentStatusFilter) recordsPaymentStatusFilter.value = '';
    savedRecordsQuickFilter = 'completed';
  }

  setQuickFilterActiveState();
  renderSavedRecords();
}

function renderSavedRecords() {
  if (!savedRecordsBody) return;
  const records = filterSavedRecords(savedRepairRecords);
  updateRecordsSummary(records);
  if (savedRecordsSelectAll) savedRecordsSelectAll.checked = false;
  if (recordsStatus && hiddenMisalignedRecordCount > 0) {
    recordsStatus.textContent = 'Some old test rows may be hidden because they do not match the current VNS_Repair_Master format.';
  }

  if (!records.length) {
    savedRecordsBody.innerHTML = '<tr><td colspan="22" class="empty">No saved repair records found.</td></tr>';
    return;
  }

  savedRecordsBody.innerHTML = records.map(record => {
    const recordIndex = savedRepairRecords.indexOf(record);
    const recordId = getRecordValue(record, 'Request_ID');
    const plateNumber = truncateRecordValue(getRecordValue(record, 'Plate_Number'), 18);
    const truckType = getRecordValue(record, 'Truck_Type') || getRecordValue(record, 'Truck Type') || getRecordValue(record, 'Body_Type');
    const originalCost = getOriginalTotalCost(record);
    const finalCost = getRepairPaymentValue(record, 'finalCost') || originalCost;
    const unitCost = getRecordValue(record, 'Unit_Cost') || getRecordValue(record, 'unitCost');
    const approvalStatus = getRecordValue(record, 'Approval_Status') || getRecordValue(record, 'approvalStatus') || getRecordValue(record, 'Status');
    const paymentStatus = getRepairPaymentValue(record, 'paymentStatus');
    const paymentDate = getRepairPaymentValue(record, 'paymentDate');
    const paymentReference = getRepairPaymentValue(record, 'paymentReference');
    const hasPaymentUpdate = getRepairPaymentValue(record, 'hasPaymentUpdate');
    return `
    <tr class="${hasPaymentUpdate ? 'has-payment-update' : ''}">
      <td class="selection-cell"><input class="savedRecordCheckbox" type="checkbox" data-record-index="${recordIndex}" aria-label="Select saved repair record"></td>
      <td class="record-id-cell cell-muted" title="${escapeHtml(recordId)}">${escapeHtml(truncateRecordValue(recordId, 30))}</td>
      <td>${escapeHtml(formatDateDisplay(getRecordValue(record, 'Date_Requested')))}</td>
      <td class="cell-plate">${escapeHtml(plateNumber)}</td>
      <td>${escapeHtml(truncateRecordValue(truckType, 24))}</td>
      <td>${renderTypeBadge(getRecordValue(record, 'Request_Type'))}</td>
      <td>${escapeHtml(truncateRecordValue(getRecordValue(record, 'Driver'), 28))}</td>
      <td>${escapeHtml(truncateRecordValue(getRecordValue(record, 'Payee'), 28))}</td>
      <td>${renderCategoryBadge(getRecordValue(record, 'Category'))}</td>
      <td>${renderClampedCell(getRecordValue(record, 'Repair_Parts'))}</td>
      <td>${renderClampedCell(getRecordValue(record, 'Work_Done'))}</td>
      <td>${escapeHtml(truncateRecordValue(getRecordValue(record, 'Quantity'), 18))}</td>
      <td class="cell-money">${escapeHtml(formatPeso(unitCost))}</td>
      <td class="cell-money">${escapeHtml(formatPeso(originalCost))}</td>
      <td class="cell-money">${escapeHtml(formatPeso(finalCost))}</td>
      <td>${renderStatusBadge('payment', paymentStatus)}</td>
      <td>${escapeHtml(formatDateDisplay(paymentDate))}</td>
      <td>${escapeHtml(truncateRecordValue(paymentReference, 32))}</td>
      <td>${renderStatusBadge('repair', getRecordValue(record, 'Repair_Status'))}</td>
      <td>${renderStatusBadge('approval', approvalStatus)}</td>
      <td>${renderClampedCell(getRecordValue(record, 'Remarks'))}</td>
      <td class="actions-cell">${buildPaymentStatusActions(record, recordIndex)}</td>
    </tr>
  `;
  }).join('');
}

async function loadSavedRepairRecords() {
  if (!savedRecordsBody || !recordsStatus) return;
  recordsStatus.textContent = 'Loading saved records...';
  updateRecordsSummary([]);
  savedRecordsBody.innerHTML = '<tr><td colspan="22" class="empty">Loading saved repair records...</td></tr>';

  try {
    const response = await fetch(`${REPAIR_WEB_APP_URL}?action=list`);
    const data = await response.json();
    savedRepairRecords = normalizeSavedRecords(data);
    renderSavedRecords();
    if (!hiddenMisalignedRecordCount) {
      recordsStatus.textContent = `Loaded ${savedRepairRecords.length} saved record${savedRepairRecords.length === 1 ? '' : 's'}.`;
    }
  } catch (error) {
    savedRepairRecords = [];
    updateRecordsSummary([]);
    savedRecordsBody.innerHTML = '<tr><td colspan="22" class="empty">Unable to load saved records. Please try again.</td></tr>';
    recordsStatus.textContent = 'Error loading saved records.';
  }
}

async function updateSavedRecordStatus(recordIndex, button) {
  const record = savedRepairRecords[recordIndex];
  if (!record || !recordsStatus) return;

  const row = button.closest('tr');
  const values = getStatusActionValues(row);
  const rowStatus = row?.querySelector(`[data-row-status="${recordIndex}"]`);
  const payload = buildStatusUpdatePayload(record, values);

  button.disabled = true;
  recordsStatus.textContent = 'Updating status...';
  if (rowStatus) rowStatus.textContent = 'Saving...';

  try {
    await postStatusUpdate(payload);
    applyStatusUpdateLocally(record, values);
    renderSavedRecords();
    recordsStatus.textContent = 'Status updated';
  } catch (error) {
    recordsStatus.textContent = 'Error updating status. Please try again.';
    if (rowStatus) rowStatus.textContent = 'Update failed';
  } finally {
    button.disabled = false;
  }
}

function getStatusActionValues(row) {
  return {
    repairStatus: row?.querySelector('[data-status-field="repairStatus"]')?.value || 'Pending',
    paymentStatus: row?.querySelector('[data-status-field="paymentStatus"]')?.value || 'Unpaid',
    remarks: row?.querySelector('[data-status-field="remarks"]')?.value.trim() || '',
    finalCost: row?.querySelector('[data-status-field="finalCost"]')?.value.trim() || '',
    costRemarks: row?.querySelector('[data-status-field="costRemarks"]')?.value.trim() || '',
    payee: row?.querySelector('[data-status-field="payee"]')?.value.trim() || ''
  };
}

function hasStatusActionChanges(record, values) {
  const currentFinalCost = getMoneyNumber(getFinalCost(record) || getOriginalTotalCost(record));
  const nextFinalCost = getMoneyNumber(values.finalCost);
  return values.repairStatus !== String(getRecordValue(record, 'Repair_Status') || 'Pending') ||
    values.paymentStatus !== String(getRecordValue(record, 'Payment_Status') || 'Unpaid') ||
    values.remarks !== String(getRecordValue(record, 'Remarks') || '') ||
    nextFinalCost !== currentFinalCost ||
    values.costRemarks !== String(getCostRemarks(record) || '') ||
    values.payee !== String(getRecordValue(record, 'Payee') || '');
}

function applyStatusUpdateLocally(record, values) {
  const originalCost = getOriginalTotalCost(record) || getRecordValue(record, 'Total_Cost');
  const finalCost = cleanMoney(values.finalCost) || cleanMoney(originalCost);
  record.Original_Total_Cost = cleanMoney(originalCost);
  record.Final_Cost = finalCost;
  record.Repair_Status = values.repairStatus;
  record.Payment_Status = values.paymentStatus;
  record.Remarks = values.remarks;
  record.Cost_Remarks = values.costRemarks;
  record.Payee = values.payee;
}

function updateStatusActionDirtyState(actions) {
  if (!actions) return;
  const recordIndex = Number(actions.querySelector('[data-record-index]')?.dataset.recordIndex);
  const record = savedRepairRecords[recordIndex];
  if (!record) return;
  const row = actions.closest('tr');
  const values = getStatusActionValues(row);
  const rowStatus = actions.querySelector(`[data-row-status="${recordIndex}"]`);
  const costDelta = actions.querySelector(`[data-cost-delta="${recordIndex}"]`);
  const costDeltaDisplay = getCostDeltaDisplay(getOriginalTotalCost(record), values.finalCost || getFinalCost(record));
  if (costDelta) {
    costDelta.textContent = costDeltaDisplay.text;
    costDelta.hidden = !costDeltaDisplay.text;
    costDelta.classList.toggle('added', costDeltaDisplay.added);
  }
  const isDirty = hasStatusActionChanges(record, values);
  row?.classList.toggle('has-unsaved-status', isDirty);
  if (rowStatus) rowStatus.textContent = isDirty ? 'Unsaved changes' : '';
}

function buildStatusUpdatePayload(record, values) {
  const originalCost = cleanMoney(getOriginalTotalCost(record) || getRecordValue(record, 'Total_Cost'));
  const finalCost = cleanMoney(values.finalCost) || originalCost;
  return {
    action: 'updateStatus',
    Request_ID: getRecordValue(record, 'Request_ID'),
    Status: getRecordValue(record, 'Status'),
    Original_Total_Cost: originalCost,
    originalTotalCost: originalCost,
    Final_Cost: finalCost,
    finalCost,
    Approved_Cost: finalCost,
    approvedCost: finalCost,
    Repair_Status: values.repairStatus,
    Payment_Status: values.paymentStatus,
    status: getRecordValue(record, 'Status'),
    repairStatus: values.repairStatus,
    paymentStatus: values.paymentStatus,
    Remarks: values.remarks,
    remarks: values.remarks,
    Cost_Remarks: values.costRemarks,
    costRemarks: values.costRemarks,
    Payee: values.payee,
    payee: values.payee,
    Updated_By: 'Web User'
  };
}

async function postStatusUpdate(payload) {
  await fetch(REPAIR_WEB_APP_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });
}

async function saveChangedPaymentStatuses() {
  if (!savedRecordsBody || !recordsStatus) return;
  const changedUpdates = [];

  savedRecordsBody.querySelectorAll('.status-actions').forEach(actions => {
    const recordIndex = Number(actions.querySelector('[data-record-index]')?.dataset.recordIndex);
    const record = savedRepairRecords[recordIndex];
    if (!record) return;

    const row = actions.closest('tr');
    const values = getStatusActionValues(row);
    if (!hasStatusActionChanges(record, values)) return;
    changedUpdates.push({ record, values, payload: buildStatusUpdatePayload(record, values) });
  });

  if (!changedUpdates.length) {
    recordsStatus.textContent = 'No status changes to save.';
    return;
  }

  if (saveStatusChangesButton) saveStatusChangesButton.disabled = true;
  recordsStatus.textContent = 'Saving status changes...';

  try {
    await Promise.all(changedUpdates.map(update => postStatusUpdate(update.payload)));
    changedUpdates.forEach(update => applyStatusUpdateLocally(update.record, update.values));
    renderSavedRecords();
    recordsStatus.textContent = 'Status changes saved.';
  } catch (error) {
    recordsStatus.textContent = 'Error saving status changes. Please try again.';
  } finally {
    if (saveStatusChangesButton) saveStatusChangesButton.disabled = false;
  }
}

function buildDetailBlock(label, value) {
  const text = String(value || '').trim();
  const displayValue = text ? escapeHtml(text) : '<span class="muted-detail">Not provided</span>';
  return `
    <div class="detail-block">
      <h3>${escapeHtml(label)}</h3>
      <pre>${displayValue}</pre>
    </div>
  `;
}

function showRecordDetails(record) {
  if (!recordDetailsPanel || !recordDetailsContent) return;
  const updatedAt = getRepairPaymentValue(record, 'updatedAt');
  const updatedBy = getRepairPaymentValue(record, 'updatedBy');
  const detailBlocks = [
    buildDetailBlock('Original Cost', formatPeso(getOriginalTotalCost(record) || getRecordValue(record, 'Total_Cost'))),
    buildDetailBlock('Final Cost', formatPeso(getRepairPaymentValue(record, 'finalCost'))),
    buildDetailBlock('Payment Status', getRepairPaymentValue(record, 'paymentStatus')),
    buildDetailBlock('Payment Date', formatDateDisplay(getRepairPaymentValue(record, 'paymentDate'))),
    buildDetailBlock('Payment Reference', getRepairPaymentValue(record, 'paymentReference')),
    buildDetailBlock('Payee', getRecordValue(record, 'Payee')),
    buildDetailBlock('Original Message', getRecordValue(record, 'Source_Message')),
    buildDetailBlock('Payment Message', getRecordValue(record, 'Payment_Message')),
    buildDetailBlock('Receipt Link', getRecordValue(record, 'Receipt_Link')),
    buildDetailBlock('Photo Link', getRecordValue(record, 'Photo_Link')),
    buildDetailBlock('Proof Of Payment', getRecordValue(record, 'Proof_Of_Payment'))
  ];
  if (updatedAt) detailBlocks.push(buildDetailBlock('Updated At', formatDateTimeDisplay(updatedAt)));
  if (updatedBy) detailBlocks.push(buildDetailBlock('Updated By', updatedBy));
  recordDetailsContent.innerHTML = detailBlocks.join('');
  recordDetailsPanel.hidden = false;
}

function hidePaymentUpdateModal() {
  if (paymentUpdatePanel) paymentUpdatePanel.hidden = true;
  if (paymentUpdateStatus) paymentUpdateStatus.textContent = '';
}

function showPaymentUpdateModal(recordIndex) {
  const record = savedRepairRecords[recordIndex];
  if (!record || !paymentUpdatePanel || !paymentUpdateForm) return;
  const item = getRecordValue(record, 'Repair_Parts') || getRecordValue(record, 'Work_Done') || '';
  if (paymentRecordIndex) paymentRecordIndex.value = String(recordIndex);
  if (paymentPlateNumber) paymentPlateNumber.value = getRecordValue(record, 'Plate_Number') || '';
  if (paymentItemWork) paymentItemWork.value = String(item || '').replace(/\s+/g, ' ').trim();
  if (paymentOriginalTotal) paymentOriginalTotal.value = formatPeso(getOriginalTotalCost(record) || getRecordValue(record, 'Total_Cost')) || 'PHP 0';
  if (paymentFinalCost) paymentFinalCost.value = formatMoneyInput(getRepairPaymentValue(record, 'finalCost') || getOriginalTotalCost(record));
  if (paymentStatusField) paymentStatusField.value = getRepairPaymentValue(record, 'paymentStatus') === 'Paid' ? 'Paid' : 'Unpaid';
  if (paymentDateField) paymentDateField.value = normalizeDateForFilter(getRepairPaymentValue(record, 'paymentDate'));
  if (paymentReferenceField) paymentReferenceField.value = getRepairPaymentValue(record, 'paymentReference') || '';
  if (paymentNotesField) paymentNotesField.value = getRepairPaymentValue(record, 'paymentNotes') || '';
  if (paymentUpdateStatus) paymentUpdateStatus.textContent = '';
  paymentUpdatePanel.hidden = false;
}

function savePaymentUpdate(event) {
  event.preventDefault();
  const recordIndex = Number(paymentRecordIndex?.value);
  const record = savedRepairRecords[recordIndex];
  if (!record || !recordsStatus) return;
  const recordId = getRepairRecordId(record);
  if (!recordId) {
    if (paymentUpdateStatus) paymentUpdateStatus.textContent = 'Cannot save payment info because this record has no ID.';
    return;
  }

  const originalCost = cleanMoney(getOriginalTotalCost(record) || getRecordValue(record, 'Total_Cost'));
  const finalCost = cleanMoney(paymentFinalCost?.value) || originalCost;
  const oldValues = {
    finalCost: cleanMoney(getRepairPaymentValue(record, 'finalCost') || originalCost),
    paymentStatus: String(getRepairPaymentValue(record, 'paymentStatus') || 'Unpaid'),
    paymentDate: normalizeDateForFilter(getRepairPaymentValue(record, 'paymentDate') || ''),
    paymentReference: String(getRepairPaymentValue(record, 'paymentReference') || '').trim(),
    paymentNotes: String(getRepairPaymentValue(record, 'paymentNotes') || '').trim()
  };
  const newValues = {
    finalCost,
    paymentStatus: paymentStatusField?.value === 'Paid' ? 'Paid' : 'Unpaid',
    paymentDate: paymentDateField?.value || '',
    paymentReference: paymentReferenceField?.value.trim() || '',
    paymentNotes: paymentNotesField?.value.trim() || ''
  };
  const changed = oldValues.finalCost !== newValues.finalCost ||
    oldValues.paymentStatus !== newValues.paymentStatus ||
    oldValues.paymentDate !== newValues.paymentDate ||
    oldValues.paymentReference !== newValues.paymentReference ||
    oldValues.paymentNotes !== newValues.paymentNotes;
  const patch = {
    ...newValues,
    hasPaymentUpdate: changed || Boolean(getRepairPaymentValue(record, 'hasPaymentUpdate')),
    updatedAt: changed ? new Date().toISOString() : getRepairPaymentValue(record, 'updatedAt'),
    updatedBy: changed ? 'Local User' : getRepairPaymentValue(record, 'updatedBy')
  };
  const updates = readRepairPaymentUpdates();
  updates[recordId] = patch;
  writeRepairPaymentUpdates(updates);
  applyRepairPaymentPatchToRecord(record, patch);
  renderSavedRecords();
  recordsStatus.textContent = 'Payment info saved locally. Original repair amounts were preserved.';
  hidePaymentUpdateModal();
}

function hideRecordDetails() {
  if (recordDetailsPanel) recordDetailsPanel.hidden = true;
}

function setActiveTab(targetId) {
  tabButtons.forEach(button => {
    const active = button.dataset.tabTarget === targetId;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  tabPanels.forEach(panel => {
    const active = panel.id === targetId;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function getManualField(field) {
  return manualEntryForm?.querySelector(`[data-manual-field="${field}"]`);
}

function getManualValue(field) {
  return getManualField(field)?.value.trim() || '';
}

function setManualValue(field, value) {
  const input = getManualField(field);
  if (input) input.value = value;
}

function getActiveManualType() {
  return manualRequestTypeSelect?.value || 'Parts Request';
}

function getSimpleManualValue(prefix, field) {
  return manualEntryForm?.querySelector(`[data-${prefix}-field="${field}"]`)?.value.trim() || '';
}

function getSimpleManualField(prefix, field) {
  return manualEntryForm?.querySelector(`[data-${prefix}-field="${field}"]`);
}

function normalizePlateNumber(plateNumber = '') {
  return String(plateNumber).trim().replace(/\s+/g, '').toUpperCase();
}

function normalizeTruckGroup(value = '') {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  const compact = text.toLowerCase().replace(/[^a-z]/g, '');
  if (!compact) return 'Unknown / Needs Update';
  if (compact === 'bottle' || compact === 'bottles') return 'Bottle';
  if (compact === 'sugar') return 'Sugar';
  if (compact === 'preform' || compact === 'resin' || compact === 'preformresin') return 'Preform / Resin';
  if (compact === 'caps' || compact === 'crown' || compact === 'crowns' || compact === 'capscrown' || compact === 'capscrowns') return 'Caps / Crown';
  if (compact.includes('unknown') || compact.includes('needsupdate')) return 'Unknown / Needs Update';
  return text;
}

function readTruckMasterStorage(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(stored)) return stored;
    if (stored && Array.isArray(stored.trucks)) return stored.trucks;
    if (stored && typeof stored === 'object') return Object.values(stored);
  } catch (error) {
    console.warn(`Unable to read ${key} from localStorage.`, error);
  }
  return [];
}

function getTruckMasterValue(truck, keys) {
  for (const key of keys) {
    const value = truck?.[key];
    if (String(value || '').trim()) return value;
  }
  return '';
}

function getTruckMasterfileRecords() {
  const records = [
    ...readTruckMasterStorage(TRUCK_MASTER_KEY),
    ...readTruckMasterStorage(LEGACY_TRUCK_MASTER_KEY)
  ];
  const byPlate = new Map();
  records.forEach(truck => {
    const plateNumber = normalizePlateNumber(getTruckMasterValue(truck, ['Plate_Number', 'plateNumber', 'plate_number', 'plate', 'Plate Number']));
    if (!plateNumber) return;
    const normalized = {
      ...truck,
      plateNumber,
      truckType: getTruckMasterValue(truck, ['Truck_Type', 'truckType', 'truck_type', 'Truck Type', 'Body_Type', 'bodyType']),
      groupCategory: normalizeTruckGroup(getTruckMasterValue(truck, ['Group_Category', 'groupCategory', 'group', 'Group', 'Group Category']))
    };
    if (!byPlate.has(plateNumber)) byPlate.set(plateNumber, normalized);
  });
  return Array.from(byPlate.values()).sort((a, b) => a.plateNumber.localeCompare(b.plateNumber));
}

function getTruckInfoByPlate(plateNumber) {
  const normalizedPlate = normalizePlateNumber(plateNumber);
  if (!normalizedPlate) return null;

  return getTruckMasterfileRecords().find(truck => (
    normalizePlateNumber(truck?.plateNumber) === normalizedPlate
  )) || null;
}

function getRepairPlateGroupField(prefix) {
  if (prefix === 'records') return recordsPlateGroupFilter;
  if (prefix === 'forRepair') return forRepairLocalForm?.querySelector('[data-for-repair-field="plateGroup"]');
  return getSimpleManualField(prefix, 'plateGroup');
}

function getRepairPlateField(prefix) {
  if (prefix === 'records') return recordsPlateFilter;
  if (prefix === 'forRepair') return forRepairLocalForm?.querySelector('[data-for-repair-field="plateNumber"]');
  return getSimpleManualField(prefix, 'plateNumber');
}

function getRepairPlateRowsForGroup(group) {
  const normalizedGroup = normalizeTruckGroup(group);
  return getTruckMasterfileRecords().filter(truck => (
    !group || normalizeTruckGroup(truck.groupCategory) === normalizedGroup
  ));
}

function populateRepairGroupSelect(select) {
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = REPAIR_PLATE_GROUPS
    .map(group => `<option value="${escapeHtml(group.value)}">${escapeHtml(group.label)}</option>`)
    .join('');
  select.value = REPAIR_PLATE_GROUPS.some(group => group.value === currentValue) ? currentValue : '';
}

function populateRepairPlateSelect(prefix) {
  const plateField = getRepairPlateField(prefix);
  const groupField = getRepairPlateGroupField(prefix);
  if (!plateField || plateField.tagName !== 'SELECT') return;

  const currentValue = normalizePlateNumber(plateField.value);
  const rows = getRepairPlateRowsForGroup(groupField?.value || '');
  const options = [
    `<option value="">${prefix === 'records' ? 'All plates' : 'Select plate'}</option>`,
    ...rows.map(truck => `<option value="${escapeHtml(truck.plateNumber)}">${escapeHtml(truck.plateNumber)}</option>`)
  ];
  if (prefix !== 'records') options.push('<option value="__manual__">Manual / not in Truck Master</option>');
  plateField.innerHTML = options.join('');
  if (currentValue && rows.some(truck => truck.plateNumber === currentValue)) {
    plateField.value = currentValue;
  } else if (currentValue) {
    plateField.add(new Option(currentValue, currentValue), plateField.options[1] || null);
    plateField.value = currentValue;
  }
}

function handleManualPlateOption(prefix) {
  const plateField = getRepairPlateField(prefix);
  if (!plateField || plateField.value !== '__manual__') return;
  const manualPlate = normalizePlateNumber(window.prompt('Enter plate number not in Truck Master:', '') || '');
  populateRepairPlateSelect(prefix);
  if (manualPlate) {
    plateField.add(new Option(manualPlate, manualPlate), plateField.options[1] || null);
    plateField.value = manualPlate;
  } else {
    plateField.value = '';
  }
}

function initRepairPlateDropdowns() {
  const prefixes = ['records', 'forRepair', 'parts', 'equipment', 'labor', 'completed', 'monitoring'];
  prefixes.forEach(prefix => {
    const groupField = getRepairPlateGroupField(prefix);
    const plateField = getRepairPlateField(prefix);
    populateRepairGroupSelect(groupField);
    populateRepairPlateSelect(prefix);

    if (groupField && !groupField.dataset.plateGroupBound) {
      groupField.dataset.plateGroupBound = 'true';
      groupField.addEventListener('change', () => {
        populateRepairPlateSelect(prefix);
        setTruckTypeFromMasterfile(prefix);
        if (prefix === 'records') renderSavedRecords();
      });
    }

    if (plateField && !plateField.dataset.plateSelectBound) {
      plateField.dataset.plateSelectBound = 'true';
      plateField.addEventListener('change', () => {
        handleManualPlateOption(prefix);
        setGroupFromSelectedPlate(prefix);
        setTruckTypeFromMasterfile(prefix);
        if (prefix === 'records') renderSavedRecords();
      });
    }
  });
}

function setGroupFromSelectedPlate(prefix) {
  const plateField = getRepairPlateField(prefix);
  const groupField = getRepairPlateGroupField(prefix);
  if (!plateField || !groupField || !plateField.value || plateField.value === '__manual__') return;
  const truckInfo = getTruckInfoByPlate(plateField.value);
  if (!truckInfo?.groupCategory) return;
  groupField.value = normalizeTruckGroup(truckInfo.groupCategory);
  populateRepairPlateSelect(prefix);
  const refreshedPlateField = getRepairPlateField(prefix);
  if (refreshedPlateField) refreshedPlateField.value = truckInfo.plateNumber;
}

function setTruckTypeFromMasterfile(prefix) {
  const plateField = getSimpleManualField(prefix, 'plateNumber');
  const truckTypeField = getSimpleManualField(prefix, 'truckType');
  if (!plateField || !truckTypeField) return;

  const truckInfo = getTruckInfoByPlate(plateField.value);
  if (truckInfo?.truckType) {
    if (truckTypeField.tagName === 'SELECT' && !Array.from(truckTypeField.options).some(option => option.value === truckInfo.truckType)) {
      truckTypeField.add(new Option(truckInfo.truckType, truckInfo.truckType));
    }
    truckTypeField.value = truckInfo.truckType;
  }
}

function setSimpleManualValue(prefix, field, value) {
  const input = getSimpleManualField(prefix, field);
  if (!input) return;
  if (input.tagName === 'SELECT' && value && !Array.from(input.options).some(option => option.value === value)) {
    input.add(new Option(value, value));
  }
  input.value = value || '';
}

function switchToManualCompletedForm() {
  document.querySelector('[data-repair-tab="repair-entry-tab"]')?.click();
  document.getElementById('manual-tab')?.click();
  if (manualRequestTypeSelect) {
    manualRequestTypeSelect.value = 'Completed Repair';
    setManualFormVisibility();
  }
}

function openCompletedRepairFromRecord(recordIndex) {
  const record = savedRepairRecords[recordIndex];
  if (!record) return;
  switchToManualCompletedForm();
  const plateNumber = normalizePlateNumber(getRecordValue(record, 'Plate_Number'));
  const truckInfo = getTruckInfoByPlate(plateNumber);
  const today = new Date().toISOString().slice(0, 10);
  setSimpleManualValue('completed', 'completedRepairId', createRepairLocalId('completed_repair'));
  setSimpleManualValue('completed', 'linkedRepairId', getRecordValue(record, 'Request_ID'));
  setSimpleManualValue('completed', 'linkedForRepairId', findForRepairIdForPlate(plateNumber));
  setSimpleManualValue('completed', 'dateFinished', today);
  setSimpleManualValue('completed', 'plateGroup', truckInfo?.groupCategory || getRecordValue(record, 'Group_Category'));
  populateRepairPlateSelect('completed');
  setSimpleManualValue('completed', 'plateNumber', plateNumber);
  setSimpleManualValue('completed', 'truckType', truckInfo?.truckType || getRecordValue(record, 'Truck_Type'));
  setSimpleManualValue('completed', 'driver', getRecordValue(record, 'Driver'));
  setSimpleManualValue('completed', 'mechanic', getRecordValue(record, 'Mechanic'));
  setSimpleManualValue('completed', 'shopName', getRecordValue(record, 'Shop_Name'));
  setSimpleManualValue('completed', 'workDone', getRecordValue(record, 'Work_Done'));
  setSimpleManualValue('completed', 'item', getRecordValue(record, 'Repair_Parts'));
  setSimpleManualValue('completed', 'quantity', getRecordValue(record, 'Quantity'));
  setSimpleManualValue('completed', 'unitCost', getRecordValue(record, 'Unit_Cost'));
  setSimpleManualValue('completed', 'laborCost', getRecordValue(record, 'Labor_Cost'));
  setSimpleManualValue('completed', 'partsCost', getRecordValue(record, 'Parts_Cost'));
  setSimpleManualValue('completed', 'totalCost', getRepairPaymentValue(record, 'finalCost') || getOriginalTotalCost(record));
  setSimpleManualValue('completed', 'approvalStatus', getRecordValue(record, 'Approval_Status') || getRecordValue(record, 'Status'));
  setSimpleManualValue('completed', 'paymentStatus', getRepairPaymentValue(record, 'paymentStatus') || getRecordValue(record, 'Payment_Status'));
  setSimpleManualValue('completed', 'payee', getRecordValue(record, 'Payee'));
  setSimpleManualValue('completed', 'remarks', getRecordValue(record, 'Remarks'));
  if (manualSaveStatus) manualSaveStatus.textContent = 'Completed Repair form filled from saved record. Review final fields, then Save.';
}

function findForRepairIdForPlate(plateNumber) {
  const normalized = normalizePlateNumber(plateNumber);
  const match = localForRepairTrucks.find(record => normalizePlateNumber(record.plateNumber) === normalized && !/completed/i.test(record.repairStatus || ''));
  return match?.forRepairId || '';
}

function updateManualTotalFromQuantity(prefix) {
  const quantityField = getSimpleManualField(prefix, 'quantity');
  const unitCostField = getSimpleManualField(prefix, 'unitCost');
  const totalField = getSimpleManualField(prefix, 'totalCost');
  if (!quantityField || !unitCostField || !totalField) return;

  const quantity = Number(quantityField.value);
  const unitCost = Number(unitCostField.value);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitCost) || quantity <= 0 || unitCost < 0) return;

  totalField.value = (quantity * unitCost).toFixed(2);
}

function setManualFormVisibility() {
  let requestType = getActiveManualType();
  if (requestType === 'Completed Repair') {
    requestType = 'Parts Request';
    if (manualRequestTypeSelect) manualRequestTypeSelect.value = requestType;
  }
  manualRequestCards.forEach(card => {
    const active = card.dataset.manualForm === requestType;
    card.classList.toggle('active', active);
    card.hidden = !active;
  });
}

function collectManualEntryRow() {
  const requestType = getActiveManualType();

  if (requestType === 'Equipment Request') {
    return applyRequestTypeRules({
      requestType,
      date: getSimpleManualValue('equipment', 'date'),
      plateNumber: getSimpleManualValue('equipment', 'plateNumber'),
      truckType: getSimpleManualValue('equipment', 'truckType'),
      category: 'Safety Equipment',
      item: getSimpleManualValue('equipment', 'item'),
      quantity: getSimpleManualValue('equipment', 'quantity'),
      unitCost: getSimpleManualValue('equipment', 'unitCost'),
      workDone: getSimpleManualValue('equipment', 'workDone'),
      supplier: getSimpleManualValue('equipment', 'supplier'),
      payee: getSimpleManualValue('equipment', 'payee'),
      totalCost: getSimpleManualValue('equipment', 'totalCost'),
      partsCost: getSimpleManualValue('equipment', 'totalCost'),
      remarks: getSimpleManualValue('equipment', 'remarks')
    });
  }

  if (requestType === 'Labor Payment Request') {
    const totalCost = getSimpleManualValue('labor', 'totalCost');
    return applyRequestTypeRules({
      requestType,
      date: getSimpleManualValue('labor', 'date'),
      plateNumber: getSimpleManualValue('labor', 'plateNumber'),
      truckType: getSimpleManualValue('labor', 'truckType'),
      driver: getSimpleManualValue('labor', 'driver'),
      category: 'Labor',
      workDone: getSimpleManualValue('labor', 'workDone'),
      item: getSimpleManualValue('labor', 'item'),
      quantity: getSimpleManualValue('labor', 'quantity'),
      unitCost: getSimpleManualValue('labor', 'unitCost'),
      mechanic: getSimpleManualValue('labor', 'mechanic'),
      shopName: getSimpleManualValue('labor', 'shopName'),
      priority: getSimpleManualValue('labor', 'priority'),
      payee: getSimpleManualValue('labor', 'payee'),
      laborCost: totalCost,
      totalCost,
      remarks: getSimpleManualValue('labor', 'remarks')
    });
  }

  if (requestType === 'Completed Repair') {
    return applyRequestTypeRules({
      requestType,
      completedRepairId: getSimpleManualValue('completed', 'completedRepairId'),
      linkedRepairId: getSimpleManualValue('completed', 'linkedRepairId'),
      linkedForRepairId: getSimpleManualValue('completed', 'linkedForRepairId'),
      date: getSimpleManualValue('completed', 'dateFinished'),
      dateFinished: getSimpleManualValue('completed', 'dateFinished'),
      plateNumber: getSimpleManualValue('completed', 'plateNumber'),
      truckType: getSimpleManualValue('completed', 'truckType'),
      driver: getSimpleManualValue('completed', 'driver'),
      category: 'Repair',
      workDone: getSimpleManualValue('completed', 'workDone'),
      item: getSimpleManualValue('completed', 'item'),
      quantity: getSimpleManualValue('completed', 'quantity'),
      unitCost: getSimpleManualValue('completed', 'unitCost'),
      laborCost: getSimpleManualValue('completed', 'laborCost'),
      partsCost: getSimpleManualValue('completed', 'partsCost') || getSimpleManualValue('completed', 'totalCost'),
      mechanic: getSimpleManualValue('completed', 'mechanic'),
      shopName: getSimpleManualValue('completed', 'shopName'),
      totalCost: getSimpleManualValue('completed', 'totalCost'),
      approvalStatus: getSimpleManualValue('completed', 'approvalStatus'),
      paymentStatus: getSimpleManualValue('completed', 'paymentStatus'),
      payee: getSimpleManualValue('completed', 'payee'),
      remarks: getSimpleManualValue('completed', 'remarks')
    });
  }

  if (requestType === 'Repair Monitoring Update') {
    return applyRequestTypeRules({
      requestType,
      date: getSimpleManualValue('monitoring', 'date'),
      dateFinished: getSimpleManualValue('monitoring', 'date'),
      plateNumber: getSimpleManualValue('monitoring', 'plateNumber'),
      truckType: getSimpleManualValue('monitoring', 'truckType'),
      driver: getSimpleManualValue('monitoring', 'driver'),
      priority: getSimpleManualValue('monitoring', 'priority'),
      category: 'Repair',
      workDone: getSimpleManualValue('monitoring', 'workDone'),
      item: getSimpleManualValue('monitoring', 'item'),
      quantity: getSimpleManualValue('monitoring', 'quantity'),
      unitCost: getSimpleManualValue('monitoring', 'unitCost'),
      mechanic: getSimpleManualValue('monitoring', 'mechanic'),
      shopName: getSimpleManualValue('monitoring', 'shopName'),
      totalCost: getSimpleManualValue('monitoring', 'totalCost'),
      repairStatus: getSimpleManualValue('monitoring', 'repairStatus'),
      remarks: getSimpleManualValue('monitoring', 'remarks')
    });
  }

  return applyRequestTypeRules({
    requestType: 'Parts Request',
    date: getSimpleManualValue('parts', 'date'),
    plateNumber: getSimpleManualValue('parts', 'plateNumber'),
    truckType: getSimpleManualValue('parts', 'truckType'),
    driver: getSimpleManualValue('parts', 'driver'),
    odometer: getSimpleManualValue('parts', 'odometer'),
    priority: getSimpleManualValue('parts', 'priority'),
    category: 'Repair Parts',
    item: getSimpleManualValue('parts', 'item'),
    workDone: getSimpleManualValue('parts', 'workDone'),
    quantity: getSimpleManualValue('parts', 'quantity'),
    unitCost: getSimpleManualValue('parts', 'unitCost'),
    mechanic: getSimpleManualValue('parts', 'mechanic'),
    shopName: getSimpleManualValue('parts', 'shopName'),
    repairStatus: 'Pending',
    totalCost: getSimpleManualValue('parts', 'totalCost'),
    partsCost: getSimpleManualValue('parts', 'totalCost'),
    remarks: getSimpleManualValue('parts', 'remarks')
  });
}

function getEmptyParsedRowsMarkup() {
  return '<tr><td colspan="24" class="empty">No repair records yet. Paste a Viber message and click Parse Message.</td></tr>';
}

function hasParsedRepairRows() {
  if (!tableBody) return false;
  return Array.from(tableBody.querySelectorAll('tr')).some(row => !row.querySelector('.empty'));
}

function clearParsedRepairWorkflow(options = {}) {
  const { clearStatus = true } = options;
  if (repairInput) repairInput.value = '';
  if (tableBody) tableBody.innerHTML = getEmptyParsedRowsMarkup();
  if (financeOutput) financeOutput.value = '';
  resetParsedSavedState();
  if (saveStatus && clearStatus) setParsedSaveStatus('');
}

function parseRepairMessage(message = repairInput?.value || '') {
  return parseViberMessage(message, getSelectedRequestType());
}

function renderParsedRepairRequests(rows) {
  buildRepairTable(rows || collectTableRows());
}

async function saveRepairRequest() {
  return saveRepairRows(
    collectTableRows(),
    repairInput?.value.trim() || '',
    saveStatus,
    'No parsed repair requests to save.',
    'Saved successfully.'
  );
}

function approveRepairRequest() {
  const rows = collectTableRows().map(row => ({ ...row, status: 'Approved' }));
  buildRepairTable(rows);
}

function rejectRepairRequest() {
  const rows = collectTableRows().map(row => ({ ...row, status: 'Rejected' }));
  buildRepairTable(rows);
}

function markRepairPurchased() {
  const rows = collectTableRows().map(row => ({ ...row, repairStatus: 'Waiting Parts' }));
  buildRepairTable(rows);
}

function markRepairInstalled() {
  const rows = collectTableRows().map(row => ({ ...row, repairStatus: 'Done' }));
  buildRepairTable(rows);
}

function generateRepairPaymentMessage() {
  const selectedRows = collectTableRows();
  const message = buildFinanceMessage(selectedRows);
  if (financeOutput) financeOutput.value = message;
  return message;
}

function setParsedSaveStatus(message, type = '') {
  if (!saveStatus) return;
  saveStatus.className = `save-status${type ? ` ${type}` : ''}`;
  saveStatus.textContent = message;
}

function renderPostSavePrompt() {
  if (!saveStatus) return;
  saveStatus.className = 'save-status save-status-success';
  saveStatus.innerHTML = `
    <div class="parsed-save-result">
      <span>Saved successfully.</span>
      <span>Clear parsed message and parsed rows?</span>
      <div class="parsed-save-options">
        <button class="mini-status-button" type="button" data-parsed-save-action="clear">Clear Now</button>
        <button class="mini-status-button muted" type="button" data-parsed-save-action="keep">Keep for Review</button>
      </div>
    </div>
  `;
}

async function saveRepairRows(rows, sourceMessage, statusElement, emptyMessage, successMessage) {
  if (!rows.length) {
    statusElement.textContent = emptyMessage;
    return false;
  }

  const createdAt = new Date().toISOString();
  const paymentMessage = buildFinanceMessage(rows);
  const dataToSend = buildRepairPayload(rows, sourceMessage, createdAt, paymentMessage);

  if (!dataToSend.length) {
    statusElement.textContent = emptyMessage;
    return false;
  }

  console.log('[Repair] Syncing', dataToSend.length, 'record(s) to cloud...');
  if (statusElement === saveStatus) {
    setParsedSaveStatus('Saved locally. Syncing to cloud...', 'save-status-saving');
  } else {
    statusElement.textContent = 'Saved locally. Syncing to cloud...';
  }

  try {
    await fetch(REPAIR_WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(dataToSend)
    });
    console.log('[Repair] Sync success:', dataToSend.length, 'record(s) sent.');
    if (statusElement === saveStatus) {
      setParsedSaveStatus('Saved locally and synced to cloud.', 'save-status-success');
    } else {
      statusElement.textContent = 'Saved locally and synced to cloud.';
    }
    loadSavedRepairRecords();
    return true;
  } catch (error) {
    console.error('[Repair] Sync failed:', error);
    if (statusElement === saveStatus) {
      setParsedSaveStatus('Saved locally. Cloud sync failed.', 'save-status-error');
    } else {
      statusElement.textContent = 'Saved locally. Cloud sync failed.';
    }
    return false;
  }
}

function buildCompletedRepairPayload(row) {
  const now = new Date().toISOString();
  return {
    Completed_Repair_ID: row.completedRepairId || createRepairLocalId('completed_repair'),
    Linked_Repair_ID: row.linkedRepairId || '',
    Linked_For_Repair_ID: row.linkedForRepairId || '',
    Date_Finished: row.dateFinished || row.date || '',
    Group_Category: row.plateGroup || getTruckInfoByPlate(row.plateNumber)?.groupCategory || '',
    Plate_Number: row.plateNumber || '',
    Truck_Type: row.truckType || '',
    Driver: row.driver || '',
    Mechanic_Worker: row.mechanic || '',
    Shop_Name: row.shopName || '',
    Work_Done: row.workDone || '',
    Parts_Item_Name: row.item || '',
    Quantity: row.quantity || '',
    Unit_Cost: row.unitCost || '',
    Labor_Cost: row.laborCost || '',
    Parts_Cost: row.partsCost || '',
    Total_Amount: row.totalCost || '',
    Approval_Status: row.approvalStatus || '',
    Payment_Status: row.paymentStatus || '',
    Payee: row.payee || '',
    Remarks: row.remarks || '',
    Created_At: now,
    Updated_At: now
  };
}

async function saveCompletedRepairRecord(row, statusElement) {
  if (!row || (!row.plateNumber && !row.workDone && !row.linkedRepairId)) {
    statusElement.textContent = 'No completed repair record to save.';
    return false;
  }
  statusElement.textContent = 'Saving completed repair...';
  try {
    await fetch(REPAIR_WEB_APP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'saveCompletedRepair',
        record: buildCompletedRepairPayload(row)
      })
    });
    markLocalForRepairCompleted(row.linkedForRepairId, row.dateFinished);
    statusElement.textContent = 'Completed and synced to cloud.';
    loadSavedRepairRecords();
    return true;
  } catch (error) {
    statusElement.textContent = 'Completed locally. Cloud sync failed.';
    return false;
  }
}

function markLocalForRepairCompleted(forRepairId, dateFinished) {
  if (!forRepairId) return;
  const index = localForRepairTrucks.findIndex(record => record.forRepairId === forRepairId);
  if (index === -1) return;
  localForRepairTrucks[index] = {
    ...localForRepairTrucks[index],
    repairStatus: 'Completed',
    endDate: dateFinished || localForRepairTrucks[index].endDate,
    updatedAt: new Date().toISOString()
  };
  saveLocalForRepairTrucks();
  renderLocalForRepairTrucks();
}

tabButtons.forEach(button => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tabTarget));
});

if (manualEntryForm) {
  initRepairPlateDropdowns();
  manualRequestTypeSelect?.addEventListener('change', setManualFormVisibility);
  setManualFormVisibility();

  ['parts', 'equipment', 'labor', 'completed', 'monitoring'].forEach(prefix => {
    getSimpleManualField(prefix, 'plateNumber')?.addEventListener('input', () => {
      setTruckTypeFromMasterfile(prefix);
    });
    getSimpleManualField(prefix, 'plateNumber')?.addEventListener('change', () => {
      setTruckTypeFromMasterfile(prefix);
    });
    getSimpleManualField(prefix, 'quantity')?.addEventListener('input', () => {
      updateManualTotalFromQuantity(prefix);
    });
    getSimpleManualField(prefix, 'unitCost')?.addEventListener('input', () => {
      updateManualTotalFromQuantity(prefix);
    });
  });

  manualEntryForm.addEventListener('submit', async event => {
    event.preventDefault();
    const row = collectManualEntryRow();
    const saved = await saveRepairRows(
      [row],
      'Manual User Input',
      manualSaveStatus,
      'No manual repair record to save. Fill at least one repair field first.',
      'Saved locally and synced to cloud.'
    );
    if (saved) manualEntryForm.reset();
    setManualFormVisibility();
  });
}

if (parseButton && repairInput && tableBody) {
  parseButton.addEventListener('click', () => {
    const message = repairInput.value.trim();
    if (!message) {
      alert('Please paste a Viber message into the input area before parsing.');
      return;
    }
    if (hasParsedRepairRows() && !window.confirm('You have unsaved parsed rows. Parsing a new message will replace them. Continue?')) {
      return;
    }
    const rows = parseViberMessage(message, getSelectedRequestType());
    buildRepairTable(rows);
    resetParsedSavedState();
    if (financeOutput) financeOutput.value = '';
    setParsedSaveStatus('');
  });
}

if (exampleButton && repairInput) {
  exampleButton.addEventListener('click', () => {
    repairInput.value = VIBER_EXAMPLES[getSelectedRequestType()] || VIBER_EXAMPLES['Auto Detect'];
  });
}

function setParsedRowSelection(checked) {
  if (!tableBody) return;
  tableBody.querySelectorAll('[data-field="selected"]').forEach(checkbox => {
    checkbox.checked = checked;
  });
}

if (selectAllRowsButton) {
  selectAllRowsButton.addEventListener('click', () => setParsedRowSelection(true));
}

if (unselectAllRowsButton) {
  unselectAllRowsButton.addEventListener('click', () => setParsedRowSelection(false));
}

if (removeUncheckedRowsButton && tableBody) {
  removeUncheckedRowsButton.addEventListener('click', () => {
    const selectedRows = Array.from(tableBody.querySelectorAll('tr')).filter(row => {
      const checkbox = row.querySelector('[data-field="selected"]');
      return checkbox && checkbox.checked;
    });

    if (!selectedRows.length) {
      setParsedSaveStatus('Please select at least one row to remove.', 'save-status-warning');
      return;
    }

    tableBody.querySelectorAll('tr').forEach(row => {
      const checkbox = row.querySelector('[data-field="selected"]');
      if (checkbox && checkbox.checked) row.remove();
    });

    if (!tableBody.querySelectorAll('tr').length) {
      tableBody.innerHTML = getEmptyParsedRowsMarkup();
      if (financeOutput) financeOutput.value = '';
      resetParsedSavedState();
    }
  });
}

if (tableBody) {
  tableBody.addEventListener('input', event => {
    const field = event.target.closest('[data-field]');
    if (!field) return;
    if (field.dataset.field === 'selected') return;
    const row = field.closest('tr');
    row?.classList.remove('parsed-row-saved');
    if (row) delete row.dataset.parsedSaved;
  });

  tableBody.addEventListener('change', event => {
    const field = event.target.closest('[data-field]');
    if (!field) return;
    if (field.dataset.field === 'selected') return;
    const row = field.closest('tr');
    row?.classList.remove('parsed-row-saved');
    if (row) delete row.dataset.parsedSaved;
  });
}

if (generateButton && financeOutput) {
  generateButton.addEventListener('click', () => {
    const rows = collectTableRows();
    financeOutput.value = buildFinanceMessage(rows);
  });
}

if (refreshRecordsButton) {
  refreshRecordsButton.addEventListener('click', loadSavedRepairRecords);
}

if (refreshGarageTrucksButton) {
  refreshGarageTrucksButton.addEventListener('click', loadGarageTrucks);
}

if (garageTimeFilter) {
  garageTimeFilter.addEventListener('change', renderGarageTrucks);
}

if (garageTruckSearchBtn) {
  garageTruckSearchBtn.addEventListener('click', applyGarageTruckSearch);
}

if (garageTruckSearch) {
  garageTruckSearch.addEventListener('input', applyGarageTruckSearch);
  garageTruckSearch.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyGarageTruckSearch();
    }
  });
}

if (garageTruckClearBtn) {
  garageTruckClearBtn.addEventListener('click', clearGarageTruckSearch);
}

if (addForRepairButton && forRepairLocalForm) {
  addForRepairButton.addEventListener('click', () => {
    forRepairLocalForm.hidden = false;
    addForRepairButton.hidden = true;
    if (forRepairLocalStatus) forRepairLocalStatus.textContent = '';
  });
}

if (cancelForRepairButton && forRepairLocalForm) {
  cancelForRepairButton.addEventListener('click', () => {
    forRepairLocalForm.reset();
    forRepairLocalForm.hidden = true;
    if (addForRepairButton) addForRepairButton.hidden = false;
    if (forRepairLocalStatus) forRepairLocalStatus.textContent = '';
  });
}

if (forRepairLocalForm) {
  initRepairPlateDropdowns();
  forRepairLocalForm.addEventListener('submit', async event => {
    event.preventDefault();
    const record = {
      plateNumber: normalizePlate(getForRepairLocalValue('plateNumber')) || getForRepairLocalValue('plateNumber'),
      groupCategory: getForRepairLocalValue('plateGroup'),
      truckType: getTruckInfoByPlate(getForRepairLocalValue('plateNumber'))?.truckType || '',
      garageLocation: getForRepairLocalValue('garageLocation'),
      repairIssue: getForRepairLocalValue('repairIssue'),
      startDate: getForRepairLocalValue('startDate'),
      estimatedFinishDate: getForRepairLocalValue('estimatedFinishDate'),
      endDate: getForRepairLocalValue('endDate'),
      repairStatus: getForRepairLocalValue('repairStatus') || 'For Repair',
      remarks: getForRepairLocalValue('remarks')
    };

    if (!record.plateNumber && !record.repairIssue) {
      if (forRepairLocalStatus) forRepairLocalStatus.textContent = 'Enter a plate number or repair issue first.';
      return;
    }

    saveForRepairTruck(record);
    forRepairLocalForm.reset();
    forRepairLocalForm.hidden = true;
    if (addForRepairButton) addForRepairButton.hidden = false;
    if (forRepairLocalStatus) forRepairLocalStatus.textContent = 'Saved locally. Syncing to cloud...';

    try {
      await syncForRepairTruck(record);
      console.log('[ForRepair] Save sync success:', record.forRepairId);
      if (forRepairLocalStatus) forRepairLocalStatus.textContent = 'Saved locally and synced to cloud.';
    } catch (error) {
      console.error('[ForRepair] Save sync failed:', error);
      if (forRepairLocalStatus) forRepairLocalStatus.textContent = 'Saved locally. Cloud sync failed.';
    }
  });
}

if (forRepairLocalBody) {
  forRepairLocalBody.addEventListener('click', event => {
    const completeButton = event.target.closest('[data-for-repair-complete]');
    if (completeButton) {
      completeForRepairTruck(Number(completeButton.dataset.forRepairComplete));
      return;
    }

    const deleteButton = event.target.closest('[data-for-repair-delete]');
    if (!deleteButton) return;
    deleteForRepairTruck(Number(deleteButton.dataset.forRepairDelete));
  });
}

if (saveStatusChangesButton) {
  saveStatusChangesButton.addEventListener('click', saveChangedPaymentStatuses);
}

if (selectAllSavedRecordsBtn) {
  selectAllSavedRecordsBtn.addEventListener('click', () => setVisibleSavedRecordSelection(true));
}

if (unselectAllSavedRecordsBtn) {
  unselectAllSavedRecordsBtn.addEventListener('click', () => setVisibleSavedRecordSelection(false));
}

if (savedRecordsSelectAll) {
  savedRecordsSelectAll.addEventListener('change', () => setVisibleSavedRecordSelection(savedRecordsSelectAll.checked));
}

if (generateViberFollowupBtn) {
  generateViberFollowupBtn.addEventListener('click', generateViberFollowupMessage);
}

if (copyViberFollowupBtn) {
  copyViberFollowupBtn.addEventListener('click', copyViberFollowupMessage);
}

if (editViberFollowupBtn) {
  editViberFollowupBtn.addEventListener('click', toggleViberFollowupEditing);
}

if (clearViberFollowupBtn) {
  clearViberFollowupBtn.addEventListener('click', clearViberFollowupMessage);
}

[closeViberFollowupBtn, closeViberFollowupBottomBtn].forEach(button => {
  if (button) button.addEventListener('click', closeViberFollowupPanel);
});

[recordsPlateFilter, recordsTypeFilter, recordsRepairStatusFilter, recordsPaymentStatusFilter, recordsApprovalStatusFilter, recordsDateTypeFilter, recordsDateFromFilter, recordsDateToFilter].forEach(filter => {
  if (filter) {
    filter.addEventListener('input', () => {
      savedRecordsQuickFilter = '';
      setQuickFilterActiveState();
      renderSavedRecords();
    });
    filter.addEventListener('change', () => {
      savedRecordsQuickFilter = '';
      setQuickFilterActiveState();
      renderSavedRecords();
    });
  }
});

if (recordsClearFiltersButton) {
  recordsClearFiltersButton.addEventListener('click', clearSavedRecordFilters);
}

recordsQuickFilterButtons.forEach(button => {
  button.addEventListener('click', () => applySavedRecordsQuickFilter(button.dataset.recordsQuickFilter || ''));
});

if (savedRecordsBody) {
  savedRecordsBody.addEventListener('input', event => {
    const statusField = event.target.closest('[data-status-field]');
    if (statusField) updateStatusActionDirtyState(statusField.closest('.status-actions'));
  });

  savedRecordsBody.addEventListener('change', event => {
    const statusField = event.target.closest('[data-status-field]');
    if (statusField) updateStatusActionDirtyState(statusField.closest('.status-actions'));

    const savedRecordCheckbox = event.target.closest('.savedRecordCheckbox');
    if (savedRecordCheckbox && savedRecordsSelectAll) {
      const checkboxes = getVisibleSavedRecordCheckboxes();
      savedRecordsSelectAll.checked = checkboxes.length > 0 && checkboxes.every(checkbox => checkbox.checked);
    }
  });

  savedRecordsBody.addEventListener('click', event => {
    const detailsButton = event.target.closest('.details-button');
    if (detailsButton) {
      const record = savedRepairRecords[Number(detailsButton.dataset.recordIndex)];
      if (record) showRecordDetails(record);
      return;
    }

    const paymentCostButton = event.target.closest('[data-payment-cost]');
    if (paymentCostButton) {
      showPaymentUpdateModal(Number(paymentCostButton.dataset.paymentCost));
      return;
    }

    const moreActionsButton = event.target.closest('[data-more-actions]');
    if (moreActionsButton) {
      const recordIndex = moreActionsButton.dataset.moreActions;
      const menu = savedRecordsBody.querySelector(`[data-more-menu="${recordIndex}"]`);
      const willOpen = Boolean(menu?.hidden);
      savedRecordsBody.querySelectorAll('.more-actions-menu').forEach(item => {
        item.hidden = true;
      });
      savedRecordsBody.querySelectorAll('[data-more-actions]').forEach(button => {
        button.setAttribute('aria-expanded', 'false');
      });
      if (menu) {
        menu.hidden = !willOpen;
        moreActionsButton.setAttribute('aria-expanded', String(willOpen));
      }
      return;
    }

    const changeRequestButton = event.target.closest('[data-change-request]');
    if (changeRequestButton) {
      const idx = Number(changeRequestButton.dataset.recordIndex);
      if (changeRequestButton.dataset.changeRequest === 'delete') {
        deleteRepairRecordLocal(idx);
      } else {
        requestSavedRepairChange(idx, changeRequestButton.dataset.changeRequest, changeRequestButton);
      }
      return;
    }

    const statusButton = event.target.closest('.save-status-button');
    if (statusButton) {
      updateSavedRecordStatus(Number(statusButton.dataset.recordIndex), statusButton);
    }
  });
}

if (closeRecordDetails) {
  closeRecordDetails.addEventListener('click', hideRecordDetails);
}

if (recordDetailsPanel) {
  recordDetailsPanel.addEventListener('click', event => {
    if (event.target === recordDetailsPanel) hideRecordDetails();
  });
}

if (paymentUpdateForm) {
  paymentUpdateForm.addEventListener('submit', savePaymentUpdate);
}

[closePaymentUpdate, cancelPaymentUpdateButton].forEach(button => {
  if (button) button.addEventListener('click', hidePaymentUpdateModal);
});

if (paymentUpdatePanel) {
  paymentUpdatePanel.addEventListener('click', event => {
    if (event.target === paymentUpdatePanel) hidePaymentUpdateModal();
  });
}

if (saveButton && saveStatus) {
  saveStatus.addEventListener('click', event => {
    const actionButton = event.target.closest('[data-parsed-save-action]');
    if (!actionButton) return;

    if (actionButton.dataset.parsedSaveAction === 'clear') {
      clearParsedRepairWorkflow({ clearStatus: false });
      setParsedSaveStatus('Input cleared. Ready for next request.', 'save-status-success');
      return;
    }

    if (actionButton.dataset.parsedSaveAction === 'keep') {
      setParsedSaveStatus('Saved. Parsed message kept for review.', 'save-status-success');
    }
  });

  saveButton.addEventListener('click', async () => {
    if (!hasParsedRepairRows()) {
      setParsedSaveStatus('No parsed repair requests to save.', 'save-status-error');
      return;
    }

    const parsedRows = collectTableRows();
    if (!parsedRows.length) {
      setParsedSaveStatus('No parsed repair requests to save.', 'save-status-error');
      return;
    }

    if (areParsedRowsAlreadySaved(parsedRows)) {
      setParsedSaveStatus('This request was already saved. Parse a new message or clear the current request first.', 'save-status-warning');
      return;
    }

    if (hasDuplicateParsedRows(parsedRows)) {
      setParsedSaveStatus('Duplicate parsed rows detected. Please review before saving.', 'save-status-warning');
      alert('Duplicate parsed rows detected. Please review before saving.');
      return;
    }

    if (!savedRepairRecords.length) {
      setParsedSaveStatus('Checking saved records for duplicates...', 'save-status-saving');
      await loadSavedRepairRecords();
    }

    const rowsToSave = confirmPossibleSavedDuplicates(parsedRows);
    if (!rowsToSave.length) {
      setParsedSaveStatus('No parsed repair requests to save.', 'save-status-error');
      return;
    }

    saveButton.disabled = true;
    try {
      const saved = await saveRepairRows(
        rowsToSave,
        repairInput.value.trim(),
        saveStatus,
        'No parsed repair requests to save.',
        'Saved successfully.'
      );
      if (saved) {
        markParsedRowsSaved(rowsToSave);
        renderPostSavePrompt();
      }
    } finally {
      saveButton.disabled = false;
    }
    return;

    const rows = collectTableRows();
    if (!rows.length) {
      saveStatus.textContent = 'No repair records to save. Parse a message first.';
      return;
    }
    const sourceMessage = repairInput.value.trim();
    const createdAt = new Date().toISOString();
    const paymentMessage = buildFinanceMessage(rows);
    const dataToSend = buildRepairPayload(rows, sourceMessage, createdAt, paymentMessage);
    /*
    const legacyDataToSend = rows.filter(row => row.item).map((row, index) => ({
      Request_ID: `${Date.now()}_${index}`,
      Date_Requested: row.date,
      Requested_By: row.requestedBy,
      Plate_Number: row.plateNumber,
      Truck_Type: row.truckType,
      Driver: row.driver,
      Helper: row.helper,
      Category: row.category,
      Repair_Parts: row.item,
      Quantity: row.quantity,
      Unit_Cost: row.unitCost.replace('₱', '').replace(/,/g, ''),
      Total_Cost: row.totalCost.replace('₱', '').replace(/,/g, ''),
      Supplier: '',
      Payee: '',
      Status: 'Draft',
      Payment_Status: '',
      Approved_By: '',
      Proof_Of_Payment: '',
      Receipt_Link: '',
      Remarks: '',
      Source_Message: sourceMessage,
      Created_At: createdAt,
      Payment_Message: paymentMessage
    }));
    */

    console.log('Payload to send:', dataToSend);
    saveStatus.textContent = 'Saving...';
    try {
      await fetch(REPAIR_WEB_APP_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(dataToSend)
      });
      saveStatus.textContent = 'Saved locally and synced to cloud.';
      loadSavedRepairRecords();
    } catch (error) {
      saveStatus.textContent = 'Saved locally. Cloud sync failed.';
    }
  });
}

if (savedRecordsBody) {
  loadSavedRepairRecords();
}

if (majadaGarageBody || valenzuelaGarageBody) {
  loadGarageTrucks();
}

if (forRepairLocalBody) {
  loadLocalForRepairTrucks();
}
