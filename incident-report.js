'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const INC_KEY = 'vnsIncidentReports';

const INC_OPEN_STATUSES = new Set([
  'New', 'Under review', 'Corrective action required',
  'Corrective action in progress', 'For verification'
]);

const INC_CA_PENDING_STATUSES = new Set(['Pending', 'In progress', 'For verification', 'Overdue']);

// ─── Storage ─────────────────────────────────────────────────────────────────

function incLoadAll() {
  try {
    return JSON.parse(localStorage.getItem(INC_KEY) || '[]');
  } catch (e) {
    console.warn('[IncidentReport] Corrupted localStorage — resetting.', e);
    return [];
  }
}

function incSaveAll(arr) {
  localStorage.setItem(INC_KEY, JSON.stringify(arr));
}

// ─── ID Generation ───────────────────────────────────────────────────────────

function incGenerateId() {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VNS-INC-${date}-${time}-${rand}`;
}

// ─── Overdue Auto-Update ──────────────────────────────────────────────────────

function incProcessOverdue(records) {
  const today = new Date().toISOString().slice(0, 10);
  let changed = false;
  records.forEach(r => {
    if (
      r.correctiveActionRequired === 'Yes' &&
      r.targetCompletionDate &&
      r.targetCompletionDate < today &&
      r.correctiveActionStatus !== 'Completed' &&
      r.correctiveActionStatus !== 'Not required' &&
      r.correctiveActionStatus !== 'Overdue'
    ) {
      r.correctiveActionStatus = 'Overdue';
      r.updatedAt = new Date().toISOString();
      changed = true;
    }
  });
  if (changed) incSaveAll(records);
  return records;
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function incRenderSummary(records) {
  const total = records.length;
  const open = records.filter(r => INC_OPEN_STATUSES.has(r.status)).length;
  const caPending = records.filter(r => INC_CA_PENDING_STATUSES.has(r.correctiveActionStatus)).length;
  const caDone = records.filter(r => r.correctiveActionStatus === 'Completed').length;

  document.getElementById('inc-stat-total').textContent = total;
  document.getElementById('inc-stat-open').textContent = open;
  document.getElementById('inc-stat-ca-pending').textContent = caPending;
  document.getElementById('inc-stat-ca-done').textContent = caDone;
}

// ─── Badge Helpers ────────────────────────────────────────────────────────────

function incSeverityClass(sev) {
  return {
    Low: 'inc-sev-low',
    Medium: 'inc-sev-medium',
    High: 'inc-sev-high',
    Critical: 'inc-sev-critical'
  }[sev] || 'status-badge';
}

function incStatusClass(status) {
  return {
    'New': 'inc-status-new',
    'Under review': 'inc-status-under-review',
    'Corrective action required': 'inc-status-ca-required',
    'Corrective action in progress': 'inc-status-ca-progress',
    'For verification': 'inc-status-for-verification',
    'Closed': 'inc-status-closed',
    'Cancelled': 'inc-status-cancelled'
  }[status] || 'status-badge';
}

function incCaStatusClass(caStatus) {
  return {
    'Not required': 'inc-ca-not-required',
    'Pending': 'inc-ca-pending',
    'In progress': 'inc-ca-in-progress',
    'For verification': 'inc-ca-for-verification',
    'Completed': 'inc-ca-completed',
    'Overdue': 'inc-ca-overdue'
  }[caStatus] || 'status-badge';
}

function badge(text, cls) {
  return `<span class="status-badge ${cls}">${esc(text)}</span>`;
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Table Render ─────────────────────────────────────────────────────────────

function incRenderTable(records) {
  const tbody = document.getElementById('inc-records-body');
  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty">No incidents match your filters.</td></tr>';
    return;
  }

  tbody.innerHTML = records.map(r => {
    const caStatus = r.correctiveActionRequired === 'Yes'
      ? (r.correctiveActionStatus || 'Pending')
      : 'Not required';

    return `
      <tr data-inc-id="${esc(r.incidentId)}">
        <td style="white-space:nowrap;font-size:.78rem;">${esc(r.incidentId)}</td>
        <td style="white-space:nowrap;">${esc(r.dateReported)}</td>
        <td>${esc(r.plateNumber)}</td>
        <td>${esc(r.driverName)}</td>
        <td>${esc(r.incidentType)}</td>
        <td>${badge(r.severity, incSeverityClass(r.severity))}</td>
        <td>${badge(r.status, incStatusClass(r.status))}</td>
        <td>${badge(caStatus, incCaStatusClass(caStatus))}</td>
        <td>${esc(r.assignedTo)}</td>
        <td style="white-space:nowrap;">${esc(r.targetCompletionDate)}</td>
        <td>${esc(r.loggedBy)}</td>
        <td class="inc-row-actions">
          <button class="details-button" onclick="incOpenEdit('${esc(r.incidentId)}')">Edit</button>
          <button class="details-button" onclick="incMarkCAComplete('${esc(r.incidentId)}')">CA Done</button>
          <button class="details-button" onclick="incCloseIncident('${esc(r.incidentId)}')">Close</button>
          <button class="details-button danger-outline" onclick="incDeleteRecord('${esc(r.incidentId)}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── Filter + Search ──────────────────────────────────────────────────────────

function incApplyFilters() {
  const search = (document.getElementById('inc-search').value || '').toLowerCase();
  const filterStatus = document.getElementById('inc-filter-status').value;
  const filterSeverity = document.getElementById('inc-filter-severity').value;
  const filterCAStatus = document.getElementById('inc-filter-ca-status').value;
  const filterDateFrom = document.getElementById('inc-filter-date-from').value;
  const filterDateTo = document.getElementById('inc-filter-date-to').value;

  let records = incProcessOverdue(incLoadAll());

  if (search) {
    records = records.filter(r =>
      [r.plateNumber, r.driverName, r.loggedBy, r.incidentType, r.helperName, r.location]
        .some(f => (f || '').toLowerCase().includes(search))
    );
  }
  if (filterStatus) records = records.filter(r => r.status === filterStatus);
  if (filterSeverity) records = records.filter(r => r.severity === filterSeverity);
  if (filterCAStatus) {
    records = records.filter(r => {
      const caStatus = r.correctiveActionRequired === 'Yes'
        ? (r.correctiveActionStatus || 'Pending')
        : 'Not required';
      return caStatus === filterCAStatus;
    });
  }
  if (filterDateFrom) records = records.filter(r => r.dateReported >= filterDateFrom);
  if (filterDateTo) records = records.filter(r => r.dateReported <= filterDateTo);

  incRenderTable(records);
}

// ─── Form Helpers ─────────────────────────────────────────────────────────────

function incGetField(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function incSetField(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val || '';
}

function incGetFormData() {
  return {
    incidentId: incGetField('inc-incident-id'),
    dateReported: incGetField('inc-date-reported'),
    timeReported: incGetField('inc-time-reported'),
    loggedBy: incGetField('inc-logged-by'),
    departmentRole: incGetField('inc-department-role'),
    plateNumber: incGetField('inc-plate-number'),
    driverName: incGetField('inc-driver-name'),
    helperName: incGetField('inc-helper-name'),
    incidentDate: incGetField('inc-incident-date'),
    incidentTime: incGetField('inc-incident-time'),
    location: incGetField('inc-location'),
    incidentType: incGetField('inc-type'),
    severity: incGetField('inc-severity'),
    status: incGetField('inc-status'),
    incidentDescription: incGetField('inc-description'),
    immediateActionTaken: incGetField('inc-immediate-action'),
    peopleInvolved: incGetField('inc-people-involved'),
    witnesses: incGetField('inc-witnesses'),
    remarks: incGetField('inc-remarks'),
    photoReference: incGetField('inc-photo-reference'),
    videoReference: incGetField('inc-video-reference'),
    evidenceNotes: incGetField('inc-evidence-notes'),
    correctiveActionRequired: incGetField('inc-ca-required'),
    rootCause: incGetField('inc-root-cause'),
    correctiveActionPlan: incGetField('inc-ca-plan'),
    assignedTo: incGetField('inc-assigned-to'),
    targetCompletionDate: incGetField('inc-target-date'),
    followUpDate: incGetField('inc-followup-date'),
    correctiveActionStatus: incGetField('inc-ca-status'),
    completionDate: incGetField('inc-completion-date'),
    completionNotes: incGetField('inc-completion-notes'),
    verifiedBy: incGetField('inc-verified-by'),
    verificationRemarks: incGetField('inc-verification-remarks'),
  };
}

function incSetFormData(r) {
  incSetField('inc-incident-id', r.incidentId);
  incSetField('inc-date-reported', r.dateReported);
  incSetField('inc-time-reported', r.timeReported);
  incSetField('inc-logged-by', r.loggedBy);
  incSetField('inc-department-role', r.departmentRole);
  incSetField('inc-plate-number', r.plateNumber);
  incSetField('inc-driver-name', r.driverName);
  incSetField('inc-helper-name', r.helperName);
  incSetField('inc-incident-date', r.incidentDate);
  incSetField('inc-incident-time', r.incidentTime);
  incSetField('inc-location', r.location);
  incSetField('inc-type', r.incidentType);
  incSetField('inc-severity', r.severity);
  incSetField('inc-status', r.status);
  incSetField('inc-description', r.incidentDescription);
  incSetField('inc-immediate-action', r.immediateActionTaken);
  incSetField('inc-people-involved', r.peopleInvolved);
  incSetField('inc-witnesses', r.witnesses);
  incSetField('inc-remarks', r.remarks);
  incSetField('inc-photo-reference', r.photoReference);
  incSetField('inc-video-reference', r.videoReference);
  incSetField('inc-evidence-notes', r.evidenceNotes);
  incSetField('inc-ca-required', r.correctiveActionRequired || 'No');
  incSetField('inc-root-cause', r.rootCause);
  incSetField('inc-ca-plan', r.correctiveActionPlan);
  incSetField('inc-assigned-to', r.assignedTo);
  incSetField('inc-target-date', r.targetCompletionDate);
  incSetField('inc-followup-date', r.followUpDate);
  incSetField('inc-ca-status', r.correctiveActionStatus || 'Pending');
  incSetField('inc-completion-date', r.completionDate);
  incSetField('inc-completion-notes', r.completionNotes);
  incSetField('inc-verified-by', r.verifiedBy);
  incSetField('inc-verification-remarks', r.verificationRemarks);

  document.getElementById('inc-internal-id').value = r.incidentId || '';
  document.getElementById('inc-created-at').value = r.createdAt || '';

  incToggleCAFields();
}

function incClearForm() {
  document.getElementById('inc-form').reset();
  document.getElementById('inc-internal-id').value = '';
  document.getElementById('inc-created-at').value = '';
  document.getElementById('inc-incident-id').value = '';
  document.getElementById('inc-photo-filename').textContent = 'No file selected';
  document.getElementById('inc-video-filename').textContent = 'No file selected';
  document.getElementById('inc-status-msg').textContent = '';
  document.getElementById('inc-status-msg').className = 'inc-status-msg';
  document.getElementById('inc-edit-notice').textContent = 'New incident — ID will be auto-generated on save.';

  // Default to today
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toTimeString().slice(0, 5);
  document.getElementById('inc-date-reported').value = today;
  document.getElementById('inc-time-reported').value = now;

  incToggleCAFields();
}

// ─── CA Fields Show/Hide ──────────────────────────────────────────────────────

function incToggleCAFields() {
  const caRequired = incGetField('inc-ca-required') === 'Yes';
  const caStatus = incGetField('inc-ca-status');
  const caCompleted = caStatus === 'Completed';

  const caWrap = document.getElementById('inc-ca-fields-wrap');
  const compWrap = document.getElementById('inc-completion-wrap');
  const notReqNote = document.getElementById('inc-ca-not-required-note');

  caWrap.hidden = !caRequired;
  notReqNote.style.display = caRequired ? 'none' : 'block';

  // Completion fields only if CA is required and status is Completed
  if (compWrap) compWrap.hidden = !(caRequired && caCompleted);
}

// ─── Validation ───────────────────────────────────────────────────────────────

function incValidate(data) {
  const errs = [];

  if (!data.loggedBy) errs.push('Logged By is required.');
  if (!data.incidentDate) errs.push('Incident Date is required.');
  if (!data.incidentType) errs.push('Incident Type is required.');
  if (!data.severity) errs.push('Severity is required.');
  if (!data.status) errs.push('Status is required.');
  if (!data.incidentDescription) errs.push('Incident Description is required.');

  if (data.correctiveActionRequired === 'Yes') {
    if (!data.rootCause) errs.push('Root Cause is required when Corrective Action is required.');
    if (!data.correctiveActionPlan) errs.push('Corrective Action Plan is required when CA is required.');
    if (!data.assignedTo) errs.push('Assigned To is required when CA is required.');
    if (!data.targetCompletionDate) errs.push('Target Completion Date is required when CA is required.');
    if (!data.correctiveActionStatus) errs.push('Corrective Action Status is required when CA is required.');
  }

  if (data.correctiveActionStatus === 'Completed') {
    if (!data.completionDate) errs.push('Completion Date is required when CA Status is Completed.');
    if (!data.completionNotes) errs.push('Completion Notes are required when CA Status is Completed.');
    if (!data.verifiedBy) errs.push('Verified By is required when CA Status is Completed.');
  }

  return errs;
}

// ─── Status Message ───────────────────────────────────────────────────────────

function incShowStatus(msg, type = '') {
  const el = document.getElementById('inc-status-msg');
  el.textContent = msg;
  el.className = 'inc-status-msg' + (type ? ` ${type}` : '');
}

// ─── Save / Update ────────────────────────────────────────────────────────────

function incSaveRecord(e) {
  e.preventDefault();

  const data = incGetFormData();
  const errs = incValidate(data);

  if (errs.length) {
    incShowStatus(errs[0], 'error');
    return;
  }

  const records = incLoadAll();
  const existingId = document.getElementById('inc-internal-id').value;
  const now = new Date().toISOString();

  if (existingId) {
    // Edit existing
    const idx = records.findIndex(r => r.incidentId === existingId);
    if (idx !== -1) {
      records[idx] = {
        ...records[idx],
        ...data,
        incidentId: existingId,
        createdAt: records[idx].createdAt,
        updatedAt: now
      };
    }
    incSaveAll(records);
    incShowStatus('Incident updated.', 'success');
  } else {
    // New record
    const newId = incGenerateId();
    const record = {
      ...data,
      incidentId: newId,
      createdAt: now,
      updatedAt: now
    };
    records.unshift(record);
    incSaveAll(records);
    document.getElementById('inc-incident-id').value = newId;
    document.getElementById('inc-internal-id').value = newId;
    document.getElementById('inc-edit-notice').textContent = `Editing: ${newId}`;
    incShowStatus('Incident saved.', 'success');
  }

  incRenderSummary(incLoadAll());
  incApplyFilters();
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

function incOpenEdit(incidentId) {
  const records = incLoadAll();
  const r = records.find(r => r.incidentId === incidentId);
  if (!r) return;

  incSetFormData(r);
  document.getElementById('inc-edit-notice').textContent = `Editing: ${incidentId}`;
  incShowStatus('');

  // Switch to Log tab
  document.querySelectorAll('[data-inc-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.incTab === 'log');
    btn.setAttribute('aria-selected', btn.dataset.incTab === 'log');
  });
  document.querySelectorAll('.inc-tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === 'inc-tab-log');
  });

  // Scroll to form
  document.getElementById('inc-tab-log').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

function incMarkCAComplete(incidentId) {
  const records = incLoadAll();
  const r = records.find(r => r.incidentId === incidentId);
  if (!r) return;

  if (r.correctiveActionRequired !== 'Yes') {
    alert('This incident does not require corrective action.');
    return;
  }
  if (r.correctiveActionStatus === 'Completed') {
    alert('Corrective action is already marked as Completed.');
    return;
  }

  const completionDate = prompt('Enter completion date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
  if (!completionDate) return;

  r.correctiveActionStatus = 'Completed';
  r.completionDate = completionDate;
  r.updatedAt = new Date().toISOString();

  incSaveAll(records);
  incRenderSummary(records);
  incApplyFilters();
}

function incCloseIncident(incidentId) {
  const records = incLoadAll();
  const r = records.find(r => r.incidentId === incidentId);
  if (!r) return;

  if (r.status === 'Closed') {
    alert('Incident is already Closed.');
    return;
  }

  if (!confirm(`Close incident ${incidentId}? Status will be set to Closed.`)) return;

  r.status = 'Closed';
  r.updatedAt = new Date().toISOString();

  incSaveAll(records);
  incRenderSummary(records);
  incApplyFilters();
}

function incDeleteRecord(incidentId) {
  if (!confirm(`Delete incident ${incidentId}? This cannot be undone.`)) return;

  let records = incLoadAll();
  records = records.filter(r => r.incidentId !== incidentId);
  incSaveAll(records);
  incRenderSummary(records);
  incApplyFilters();

  // If we were editing this record, clear the form
  if (document.getElementById('inc-internal-id').value === incidentId) {
    incClearForm();
  }
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'incidentId', 'dateReported', 'timeReported', 'loggedBy', 'departmentRole',
  'plateNumber', 'driverName', 'helperName', 'incidentDate', 'incidentTime',
  'location', 'incidentType', 'severity', 'status',
  'incidentDescription', 'immediateActionTaken', 'peopleInvolved', 'witnesses', 'remarks',
  'photoReference', 'videoReference', 'evidenceNotes',
  'correctiveActionRequired', 'rootCause', 'correctiveActionPlan',
  'assignedTo', 'targetCompletionDate', 'followUpDate', 'correctiveActionStatus',
  'completionDate', 'completionNotes', 'verifiedBy', 'verificationRemarks',
  'createdAt', 'updatedAt'
];

function incExportCSV(records) {
  if (!records.length) {
    alert('No records to export.');
    return;
  }

  const rows = [CSV_HEADERS.join(',')];
  records.forEach(r => {
    const row = CSV_HEADERS.map(key => {
      const val = r[key] || '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
    });
    rows.push(row.join(','));
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `VNS-Incident-Report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Demo Record ──────────────────────────────────────────────────────────────

function incLoadDemo() {
  incClearForm();

  const demo = {
    incidentId: '',
    dateReported: new Date().toISOString().slice(0, 10),
    timeReported: '09:30',
    loggedBy: 'Encoder Demo',
    departmentRole: 'Dispatch',
    plateNumber: 'SJK-123',
    driverName: 'Juan dela Cruz',
    helperName: 'Pedro Santos',
    incidentDate: new Date().toISOString().slice(0, 10),
    incidentTime: '08:15',
    location: 'SLEX, Alabang Exit',
    incidentType: 'Truck damage',
    severity: 'High',
    status: 'Corrective action required',
    incidentDescription: 'Sample: Truck SJK-123 sustained a blown rear tire while exiting SLEX near Alabang. Driver safely pulled over to the emergency lane. No injuries reported. Cargo unaffected.',
    immediateActionTaken: 'Driver called dispatcher. Spare tire replacement performed on-site by helper. Truck resumed route after 45 minutes.',
    peopleInvolved: 'Juan dela Cruz (Driver), Pedro Santos (Helper)',
    witnesses: 'None reported',
    remarks: 'This is a demo record for testing. All names are fictional.',
    photoReference: 'incident_photo_SJK123_sample.jpg',
    videoReference: '',
    evidenceNotes: 'Photo shows rear driver-side tire damage. Sample data only.',
    correctiveActionRequired: 'Yes',
    rootCause: 'Sample: Tire was overdue for replacement. Preventive inspection was skipped.',
    correctiveActionPlan: 'Sample: 1) Replace all rear tires on SJK-123. 2) Update tire inspection schedule. 3) Brief driver on tire pressure checks.',
    assignedTo: 'Maintenance Coordinator',
    targetCompletionDate: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().slice(0, 10);
    })(),
    followUpDate: '',
    correctiveActionStatus: 'Pending',
    completionDate: '',
    completionNotes: '',
    verifiedBy: '',
    verificationRemarks: '',
    createdAt: '',
    updatedAt: ''
  };

  incSetFormData(demo);
  document.getElementById('inc-edit-notice').textContent = 'Demo record loaded — save to store it.';
  incShowStatus('Demo loaded. Fill in any details and save.', 'info');
}

// ─── Tab Switching ────────────────────────────────────────────────────────────

function incBindTabs() {
  document.querySelectorAll('[data-inc-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.incTab;

      document.querySelectorAll('[data-inc-tab]').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn);
      });
      document.querySelectorAll('.inc-tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `inc-tab-${target}`);
      });

      // Refresh table when switching to records tab
      if (target === 'records') incApplyFilters();
    });
  });
}

// ─── File Picker Labels ───────────────────────────────────────────────────────

function incBindFilePickers() {
  const photoInput = document.getElementById('inc-photo-file');
  const videoInput = document.getElementById('inc-video-file');

  photoInput.addEventListener('change', () => {
    document.getElementById('inc-photo-filename').textContent =
      photoInput.files[0] ? photoInput.files[0].name : 'No file selected';
  });

  videoInput.addEventListener('change', () => {
    document.getElementById('inc-video-filename').textContent =
      videoInput.files[0] ? videoInput.files[0].name : 'No file selected';
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function incInit() {
  incBindTabs();
  incBindFilePickers();

  // CA required toggle
  document.getElementById('inc-ca-required').addEventListener('change', incToggleCAFields);

  // CA status change (show/hide completion fields)
  document.getElementById('inc-ca-status').addEventListener('change', incToggleCAFields);

  // Form submit
  document.getElementById('inc-form').addEventListener('submit', incSaveRecord);

  // Clear form
  document.getElementById('inc-clear-btn').addEventListener('click', () => {
    if (document.getElementById('inc-internal-id').value) {
      if (!confirm('Clear form and start a new incident?')) return;
    }
    incClearForm();
  });

  // Demo
  document.getElementById('inc-demo-btn').addEventListener('click', () => {
    if (!confirm('Load a demo record? This will replace your current form data.')) return;
    incLoadDemo();
  });

  // Export from form tab
  document.getElementById('inc-export-btn').addEventListener('click', () => {
    incExportCSV(incLoadAll());
  });

  // Export from records tab
  document.getElementById('inc-export-records-btn').addEventListener('click', () => {
    incExportCSV(incLoadAll());
  });

  // Filters
  ['inc-search', 'inc-filter-status', 'inc-filter-severity', 'inc-filter-ca-status',
    'inc-filter-date-from', 'inc-filter-date-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', incApplyFilters);
  });

  // Initial render
  incClearForm();
  const records = incProcessOverdue(incLoadAll());
  incRenderSummary(records);
  incApplyFilters();
}

document.addEventListener('DOMContentLoaded', incInit);
