/**
 * Indiana Re-Entry Dashboard — UI Renderers & Components
 */

import { getCountyDirectory, getStateWIDEAgencies, getAvailableCounties } from './lib/county-directory.js';

/**
 * Format ISO date (YYYY-MM-DD) to friendly readable format
 */
export function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length < 3) return dateStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format bytes to readable string (e.g. 1.2 MB)
 */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Render Case Cards Grid
 */
export function renderCasesGrid(container, cases, onSelectCase) {
  container.innerHTML = '';
  const emptyEl = document.getElementById('cases-empty');

  if (!cases || cases.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  cases.forEach((caseItem) => {
    const card = document.createElement('div');
    card.className = 'case-card';
    card.setAttribute('data-status', caseItem.status || 'imported');

    // Status label formatting
    const statusTitles = {
      imported: 'In Review',
      petitioned: 'Petitioned',
      granted: 'Order Granted',
      denied: 'Denied',
      archived: 'Archived'
    };
    const statusClass = `status-${caseItem.status || 'imported'}`;
    const statusText = statusTitles[caseItem.status] || caseItem.status;

    // Offense Tier label
    const tierLabels = {
      1: 'Tier 1: Arrest / Non-Conviction',
      2: 'Tier 2: Misdemeanor',
      3: 'Tier 3: Level 6 / Class D Felony',
      4: 'Tier 4: Major Felony',
      5: 'Tier 5: Serious Bodily Injury'
    };
    const tierText = tierLabels[caseItem.offenseTier] || `Tier ${caseItem.offenseTier}`;

    // Milestone text
    let milestoneHtml = '';
    if (caseItem.status === 'petitioned') {
      milestoneHtml = `
        <div class="case-milestone-box">
          <div class="milestone-title">Pending Court Action</div>
          <div class="milestone-desc">⚖️ 30-Day Prosecutor Response Window</div>
        </div>
      `;
    } else if (caseItem.status === 'granted') {
      milestoneHtml = `
        <div class="case-milestone-box" style="border-left: 3px solid var(--color-success);">
          <div class="milestone-title">Action Required</div>
          <div class="milestone-desc">📮 Serve Certified Order to ISP & BMV</div>
        </div>
      `;
    } else if (caseItem.dispositionDate) {
      milestoneHtml = `
        <div class="case-milestone-box">
          <div class="milestone-title">Statutory Timeline</div>
          <div class="milestone-desc">📅 Disposed: ${formatDate(caseItem.dispositionDate)}</div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="case-card-header">
        <div>
          <div class="case-cause">${caseItem.causeNumber || 'Unknown Cause #'}</div>
          <div style="font-size: 0.8rem; color: var(--color-text-muted);">${caseItem.county || 'County Unknown'} Court</div>
        </div>
        <span class="status-pill ${statusClass}">${statusText}</span>
      </div>

      <div class="case-details-list">
        <div class="case-detail-item">
          <span class="case-detail-label">Classification:</span>
          <span class="case-detail-val">${tierText}</span>
        </div>
        ${caseItem.charges ? `
        <div class="case-detail-item">
          <span class="case-detail-label">Charges:</span>
          <span class="case-detail-val" style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${caseItem.charges}</span>
        </div>` : ''}
        ${caseItem.dispositionDate ? `
        <div class="case-detail-item">
          <span class="case-detail-label">Disposition Date:</span>
          <span class="case-detail-val">${formatDate(caseItem.dispositionDate)}</span>
        </div>` : ''}
      </div>

      ${milestoneHtml}

      <div class="case-card-footer">
        <span style="font-size: 0.75rem; color: var(--color-text-muted);">Updated ${formatDate(caseItem.updatedAt)}</span>
        <button class="btn btn-secondary btn-sm btn-view-detail">View Details →</button>
      </div>
    `;

    card.querySelector('.btn-view-detail').addEventListener('click', () => {
      onSelectCase(caseItem);
    });

    container.appendChild(card);
  });
}

/**
 * Render Case Details Modal Content
 */
export function renderCaseDetailModal(modalBody, caseItem, linkedDocs, linkedEvents, onAttachDoc, onAddMilestone) {
  const dir = caseItem.county ? getCountyDirectory(caseItem.county) : null;

  // Run statutory evaluation if IndianaExpungement global exists
  let eligibilityHtml = '';
  if (typeof window !== 'undefined' && window.IndianaExpungement) {
    try {
      const assessment = window.IndianaExpungement.assessEligibility({
        case_number: caseItem.causeNumber,
        disposition_date: caseItem.dispositionDate,
        sentence_completed_date: caseItem.sentenceCompletedDate,
        level: caseItem.offenseTier === 1 ? 'arrest' : (caseItem.offenseTier === 2 ? 'misdemeanor' : 'felony'),
        charges: caseItem.charges,
        has_pending_charges: false,
        has_unpaid_fees: false
      });

      const isEligible = assessment.is_eligible || assessment.status === 'eligible';
      eligibilityHtml = `
        <div class="alert-banner ${isEligible ? 'alert-info' : 'alert-warning'}" style="margin-bottom: 1.25rem;">
          <span>⚖️</span>
          <div>
            <strong>Statutory Assessment (IC § 35-38-9): ${assessment.statute_section || 'Section Analysis'}</strong>
            <p>${assessment.message || (isEligible ? 'Appears eligible for expungement petition.' : 'Waiting period or statutory prerequisites may not yet be met.')}</p>
          </div>
        </div>
      `;
    } catch (err) {
      console.warn('Eligibility evaluation notice:', err);
    }
  }

  modalBody.innerHTML = `
    ${eligibilityHtml}

    <div class="form-row" style="margin-bottom: 1rem;">
      <div class="form-group">
        <label class="form-label">Case Status</label>
        <select id="detail-input-status" class="form-control">
          <option value="imported" ${caseItem.status === 'imported' ? 'selected' : ''}>Imported / In Review</option>
          <option value="petitioned" ${caseItem.status === 'petitioned' ? 'selected' : ''}>Petitioned (Court Pending)</option>
          <option value="granted" ${caseItem.status === 'granted' ? 'selected' : ''}>Granted (Order Received)</option>
          <option value="denied" ${caseItem.status === 'denied' ? 'selected' : ''}>Denied</option>
          <option value="archived" ${caseItem.status === 'archived' ? 'selected' : ''}>Archived</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Offense Tier</label>
        <select id="detail-input-tier" class="form-control">
          <option value="1" ${caseItem.offenseTier === 1 ? 'selected' : ''}>Tier 1: Arrest / Non-Conviction</option>
          <option value="2" ${caseItem.offenseTier === 2 ? 'selected' : ''}>Tier 2: Misdemeanor</option>
          <option value="3" ${caseItem.offenseTier === 3 ? 'selected' : ''}>Tier 3: Level 6 / Class D Felony</option>
          <option value="4" ${caseItem.offenseTier === 4 ? 'selected' : ''}>Tier 4: Major Felony</option>
          <option value="5" ${caseItem.offenseTier === 5 ? 'selected' : ''}>Tier 5: Serious Bodily Injury</option>
        </select>
      </div>
    </div>

    <div class="form-row" style="margin-bottom: 1rem;">
      <div class="form-group">
        <label class="form-label">Disposition / Conviction Date</label>
        <input type="date" id="detail-input-disposition" class="form-control" value="${caseItem.dispositionDate || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Sentence Completed Date</label>
        <input type="date" id="detail-input-sentence-end" class="form-control" value="${caseItem.sentenceCompletedDate || ''}">
      </div>
    </div>

    <!-- County Service Directory Card -->
    ${dir ? `
    <div style="background-color: var(--color-surface-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 1.25rem;">
      <h4 style="font-family: var(--font-serif); font-size: 0.95rem; margin-bottom: 0.5rem; color: var(--color-navy);">
        🏛️ County Service Guide: ${dir.name} County
      </h4>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; font-size: 0.82rem;">
        <div>
          <strong>Clerk of the Court:</strong><br>
          ${dir.clerk.title}<br>
          ${dir.clerk.address}, ${dir.clerk.city}, IN ${dir.clerk.zip}<br>
          Phone: ${dir.clerk.phone}
        </div>
        <div>
          <strong>Prosecuting Attorney:</strong><br>
          ${dir.prosecutor.title}<br>
          ${dir.prosecutor.address}, ${dir.prosecutor.city}, IN ${dir.prosecutor.zip}<br>
          Phone: ${dir.prosecutor.phone}
        </div>
      </div>
    </div>` : ''}

    <!-- Attached Documents Section -->
    <div style="margin-bottom: 1.25rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <h4 style="font-size: 0.95rem; font-weight: 700;">Case Documents (${linkedDocs.length})</h4>
        <button id="btn-detail-add-doc" class="btn btn-secondary btn-sm">+ Attach Document</button>
      </div>
      <div id="detail-docs-list" style="display: flex; flex-direction: column; gap: 0.4rem;">
        ${linkedDocs.length === 0 ? '<div style="font-size: 0.85rem; color: var(--color-text-muted);">No documents attached to this case.</div>' : ''}
      </div>
    </div>

    <!-- Milestones & Deadlines for this case -->
    <div style="margin-bottom: 1.25rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <h4 style="font-size: 0.95rem; font-weight: 700;">Case Milestones & Statutory Deadlines</h4>
        <button id="btn-detail-add-event" class="btn btn-secondary btn-sm">+ Add Custom Event</button>
      </div>
      <div id="detail-events-list" style="display: flex; flex-direction: column; gap: 0.4rem;">
        ${linkedEvents.length === 0 ? '<div style="font-size: 0.85rem; color: var(--color-text-muted);">No milestones scheduled.</div>' : ''}
      </div>
    </div>

    <!-- Notes -->
    <div class="form-group">
      <label class="form-label">Case Notes & Journal</label>
      <textarea id="detail-input-notes" class="form-control" rows="3" placeholder="Case notes, judge correspondence, certified mailing tracking numbers...">${caseItem.notes || ''}</textarea>
    </div>
  `;

  // Render linked docs
  const docsListEl = modalBody.querySelector('#detail-docs-list');
  linkedDocs.forEach((doc) => {
    const item = document.createElement('div');
    item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: var(--color-surface-bg); border-radius: var(--radius-sm); border: 1px solid var(--color-border); font-size: 0.85rem;';
    item.innerHTML = `
      <div>
        <strong>📄 ${doc.name}</strong> <span style="color: var(--color-text-muted);">(${formatBytes(doc.size)})</span>
        <div style="font-size: 0.75rem; color: var(--color-text-muted);">${doc.type} • Added ${formatDate(doc.createdAt)}</div>
      </div>
      <button class="btn btn-secondary btn-sm btn-download-doc">Download</button>
    `;
    item.querySelector('.btn-download-doc').addEventListener('click', () => {
      downloadDocumentBlob(doc);
    });
    docsListEl.appendChild(item);
  });

  // Render linked events
  const eventsListEl = modalBody.querySelector('#detail-events-list');
  linkedEvents.forEach((ev) => {
    const item = document.createElement('div');
    item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: var(--color-surface-bg); border-radius: var(--radius-sm); border: 1px solid var(--color-border); font-size: 0.85rem;';
    item.innerHTML = `
      <div>
        <strong>${ev.title}</strong>
        <div style="font-size: 0.75rem; color: var(--color-text-muted);">${ev.notes || ''}</div>
      </div>
      <div style="text-align: right;">
        <span style="font-weight: 700; color: var(--color-primary);">${formatDate(ev.date)}</span>
      </div>
    `;
    eventsListEl.appendChild(item);
  });

  // Event handlers for sub-actions
  modalBody.querySelector('#btn-detail-add-doc').addEventListener('click', onAttachDoc);
  modalBody.querySelector('#btn-detail-add-event').addEventListener('click', onAddMilestone);
}

/**
 * Trigger client-side download of a document stored in IndexedDB
 */
export function downloadDocumentBlob(doc) {
  if (!doc.data) {
    alert('Document content is empty or unavailable.');
    return;
  }

  let blob = doc.data;
  if (!(doc.data instanceof Blob)) {
    blob = new Blob([doc.data], { type: doc.mimeType || 'application/pdf' });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.name || 'Expungement_Document.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Render Calendar Month Grid & Agenda Feed
 */
export function renderCalendar(currentDate, events, onSelectEvent) {
  const grid = document.getElementById('calendar-grid');
  const monthTitle = document.getElementById('calendar-month-year');
  const agendaList = document.getElementById('agenda-list');
  const agendaCount = document.getElementById('agenda-count');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  monthTitle.textContent = `${monthNames[month]} ${year}`;

  // Clear previous day cells (keep header days)
  while (grid.children.length > 7) {
    grid.removeChild(grid.lastChild);
  }

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const todayStr = new Date().toISOString().split('T')[0];

  // Previous month trailing days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const cell = document.createElement('div');
    cell.className = 'calendar-cell other-month';
    cell.innerHTML = `<span class="calendar-cell-num">${daysInPrevMonth - i}</span>`;
    grid.appendChild(cell);
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cell.className = 'calendar-cell' + (dayStr === todayStr ? ' today' : '');
    cell.innerHTML = `<span class="calendar-cell-num">${day}</span>`;

    // Filter events for this day
    const dayEvents = events.filter((ev) => ev.date === dayStr);
    dayEvents.forEach((ev) => {
      const pill = document.createElement('div');
      pill.className = `event-dot-pill event-${ev.type || 'reminder'}`;
      pill.title = `${ev.title} (${ev.notes || ''})`;
      pill.textContent = ev.title;
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectEvent(ev);
      });
      cell.appendChild(pill);
    });

    grid.appendChild(cell);
  }

  // Next month leading days to complete grid row
  const totalCells = firstDayIndex + daysInMonth;
  const remainingCells = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= remainingCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-cell other-month';
    cell.innerHTML = `<span class="calendar-cell-num">${i}</span>`;
    grid.appendChild(cell);
  }

  // Populate Agenda List
  agendaList.innerHTML = '';
  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date));
  agendaCount.textContent = sortedEvents.length;

  if (sortedEvents.length === 0) {
    agendaList.innerHTML = '<div style="font-size: 0.85rem; color: var(--color-text-muted);">No upcoming milestones scheduled.</div>';
    return;
  }

  sortedEvents.forEach((ev) => {
    const item = document.createElement('div');
    item.className = 'agenda-item';
    item.innerHTML = `
      <div class="agenda-date">${formatDate(ev.date)}</div>
      <div class="agenda-item-title">${ev.title}</div>
      ${ev.notes ? `<div class="agenda-item-desc">${ev.notes}</div>` : ''}
    `;
    agendaList.appendChild(item);
  });
}

/**
 * Render Documents Grid
 */
export function renderDocumentsGrid(container, docs, cases, onDeleteDoc) {
  container.innerHTML = '';
  const emptyEl = document.getElementById('documents-empty');

  if (!docs || docs.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  const caseMap = new Map(cases.map((c) => [c.id, c.causeNumber]));

  docs.forEach((doc) => {
    const card = document.createElement('div');
    card.className = 'case-card';
    const linkedCause = doc.caseId ? caseMap.get(doc.caseId) || 'Linked Case' : 'General Re-Entry';

    card.innerHTML = `
      <div class="case-card-header">
        <div style="font-weight: 700; font-size: 1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px;">
          📄 ${doc.name}
        </div>
        <span class="status-pill status-imported">${doc.type}</span>
      </div>
      <div class="case-details-list">
        <div class="case-detail-item">
          <span class="case-detail-label">File Size:</span>
          <span class="case-detail-val">${formatBytes(doc.size)}</span>
        </div>
        <div class="case-detail-item">
          <span class="case-detail-label">Associated Case:</span>
          <span class="case-detail-val">${linkedCause}</span>
        </div>
        <div class="case-detail-item">
          <span class="case-detail-label">Saved:</span>
          <span class="case-detail-val">${formatDate(doc.createdAt)}</span>
        </div>
      </div>
      <div class="case-card-footer">
        <button class="btn btn-danger btn-sm btn-del-doc">Delete</button>
        <button class="btn btn-primary btn-sm btn-dl-doc">Download File</button>
      </div>
    `;

    card.querySelector('.btn-dl-doc').addEventListener('click', () => {
      downloadDocumentBlob(doc);
    });

    card.querySelector('.btn-del-doc').addEventListener('click', () => {
      if (confirm(`Delete ${doc.name}?`)) {
        onDeleteDoc(doc.id);
      }
    });

    container.appendChild(card);
  });
}

/**
 * Render 92-County Directory Lookup
 */
export function populateCountyDirectory() {
  const select = document.getElementById('county-select');
  const infoContainer = document.getElementById('county-info-container');
  const agenciesContainer = document.getElementById('statewide-agencies-container');

  const counties = getAvailableCounties();
  select.innerHTML = '';
  counties.forEach((county) => {
    const opt = document.createElement('option');
    opt.value = county;
    opt.textContent = county + ' County';
    if (county === 'Marion') opt.selected = true;
    select.appendChild(opt);
  });

  function showCounty(name) {
    const dir = getCountyDirectory(name);
    if (!dir) return;

    infoContainer.innerHTML = `
      <div class="directory-office-card">
        <div class="directory-office-title">🏛️ ${dir.clerk.title}</div>
        <div class="directory-office-meta">
          <strong>Address:</strong><br>${dir.clerk.address}<br>${dir.clerk.city}, IN ${dir.clerk.zip}<br>
          <strong>Phone:</strong> ${dir.clerk.phone}<br>
          <strong>E-Filing Code:</strong> <code>${dir.clerk.efileCode}</code>
        </div>
      </div>

      <div class="directory-office-card">
        <div class="directory-office-title">⚖️ ${dir.prosecutor.title}</div>
        <div class="directory-office-meta">
          <strong>Division:</strong> ${dir.prosecutor.division}<br>
          <strong>Address:</strong><br>${dir.prosecutor.address}<br>${dir.prosecutor.city}, IN ${dir.prosecutor.zip}<br>
          <strong>Phone:</strong> ${dir.prosecutor.phone}<br>
          <strong>Service Method:</strong> ${dir.prosecutor.serviceNotes}
        </div>
      </div>

      <div class="directory-office-card">
        <div class="directory-office-title">🚓 ${dir.sheriff.title}</div>
        <div class="directory-office-meta">
          <strong>Address:</strong><br>${dir.sheriff.address}<br>${dir.sheriff.city}, IN ${dir.sheriff.zip}<br>
          <strong>Phone:</strong> ${dir.sheriff.phone}
        </div>
      </div>
    `;
  }

  // Populate statewide agencies (ISP and BMV)
  const agencies = getStateWIDEAgencies();
  agenciesContainer.innerHTML = `
    <div class="directory-office-card">
      <div class="directory-office-title">🛡️ ${agencies.isp.name}</div>
      <div class="directory-office-meta">
        <strong>Division:</strong> ${agencies.isp.division}<br>
        <strong>Address:</strong><br>${agencies.isp.address}<br>${agencies.isp.city}, IN ${agencies.isp.zip}<br>
        <strong>Phone:</strong> ${agencies.isp.phone}<br>
        <strong>Statutory Notice:</strong> ${agencies.isp.notes}
      </div>
    </div>

    <div class="directory-office-card">
      <div class="directory-office-title">🚗 ${agencies.bmv.name}</div>
      <div class="directory-office-meta">
        <strong>Division:</strong> ${agencies.bmv.division}<br>
        <strong>Address:</strong><br>${agencies.bmv.address}<br>${agencies.bmv.city}, IN ${agencies.bmv.zip}<br>
        <strong>Phone:</strong> ${agencies.bmv.phone}<br>
        <strong>Statutory Notice:</strong> ${agencies.bmv.notes}
      </div>
    </div>
  `;

  select.addEventListener('change', () => {
    showCounty(select.value);
  });

  showCounty('Marion');
}
