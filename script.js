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
const parseButton = document.getElementById('parse-button');
const tableBody = document.getElementById('repair-table-body');
const generateButton = document.getElementById('generate-button');
const financeOutput = document.getElementById('finance-output');
const saveButton = document.getElementById('save-button');
const saveStatus = document.getElementById('save-status');

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
      if (!/(driver|helper|total)/i.test(sender)) return sender;
    }
    const colonMatch = normalized.match(/^([^:]+?):\s*/);
    if (colonMatch) {
      const label = colonMatch[1].trim();
      if (!/(driver|helper|total|\[)/i.test(label)) return label;
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

function findTotalMatch(line) {
  const matches = Array.from(line.matchAll(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/g));
  if (!matches.length) return null;
  const quantityMatch = line.match(/^(\d+)\s*(?:pcs|pc|set)\b/i);
  if (matches.length === 1 && quantityMatch && matches[0].index === 0) return null;
  return matches[matches.length - 1];
}

function parseSegment(segment) {
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
  const plateNumber = normalizePlate(parseText);
  const truckTypeMatch = parseText.match(/\b(foton|isuzu|wingvan|flatbed)\b/i);
  const truckType = truckTypeMatch ? truckTypeMatch[1] : '';
  const driverMatch = parseText.match(/driver\s*[:;]\s*(.+)/i);
  const driver = driverMatch ? driverMatch[1].trim() : '';
  const helperMatch = parseText.match(/helper\s*[:;]\s*(.+)/i);
  const helper = helperMatch ? helperMatch[1].trim() : '';

  const items = [];
  for (const line of lines) {
    const normalizedLine = line.replace(/[\u2068\u2069]/g, '').trim();
    if (/^\[/.test(normalizedLine)) continue;
    if (/^Total:/i.test(normalizedLine)) continue;
    if (/^Driver[:;]/i.test(normalizedLine) || /^Helper[:;]/i.test(normalizedLine)) continue;

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

    const category = /hard hat/i.test(item) ? 'Safety Equipment' : 'Repair Parts';
    const quantityNumber = qtyMatch ? Number(qtyMatch[1]) : '';
    const unitCost = quantityNumber && totalCost ? totalCost / quantityNumber : '';

    items.push({
      date,
      requestedBy,
      plateNumber,
      truckType,
      driver,
      helper,
      item,
      quantity,
      unitCost: unitCost !== '' ? formatCurrency(unitCost) : '',
      totalCost: totalCost !== '' ? formatCurrency(totalCost) : '',
      category,
      status: 'Draft'
    });
  }

  return items;
}

function parseViberMessage(message) {
  const segments = message.split(/\n\s*\n/).map(segment => segment.trim()).filter(Boolean);
  let rows = [];
  for (const segment of segments) {
    rows = rows.concat(parseSegment(segment));
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

if (parseButton && repairInput && tableBody) {
  parseButton.addEventListener('click', () => {
    const message = repairInput.value.trim();
    if (!message) {
      alert('Please paste a Viber message into the input area before parsing.');
      return;
    }
    const rows = parseViberMessage(message);
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
    const dataToSend = rows.filter(row => row.item).map((row, index) => ({
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
