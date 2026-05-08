const ITEM_TYPES = ['Spare Part', 'Safety Equipment', 'Oil / Fluid', 'Tire', 'Tool', 'Consumable', 'Other'];
const CATEGORIES = ['Engine', 'Electrical', 'Brake', 'Suspension', 'Transmission', 'Tire', 'Oil / Fluid', 'Lights', 'Body', 'Safety', 'Tools', 'Consumables', 'Other'];

const navToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
const SHEET_CONFIG = {
  spreadsheetId: '1S7d97syJj1bBBtCdaj0kSKhmSd7XMQVHbykZEJuoAWM',
  spreadsheetName: 'VNS_Parts_Inventory_Master',
  sheets: {
    inventoryItems: 'Inventory_Items',
    partsIn: 'Parts_In',
    partsOut: 'Parts_Out',
    movementHistory: 'Movement_History',
    settings: 'Settings'
  }
};
const STORAGE_KEYS = {
  items: 'vns_inventory_items',
  partsIn: 'vns_parts_in_records',
  partsOut: 'vns_parts_out_records',
  movements: 'vns_inventory_movements'
};

const inventoryTabs = document.querySelectorAll('[data-inventory-tab]');
const inventoryPanels = document.querySelectorAll('.inventory-panel');
const inventoryTableBody = document.getElementById('inventory-table-body');
const movementsTableBody = document.getElementById('movements-table-body');
const partsInForm = document.getElementById('parts-in-form');
const partsOutForm = document.getElementById('parts-out-form');
const partsInStatus = document.getElementById('parts-in-status');
const partsOutStatus = document.getElementById('parts-out-status');
const inventoryItemList = document.getElementById('inventory-item-list');

const filters = {
  search: document.getElementById('filter-search'),
  itemType: document.getElementById('filter-item-type'),
  category: document.getElementById('filter-category'),
  make: document.getElementById('filter-make'),
  brand: document.getElementById('filter-brand'),
  stockStatus: document.getElementById('filter-stock-status')
};

let inventoryItems = readStorage(STORAGE_KEYS.items);
let partsInRecords = readStorage(STORAGE_KEYS.partsIn);
let partsOutRecords = readStorage(STORAGE_KEYS.partsOut);
let movementRecords = readStorage(STORAGE_KEYS.movements);

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
}

function readStorage(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeStorage() {
  localStorage.setItem(STORAGE_KEYS.items, JSON.stringify(inventoryItems));
  localStorage.setItem(STORAGE_KEYS.partsIn, JSON.stringify(partsInRecords));
  localStorage.setItem(STORAGE_KEYS.partsOut, JSON.stringify(partsOutRecords));
  localStorage.setItem(STORAGE_KEYS.movements, JSON.stringify(movementRecords));
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

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'PHP 0';
  return `PHP ${number.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePlate(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, '');
}

function getFormValue(form, name) {
  return form.elements[name]?.value.trim() || '';
}

function setFormValue(form, name, value) {
  if (form.elements[name]) form.elements[name].value = value ?? '';
}

function getNumericFormValue(form, name) {
  const value = Number(getFormValue(form, name));
  return Number.isFinite(value) ? value : 0;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function populateSelect(select, options, includeAll = false) {
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = [
    includeAll ? '<option value="">All</option>' : '',
    ...options.map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
  ].join('');
  if (currentValue) select.value = currentValue;
}

function populateDropdowns() {
  document.querySelectorAll('select[name="itemType"]').forEach(select => populateSelect(select, ITEM_TYPES));
  document.querySelectorAll('select[name="category"]').forEach(select => populateSelect(select, CATEGORIES));
  populateSelect(filters.itemType, ITEM_TYPES, true);
  populateSelect(filters.category, CATEGORIES, true);
}

function getItemSignature(record) {
  return [
    record.itemName,
    record.itemType,
    record.category,
    record.make,
    record.brand,
    record.model,
    record.partNumber,
    record.serialNumber,
    record.engineNumber,
    record.chassisNumber,
    record.unit
  ].map(value => normalizeText(value)).join('|');
}

function findInventoryItem(record) {
  const signature = getItemSignature(record);
  return inventoryItems.find(item => getItemSignature(item) === signature);
}

function getStockStatus(item) {
  const currentStock = Number(item.currentStock) || 0;
  const minimumStock = Number(item.minimumStock) || 0;
  if (currentStock <= 0) return 'Out of Stock';
  if (currentStock <= minimumStock) return 'Low Stock';
  return 'In Stock';
}

function getStockBadge(status) {
  const className = status === 'Out of Stock' ? 'stock-out' : status === 'Low Stock' ? 'stock-low' : 'stock-in';
  return `<span class="stock-badge ${className}">${escapeHtml(status)}</span>`;
}

function getMovementBadge(type) {
  const className = type === 'IN' ? 'movement-in' : 'movement-out';
  return `<span class="movement-badge ${className}">${escapeHtml(type)}</span>`;
}

function renderChip(className, value) {
  return `<span class="${className}">${escapeHtml(value || 'Other')}</span>`;
}

function calculateLineTotal(form) {
  const quantity = getNumericFormValue(form, 'quantity');
  const unitCost = getNumericFormValue(form, 'unitCost');
  setFormValue(form, 'totalCost', quantity && unitCost ? (quantity * unitCost).toFixed(2) : '');
}

function buildPartsInRecord(form) {
  const quantity = getNumericFormValue(form, 'quantity');
  const unitCost = getNumericFormValue(form, 'unitCost');
  return {
    id: createId('PIN'),
    date: getFormValue(form, 'date'),
    plateNumber: normalizePlate(getFormValue(form, 'plateNumber')),
    itemName: getFormValue(form, 'itemName'),
    itemType: getFormValue(form, 'itemType'),
    category: getFormValue(form, 'category'),
    make: getFormValue(form, 'make') || 'Universal',
    brand: getFormValue(form, 'brand'),
    model: getFormValue(form, 'model'),
    partNumber: getFormValue(form, 'partNumber'),
    serialNumber: getFormValue(form, 'serialNumber'),
    engineNumber: getFormValue(form, 'engineNumber'),
    chassisNumber: getFormValue(form, 'chassisNumber'),
    unit: getFormValue(form, 'unit'),
    quantity,
    unitCost,
    totalCost: quantity * unitCost,
    supplier: getFormValue(form, 'supplier'),
    storageLocation: getFormValue(form, 'storageLocation'),
    receiptNo: getFormValue(form, 'receiptNo'),
    receivedBy: getFormValue(form, 'receivedBy'),
    remarks: getFormValue(form, 'remarks'),
    createdAt: new Date().toISOString()
  };
}

function buildPartsOutRecord(form, item) {
  const quantity = getNumericFormValue(form, 'quantity');
  const unitCost = getNumericFormValue(form, 'unitCost') || Number(item.averageUnitCost) || 0;
  return {
    id: createId('POUT'),
    date: getFormValue(form, 'date'),
    plateNumber: normalizePlate(getFormValue(form, 'plateNumber')),
    driver: getFormValue(form, 'driver'),
    helper: getFormValue(form, 'helper'),
    itemName: getFormValue(form, 'itemName'),
    itemType: getFormValue(form, 'itemType'),
    category: getFormValue(form, 'category'),
    make: getFormValue(form, 'make') || 'Universal',
    brand: getFormValue(form, 'brand'),
    model: getFormValue(form, 'model'),
    partNumber: getFormValue(form, 'partNumber'),
    quantity,
    unitCost,
    totalCost: quantity * unitCost,
    releasedTo: getFormValue(form, 'releasedTo'),
    requestedBy: getFormValue(form, 'requestedBy'),
    repairRequestId: getFormValue(form, 'repairRequestId'),
    workDone: getFormValue(form, 'workDone'),
    odometer: getFormValue(form, 'odometer'),
    remarks: getFormValue(form, 'remarks'),
    createdAt: new Date().toISOString()
  };
}

function buildMovementRecord(record, item, movementType) {
  const isIn = movementType === 'IN';
  return {
    id: createId('MOVE'),
    date: record.date,
    movementType,
    itemId: item.itemId,
    itemName: record.itemName,
    itemType: record.itemType,
    category: record.category,
    make: record.make,
    brand: record.brand,
    partNumber: record.partNumber,
    quantity: record.quantity,
    unit: item.unit || record.unit || '',
    unitCost: record.unitCost,
    totalCost: record.totalCost,
    plateNumber: record.plateNumber || '',
    supplier: isIn ? record.supplier || '' : '',
    storageLocation: isIn ? record.storageLocation || '' : '',
    referenceId: record.id,
    remarks: record.remarks,
    createdAt: record.createdAt
  };
}

function applyPartsIn(record) {
  let item = findInventoryItem(record);
  if (item) {
    const currentStock = Number(item.currentStock) || 0;
    const currentAverage = Number(item.averageUnitCost) || 0;
    const newStock = currentStock + record.quantity;
    const currentValue = currentStock * currentAverage;
    item.currentStock = newStock;
    item.averageUnitCost = newStock ? (currentValue + record.totalCost) / newStock : record.unitCost;
    item.supplier = record.supplier || item.supplier;
    item.storageLocation = record.storageLocation || item.storageLocation;
    item.lastUpdated = record.date || new Date().toISOString().slice(0, 10);
    item.remarks = record.remarks || item.remarks;
  } else {
    item = {
      itemId: createId('ITEM'),
      itemName: record.itemName,
      itemType: record.itemType,
      category: record.category,
      make: record.make,
      brand: record.brand,
      model: record.model,
      partNumber: record.partNumber,
      serialNumber: record.serialNumber,
      engineNumber: record.engineNumber,
      chassisNumber: record.chassisNumber,
      unit: record.unit,
      currentStock: record.quantity,
      minimumStock: 0,
      averageUnitCost: record.unitCost,
      storageLocation: record.storageLocation,
      supplier: record.supplier,
      lastUpdated: record.date || new Date().toISOString().slice(0, 10),
      remarks: record.remarks
    };
    inventoryItems.push(item);
  }
  record.itemId = item.itemId;
  partsInRecords.unshift(record);
  movementRecords.unshift(buildMovementRecord(record, item, 'IN'));
}

function findPartsOutItem(form) {
  return inventoryItems.find(item =>
    normalizeText(item.itemName) === normalizeText(getFormValue(form, 'itemName')) &&
    (!getFormValue(form, 'partNumber') || normalizeText(item.partNumber) === normalizeText(getFormValue(form, 'partNumber'))) &&
    (!getFormValue(form, 'itemType') || item.itemType === getFormValue(form, 'itemType')) &&
    (!getFormValue(form, 'category') || item.category === getFormValue(form, 'category'))
  );
}

function applyPartsOut(record, item) {
  record.itemId = item.itemId;
  record.unit = item.unit || '';
  item.currentStock = (Number(item.currentStock) || 0) - record.quantity;
  item.lastUpdated = record.date || new Date().toISOString().slice(0, 10);
  item.remarks = record.remarks || item.remarks;
  partsOutRecords.unshift(record);
  movementRecords.unshift(buildMovementRecord(record, item, 'OUT'));
}

function updateOutFormFromItem(itemName) {
  const item = inventoryItems.find(record => normalizeText(record.itemName) === normalizeText(itemName));
  if (!item || !partsOutForm) return;
  ['itemType', 'category', 'make', 'brand', 'model', 'partNumber'].forEach(field => setFormValue(partsOutForm, field, item[field]));
  setFormValue(partsOutForm, 'unitCost', Number(item.averageUnitCost || 0).toFixed(2));
  calculateLineTotal(partsOutForm);
}

function filterInventoryItems() {
  const search = normalizeText(filters.search?.value);
  const itemType = filters.itemType?.value || '';
  const category = filters.category?.value || '';
  const make = normalizeText(filters.make?.value);
  const brand = normalizeText(filters.brand?.value);
  const stockStatus = filters.stockStatus?.value || '';

  return inventoryItems.filter(item => {
    const searchable = [item.itemName, item.partNumber, item.brand, item.model, item.supplier, item.storageLocation].map(normalizeText).join(' ');
    return (!search || searchable.includes(search)) &&
      (!itemType || item.itemType === itemType) &&
      (!category || item.category === category) &&
      (!make || normalizeText(item.make).includes(make)) &&
      (!brand || normalizeText(item.brand).includes(brand)) &&
      (!stockStatus || getStockStatus(item) === stockStatus);
  });
}

function renderInventory() {
  if (!inventoryTableBody) return;
  const items = filterInventoryItems();
  if (!items.length) {
    inventoryTableBody.innerHTML = '<tr><td colspan="12" class="empty-table">No inventory items found.</td></tr>';
    return;
  }

  inventoryTableBody.innerHTML = items.map(item => {
    const status = getStockStatus(item);
    const stockValue = (Number(item.currentStock) || 0) * (Number(item.averageUnitCost) || 0);
    return `
      <tr>
        <td class="item-name-cell">${escapeHtml(item.itemName)}</td>
        <td>${renderChip('type-chip', item.itemType)}</td>
        <td>${renderChip('category-chip', item.category)}</td>
        <td>${escapeHtml(item.make)}</td>
        <td>${escapeHtml(item.brand)}</td>
        <td>${escapeHtml(item.partNumber)}</td>
        <td class="stock-cell">${escapeHtml(formatNumber(item.currentStock))}</td>
        <td>${escapeHtml(formatNumber(item.minimumStock))}</td>
        <td class="money-cell">${escapeHtml(formatCurrency(item.averageUnitCost))}</td>
        <td class="money-cell">${escapeHtml(formatCurrency(stockValue))}</td>
        <td>${escapeHtml(item.storageLocation)}</td>
        <td>${getStockBadge(status)}</td>
      </tr>
    `;
  }).join('');
}

function buildMovements() {
  if (movementRecords.length) return [...movementRecords].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  const legacyPartsIn = partsInRecords.map(record => ({
    ...record,
    movementType: 'IN',
    referenceId: record.id,
    plateNumber: record.plateNumber || ''
  }));
  const legacyPartsOut = partsOutRecords.map(record => ({
    ...record,
    movementType: 'OUT',
    referenceId: record.id,
    supplier: '',
    storageLocation: ''
  }));
  return [...legacyPartsIn, ...legacyPartsOut].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
}

function renderMovements() {
  if (!movementsTableBody) return;
  const movements = buildMovements();
  if (!movements.length) {
    movementsTableBody.innerHTML = '<tr><td colspan="16" class="empty-table">No stock movements yet.</td></tr>';
    return;
  }

  movementsTableBody.innerHTML = movements.slice(0, 100).map(record => `
    <tr>
      <td>${escapeHtml(formatDate(record.date))}</td>
      <td>${getMovementBadge(record.movementType)}</td>
      <td class="item-name-cell">${escapeHtml(record.itemName)}</td>
      <td>${renderChip('type-chip', record.itemType)}</td>
      <td>${renderChip('category-chip', record.category)}</td>
      <td>${escapeHtml(record.make)}</td>
      <td>${escapeHtml(record.brand)}</td>
      <td>${escapeHtml(record.partNumber)}</td>
      <td class="stock-cell">${escapeHtml(formatNumber(record.quantity))}</td>
      <td class="money-cell">${escapeHtml(formatCurrency(record.unitCost))}</td>
      <td class="money-cell">${escapeHtml(formatCurrency(record.totalCost))}</td>
      <td class="item-name-cell">${escapeHtml(record.plateNumber || '')}</td>
      <td>${escapeHtml(record.supplier || '')}</td>
      <td>${escapeHtml(record.storageLocation || '')}</td>
      <td class="muted-cell">${escapeHtml(record.referenceId || record.id || '')}</td>
      <td><span class="text-clamp" title="${escapeHtml(record.remarks)}">${escapeHtml(record.remarks)}</span></td>
    </tr>
  `).join('');
}

function updateSummary() {
  const lowStock = inventoryItems.filter(item => getStockStatus(item) === 'Low Stock').length;
  const outStock = inventoryItems.filter(item => getStockStatus(item) === 'Out of Stock').length;
  const inventoryValue = inventoryItems.reduce((sum, item) => sum + ((Number(item.currentStock) || 0) * (Number(item.averageUnitCost) || 0)), 0);
  const now = new Date();
  const monthOut = partsOutRecords
    .filter(record => {
      const date = new Date(record.date);
      return !Number.isNaN(date.getTime()) && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    })
    .reduce((sum, record) => sum + (Number(record.quantity) || 0), 0);

  document.getElementById('summary-total-types').textContent = String(inventoryItems.length);
  document.getElementById('summary-low-stock').textContent = String(lowStock);
  document.getElementById('summary-out-stock').textContent = String(outStock);
  document.getElementById('summary-stock-value').textContent = formatCurrency(inventoryValue);
  document.getElementById('summary-out-month').textContent = formatNumber(monthOut);
}

function updateItemDatalist() {
  if (!inventoryItemList) return;
  inventoryItemList.innerHTML = inventoryItems
    .map(item => `<option value="${escapeHtml(item.itemName)}"></option>`)
    .join('');
}

function refreshPage() {
  updateSummary();
  updateItemDatalist();
  renderInventory();
  renderMovements();
}

function showPanel(panelId) {
  inventoryTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.inventoryTab === panelId));
  inventoryPanels.forEach(panel => panel.classList.toggle('active', panel.id === panelId));
}

function wireEvents() {
  inventoryTabs.forEach(tab => {
    tab.addEventListener('click', () => showPanel(tab.dataset.inventoryTab));
  });

  Object.values(filters).forEach(filter => {
    if (!filter) return;
    filter.addEventListener('input', renderInventory);
    filter.addEventListener('change', renderInventory);
  });

  if (partsInForm) {
    ['quantity', 'unitCost'].forEach(name => partsInForm.elements[name].addEventListener('input', () => calculateLineTotal(partsInForm)));
    partsInForm.addEventListener('submit', event => {
      event.preventDefault();
      const record = buildPartsInRecord(partsInForm);
      applyPartsIn(record);
      writeStorage();
      partsInForm.reset();
      if (partsInStatus) partsInStatus.textContent = 'Parts In saved locally.';
      refreshPage();
    });
  }

  if (partsOutForm) {
    ['quantity', 'unitCost'].forEach(name => partsOutForm.elements[name].addEventListener('input', () => calculateLineTotal(partsOutForm)));
    partsOutForm.elements.itemName.addEventListener('change', () => updateOutFormFromItem(partsOutForm.elements.itemName.value));
    partsOutForm.addEventListener('submit', event => {
      event.preventDefault();
      const item = findPartsOutItem(partsOutForm);
      if (!item) {
        if (partsOutStatus) partsOutStatus.textContent = 'Item not found in inventory.';
        return;
      }
      const record = buildPartsOutRecord(partsOutForm, item);
      if (record.quantity > (Number(item.currentStock) || 0)) {
        if (partsOutStatus) partsOutStatus.textContent = 'Not enough stock available.';
        return;
      }
      applyPartsOut(record, item);
      writeStorage();
      partsOutForm.reset();
      if (partsOutStatus) partsOutStatus.textContent = 'Parts Out saved locally.';
      refreshPage();
    });
  }
}

populateDropdowns();
wireEvents();
refreshPage();
