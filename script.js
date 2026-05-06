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

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

const repairInput = document.getElementById('repair-input');
const requestTypeSelect = document.getElementById('request-type-select');
const parseButton = document.getElementById('parse-button');
const tableBody = document.getElementById('repair-table-body');
const generateButton = document.getElementById('generate-button');
const financeOutput = document.getElementById('finance-output');
const saveButton = document.getElementById('save-button');
const saveStatus = document.getElementById('save-status');
const refreshRecordsButton = document.getElementById('refresh-records-button');
const recordsPlateFilter = document.getElementById('records-plate-filter');
const recordsTypeFilter = document.getElementById('records-type-filter');
const recordsStatusFilter = document.getElementById('records-status-filter');
const recordsStatus = document.getElementById('records-status');
const savedRecordsBody = document.getElementById('saved-records-body');

let savedRepairRecords = [];

const REPAIR_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzSxpVjoHxkXo95FIJL6MBWFsHQBaRbWU-AabblQ1e15jSJpYZTmA4rc41g3uTH2j_x5w/exec";

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
  const plateMatch = plateText.match(/\b([A-Z]{2,4})\s?(\d{3,4})\b/);
  return plateMatch ? `${plateMatch[1]} ${plateMatch[2]}` : '';
}

function parsePrice(value) {
  if (!value) return '';
  return parseFloat(value.replace(/,/g, ''));
}

function detectRequestType(text) {
  if (/\b(safety equipment|hard hat|helmet|vest|ppe|reflectorized)\b/i.test(text)) {
    return 'Safety Equipment Request';
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
  if (requestType === 'Completed Repair' || requestType === 'Repair Monitoring Update') {
    return { status: 'Completed', repairStatus: 'Completed', paymentStatus: '' };
  }
  return { status: 'Draft', repairStatus: 'Pending', paymentStatus: 'Unpaid' };
}

function cleanMoney(value) {
  return String(value || '').replace(/PHP|â‚±|₱/g, '').replace(/,/g, '').trim();
}

function getSelectedRequestType() {
  return requestTypeSelect ? requestTypeSelect.value : 'Auto Detect';
}

function applyRequestTypeRules(row) {
  if (row.requestType === 'Completed Repair' || row.requestType === 'Repair Monitoring Update') {
    return {
      ...row,
      status: 'Completed',
      repairStatus: 'Completed',
      paymentStatus: /^paid$/i.test(row.paymentStatus) ? 'Paid' : ''
    };
  }

  if (row.requestType === 'Parts Request' || row.requestType === 'Safety Equipment Request') {
    return {
      ...row,
      status: 'Draft',
      repairStatus: 'Pending',
      paymentStatus: 'Unpaid'
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

    const category = requestType === 'Safety Equipment Request' || /hard hat|helmet|vest|ppe|reflectorized/i.test(item) ? 'Safety Equipment' : 'Repair Parts';
    const quantityNumber = qtyMatch ? Number(qtyMatch[1]) : '';
    const unitCost = quantityNumber && totalCost ? totalCost / quantityNumber : '';

    items.push({
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
      quantity,
      unitCost: unitCost !== '' ? formatCurrency(unitCost) : '',
      partsCost: totalCost !== '' ? formatCurrency(totalCost) : '',
      laborCost: laborCost !== '' ? formatCurrency(laborCost) : '',
      totalCost: totalCost !== '' ? formatCurrency(totalCost) : '',
      category,
      mechanic,
      photoLink,
      receiptLink,
      status: category === 'Safety Equipment' ? 'Draft' : defaultStatuses.status,
      repairStatus: defaultStatuses.repairStatus,
      paymentStatus: defaultStatuses.paymentStatus
    });
  }

  if (!items.length && requestType !== 'Parts Request') {
    items.push({
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
      quantity: '',
      unitCost: '',
      partsCost: '',
      laborCost: laborCost !== '' ? formatCurrency(laborCost) : '',
      totalCost: laborCost !== '' ? formatCurrency(laborCost) : '',
      category: requestType === 'Safety Equipment Request' ? 'Safety Equipment' : 'Repair',
      mechanic,
      photoLink,
      receiptLink,
      status: defaultStatuses.status,
      repairStatus: defaultStatuses.repairStatus,
      paymentStatus: defaultStatuses.paymentStatus
    });
  }

  return items;
}

function parseViberMessage(message, requestTypeOverride = 'Auto Detect') {
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
    tableBody.innerHTML = '<tr><td colspan="22" class="empty">No repair records yet. Paste a Viber message and click Parse Message.</td></tr>';
    return;
  }

  tableBody.innerHTML = rows.map(row => `
    <tr>
      <td>
        <select data-field="requestType">
          <option value="Parts Request"${row.requestType === 'Parts Request' ? ' selected' : ''}>Parts Request</option>
          <option value="Completed Repair"${row.requestType === 'Completed Repair' ? ' selected' : ''}>Completed Repair</option>
          <option value="Repair Monitoring Update"${row.requestType === 'Repair Monitoring Update' ? ' selected' : ''}>Repair Monitoring Update</option>
          <option value="Safety Equipment Request"${row.requestType === 'Safety Equipment Request' ? ' selected' : ''}>Safety Equipment Request</option>
        </select>
      </td>
      <td>${escapeHtml(row.date)}</td>
      <td><input data-field="dateFinished" value="${escapeHtml(row.dateFinished)}" placeholder="Date finished"></td>
      <td>${escapeHtml(row.requestedBy)}</td>
      <td>${escapeHtml(row.plateNumber)}</td>
      <td>${escapeHtml(row.truckType)}</td>
      <td>${escapeHtml(row.driver)}</td>
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
    if (cells.length !== 22) return null;
    const getInput = field => tr.querySelector(`[data-field="${field}"]`)?.value.trim() || '';
    return applyRequestTypeRules({
      requestType: getInput('requestType'),
      date: cells[1].textContent.trim(),
      dateFinished: getInput('dateFinished'),
      requestedBy: cells[3].textContent.trim(),
      plateNumber: cells[4].textContent.trim(),
      truckType: cells[5].textContent.trim(),
      driver: cells[6].textContent.trim(),
      helper: cells[7].textContent.trim(),
      workDone: getInput('workDone'),
      item: cells[9].textContent.trim(),
      quantity: cells[10].textContent.trim(),
      unitCost: cells[11].textContent.trim(),
      partsCost: getInput('partsCost'),
      laborCost: getInput('laborCost'),
      totalCost: cells[14].textContent.trim(),
      category: cells[15].textContent.trim(),
      mechanic: getInput('mechanic'),
      photoLink: getInput('photoLink'),
      receiptLink: getInput('receiptLink'),
      status: getInput('status') || 'Draft',
      repairStatus: getInput('repairStatus'),
      paymentStatus: getInput('paymentStatus')
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

  const isRepairSummary = rows.every(row => row.requestType === 'Completed Repair' || row.requestType === 'Repair Monitoring Update');

  const lines = rows.map(row => {
    const parts = [];
    if (row.requestType) parts.push(`Type: ${row.requestType}`);
    if (row.plateNumber) parts.push(`Plate: ${row.plateNumber}`);
    if (row.driver) parts.push(`Driver: ${row.driver}`);
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

function buildRepairPayload(rows, sourceMessage, createdAt, paymentMessage) {
  return rows.filter(row => row.item || row.workDone || row.plateNumber).map((row, index) => ({
    Request_ID: `${Date.now()}_${index}`,
    Request_Type: row.requestType,
    Date_Requested: row.date,
    Date_Finished: row.dateFinished,
    Requested_By: row.requestedBy,
    Plate_Number: row.plateNumber,
    Truck_Type: row.truckType,
    Driver: row.driver,
    Helper: row.helper,
    Category: row.category,
    Repair_Parts: row.item,
    Work_Done: row.workDone,
    Quantity: row.quantity,
    Unit_Cost: cleanMoney(row.unitCost),
    Parts_Cost: cleanMoney(row.partsCost || row.totalCost),
    Labor_Cost: cleanMoney(row.laborCost),
    Total_Cost: cleanMoney(row.totalCost) || String((Number(cleanMoney(row.partsCost)) || 0) + (Number(cleanMoney(row.laborCost)) || 0) || ''),
    Supplier: '',
    Supplier_Contact: '',
    Payee: '',
    Status: row.status,
    Repair_Status: row.repairStatus,
    Payment_Status: row.paymentStatus,
    Approved_By: '',
    Proof_Of_Payment: '',
    Receipt_Link: row.receiptLink,
    Photo_Link: row.photoLink,
    Mechanic: row.mechanic,
    Remarks: '',
    Source_Message: sourceMessage,
    Created_At: createdAt,
    Payment_Message: paymentMessage,
    Saved_By: '',
    Last_Updated: createdAt
  }));
}

function normalizeSavedRecords(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.records)) return data.records;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

function getRecordValue(record, key) {
  return record[key] ?? record[key.replace(/_/g, '')] ?? '';
}

function filterSavedRecords(records) {
  const plate = (recordsPlateFilter?.value || '').trim().toLowerCase();
  const requestType = recordsTypeFilter?.value || '';
  const status = recordsStatusFilter?.value || '';

  return records.filter(record => {
    const recordPlate = String(getRecordValue(record, 'Plate_Number')).toLowerCase();
    const recordType = String(getRecordValue(record, 'Request_Type'));
    const recordStatus = String(getRecordValue(record, 'Status'));
    return (!plate || recordPlate.includes(plate)) &&
      (!requestType || recordType === requestType) &&
      (!status || recordStatus === status);
  });
}

function renderSavedRecords() {
  if (!savedRecordsBody) return;
  const records = filterSavedRecords(savedRepairRecords);

  if (!records.length) {
    savedRecordsBody.innerHTML = '<tr><td colspan="11" class="empty">No saved repair records match the selected filters.</td></tr>';
    return;
  }

  savedRecordsBody.innerHTML = records.map(record => `
    <tr>
      <td>${escapeHtml(getRecordValue(record, 'Request_ID'))}</td>
      <td>${escapeHtml(getRecordValue(record, 'Request_Type'))}</td>
      <td>${escapeHtml(getRecordValue(record, 'Date_Requested'))}</td>
      <td>${escapeHtml(getRecordValue(record, 'Plate_Number'))}</td>
      <td>${escapeHtml(getRecordValue(record, 'Repair_Parts'))}</td>
      <td>${escapeHtml(getRecordValue(record, 'Work_Done'))}</td>
      <td>${escapeHtml(getRecordValue(record, 'Quantity'))}</td>
      <td>${escapeHtml(getRecordValue(record, 'Total_Cost'))}</td>
      <td>${escapeHtml(getRecordValue(record, 'Status'))}</td>
      <td>${escapeHtml(getRecordValue(record, 'Repair_Status'))}</td>
      <td>${escapeHtml(getRecordValue(record, 'Payment_Status'))}</td>
    </tr>
  `).join('');
}

async function loadSavedRepairRecords() {
  if (!savedRecordsBody || !recordsStatus) return;
  recordsStatus.textContent = 'Loading saved records...';
  savedRecordsBody.innerHTML = '<tr><td colspan="11" class="empty">Loading saved repair records...</td></tr>';

  try {
    const response = await fetch(`${REPAIR_WEB_APP_URL}?action=list`);
    const data = await response.json();
    savedRepairRecords = normalizeSavedRecords(data);
    renderSavedRecords();
    recordsStatus.textContent = `Loaded ${savedRepairRecords.length} saved record${savedRepairRecords.length === 1 ? '' : 's'}.`;
  } catch (error) {
    savedRepairRecords = [];
    savedRecordsBody.innerHTML = '<tr><td colspan="11" class="empty">Unable to load saved records. Please try again.</td></tr>';
    recordsStatus.textContent = 'Error loading saved records.';
  }
}

if (parseButton && repairInput && tableBody) {
  parseButton.addEventListener('click', () => {
    const message = repairInput.value.trim();
    if (!message) {
      alert('Please paste a Viber message into the input area before parsing.');
      return;
    }
    const rows = parseViberMessage(message, getSelectedRequestType());
    buildRepairTable(rows);
    if (financeOutput) financeOutput.value = '';
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

[recordsPlateFilter, recordsTypeFilter, recordsStatusFilter].forEach(filter => {
  if (filter) {
    filter.addEventListener('input', renderSavedRecords);
    filter.addEventListener('change', renderSavedRecords);
  }
});

if (saveButton && saveStatus) {
  saveButton.addEventListener('click', async () => {
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
      saveStatus.textContent = 'Request sent to Google Sheet. Please check the Repair_Requests tab.';
    } catch (error) {
      saveStatus.textContent = 'Error sending request. Please check your connection.';
    }
  });
}
