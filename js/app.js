/**
 * Indiana Re-Entry Vault — Main Application Controller & State Orchestrator
 */

import * as vault from './vault.js';
import * as timeline from './timeline.js';
import * as ui from './ui.js';
import { populateCountyDirectory, renderCasesGrid, renderCaseDetailModal, renderCalendar, renderDocumentsGrid } from './ui.js';

// Application State
const state = {
  cases: [],
  documents: [],
  events: [],
  settings: {},
  activeCase: null,
  calendarDate: new Date(),
  filterStatus: 'all',
  searchQuery: ''
};

// ─── Initialization ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initTheme();
    setupNavigation();
    setupModals();
    setupCauseNumberParser();
    setupEventHandlers();
    populateCountyDirectory();
    await reloadAllData();
  } catch (err) {
    console.error('Initialization error:', err);
  }
});

/**
 * Initialize theme (light/dark)
 */
async function initTheme() {
  const settings = await vault.getSettings();
  state.settings = settings;
  const theme = settings.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

/**
 * Reload data from IndexedDB and refresh views
 */
export async function reloadAllData() {
  state.cases = await vault.getAllCases();
  state.documents = await vault.getAllDocuments();
  state.events = await vault.getAllEvents();

  updateMultiCountyAlert();
  renderCurrentCases();
  renderCurrentCalendar();
  renderCurrentDocuments();
  updateStorageMeter();
  populateCaseDropdowns();
}

/**
 * Check if convictions cross multiple counties and display statutory warning
 */
function updateMultiCountyAlert() {
  const banner = document.getElementById('multi-county-banner');
  if (!banner) return;

  const distinctCounties = new Set(state.cases.map((c) => c.county).filter(Boolean));
  const hasMultiple = distinctCounties.size > 1;

  if (hasMultiple) {
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

// ─── Navigation ──────────────────────────────────────────────────────

function setupNavigation() {
  const navTabs = document.querySelectorAll('.nav-tab');
  const viewPanels = document.querySelectorAll('.view-panel');

  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-target');

      navTabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      viewPanels.forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const activePanel = document.getElementById(`view-${target}`);
      if (activePanel) {
        activePanel.classList.add('active');
      }

      if (target === 'calendar') {
        renderCurrentCalendar();
      } else if (target === 'documents') {
        renderCurrentDocuments();
      } else if (target === 'settings') {
        updateStorageMeter();
      }
    });
  });
}

// ─── Cause Number Parser & Guided Entry ─────────────────────────────

function setupCauseNumberParser() {
  const numberInput = document.getElementById('case-input-number');
  const countyInput = document.getElementById('case-input-county');
  const tierSelect = document.getElementById('case-input-tier');
  const previewBadge = document.getElementById('cause-parser-preview');

  if (!numberInput) return;

  numberInput.addEventListener('input', () => {
    const val = numberInput.value.trim().toUpperCase();
    if (!window.IndianaExpungement || val.length < 5) {
      previewBadge.style.display = 'none';
      return;
    }

    try {
      const countyCode = window.IndianaExpungement.extractCountyCode(val);
      const courtCode = window.IndianaExpungement.extractCourtCode(val);
      const caseType = window.IndianaExpungement.extractCaseTypeCode(val);
      const countyName = window.IndianaExpungement.getCountyName(countyCode);

      if (countyName && countyName !== `County ${countyCode}`) {
        countyInput.value = countyName;

        let detectedTier = 2; // default misdemeanor
        let typeDesc = 'Misdemeanor';

        if (caseType) {
          const mapping = window.IndianaExpungement.CASE_TYPE_MAP[caseType];
          if (mapping) {
            if (mapping.level === 'felony') {
              if (mapping.class === 'D' || mapping.class === '6') {
                detectedTier = 3;
                typeDesc = 'Class D / Level 6 Felony';
              } else {
                detectedTier = 4;
                typeDesc = `Major Felony (Class ${mapping.class})`;
              }
            } else if (mapping.level === 'misdemeanor') {
              detectedTier = 2;
              typeDesc = 'Misdemeanor';
            } else if (mapping.level === 'miscellaneous_criminal') {
              detectedTier = 1;
              typeDesc = 'Arrest / Non-Conviction';
            }
          }
        }

        tierSelect.value = String(detectedTier);

        previewBadge.style.display = 'block';
        previewBadge.innerHTML = `
          <strong>Auto-Detected:</strong> ${countyName} County (${courtCode}) • <strong>Type:</strong> ${typeDesc} (${caseType || 'N/A'})
        `;
      }
    } catch (e) {
      previewBadge.style.display = 'none';
    }
  });
}

// ─── Modal Management ────────────────────────────────────────────────

function setupModals() {
  const closeButtons = document.querySelectorAll('.close-modal');
  closeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-backdrop').forEach((m) => m.classList.remove('active'));
    });
  });

  // Open Add Case Modal
  const btnAdd = document.getElementById('btn-add-case-main');
  const btnHeaderAdd = document.getElementById('btn-header-add');
  const modalAdd = document.getElementById('modal-add-case');

  const openAddModal = () => {
    document.getElementById('form-add-case').reset();
    document.getElementById('cause-parser-preview').style.display = 'none';
    modalAdd.classList.add('active');
  };

  if (btnAdd) btnAdd.addEventListener('click', openAddModal);
  if (btnHeaderAdd) btnHeaderAdd.addEventListener('click', openAddModal);

  // Open Import Modal
  const btnImportModal = document.getElementById('btn-import-vault-modal');
  const btnSettingsImport = document.getElementById('btn-import-vault');
  const modalImport = document.getElementById('modal-import-vault');

  const openImportModal = () => {
    document.getElementById('import-json-text').value = '';
    modalImport.classList.add('active');
  };

  if (btnImportModal) btnImportModal.addEventListener('click', openImportModal);
  if (btnSettingsImport) btnSettingsImport.addEventListener('click', openImportModal);

  // Open Document Upload Modal
  const btnUploadModal = document.getElementById('btn-upload-doc-modal');
  const modalUpload = document.getElementById('modal-upload-doc');

  if (btnUploadModal) {
    btnUploadModal.addEventListener('click', () => {
      document.getElementById('form-upload-doc').reset();
      populateCaseDropdowns();
      modalUpload.classList.add('active');
    });
  }
}

function populateCaseDropdowns() {
  const select = document.getElementById('doc-case-select');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">-- General Re-Entry Document --</option>';
  state.cases.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.causeNumber} (${c.county || 'Unknown'})`;
    select.appendChild(opt);
  });
  select.value = currentVal;
}

// ─── Event Handlers ──────────────────────────────────────────────────

function setupEventHandlers() {
  // Theme Toggle
  document.getElementById('btn-theme-toggle').addEventListener('click', async () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    updateThemeIcon(next);
    await vault.saveSettings({ ...state.settings, theme: next });
  });

  // Search & Filter
  const searchInput = document.getElementById('case-search');
  const filterSelect = document.getElementById('case-filter-status');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      renderCurrentCases();
    });
  }

  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      state.filterStatus = e.target.value;
      renderCurrentCases();
    });
  }

  // Add Case Form Submit
  const formAddCase = document.getElementById('form-add-case');
  if (formAddCase) {
    formAddCase.addEventListener('submit', async (e) => {
      e.preventDefault();

      const causeNumber = document.getElementById('case-input-number').value.trim().toUpperCase();
      const county = document.getElementById('case-input-county').value.trim();
      const offenseTier = Number(document.getElementById('case-input-tier').value) || 2;
      const dispositionDate = document.getElementById('case-input-disposition').value || null;
      const sentenceCompletedDate = document.getElementById('case-input-sentence-end').value || null;
      const status = document.getElementById('case-input-status').value || 'imported';
      const filingDate = document.getElementById('case-input-filing-date').value || null;
      const charges = document.getElementById('case-input-charges').value.trim();
      const notes = document.getElementById('case-input-notes').value.trim();

      const newCase = await vault.saveCase({
        causeNumber,
        county,
        offenseTier,
        dispositionDate,
        sentenceCompletedDate,
        status,
        filingDate,
        charges,
        notes,
        source: 'manual'
      });

      // Auto-generate statutory deadlines for this case
      const milestones = timeline.generateMilestonesForCase(newCase, state.cases);
      for (const m of milestones) {
        await vault.saveEvent(m);
      }

      document.getElementById('modal-add-case').classList.remove('active');
      await reloadAllData();
    });
  }

  // Upload Document Form Submit
  const formUpload = document.getElementById('form-upload-doc');
  if (formUpload) {
    formUpload.addEventListener('submit', async (e) => {
      e.preventDefault();
      const caseId = document.getElementById('doc-case-select').value || null;
      const type = document.getElementById('doc-type-select').value;
      const fileInput = document.getElementById('doc-file-input');

      if (!fileInput.files || fileInput.files.length === 0) return;
      const file = fileInput.files[0];
      const buffer = await file.arrayBuffer();

      await vault.saveDocument({
        caseId,
        type,
        name: file.name,
        mimeType: file.type || 'application/pdf',
        data: buffer,
        size: file.size
      });

      document.getElementById('modal-upload-doc').classList.remove('active');
      await reloadAllData();
    });
  }

  // Calendar Controls
  document.getElementById('cal-prev').addEventListener('click', () => {
    state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
    renderCurrentCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
    renderCurrentCalendar();
  });
  document.getElementById('cal-today').addEventListener('click', () => {
    state.calendarDate = new Date();
    renderCurrentCalendar();
  });

  // Export .ICS
  document.getElementById('btn-export-ics').addEventListener('click', () => {
    timeline.downloadCalendarICS(state.events);
  });

  // Export Vault Backup
  const exportHandler = async () => {
    const backup = await vault.exportVault();
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Indiana_ReEntry_Vault_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  document.getElementById('btn-header-export').addEventListener('click', exportHandler);
  document.getElementById('btn-export-vault').addEventListener('click', exportHandler);

  // Import Vault Execution
  document.getElementById('btn-execute-import').addEventListener('click', async () => {
    const fileInput = document.getElementById('import-file-input');
    const textInput = document.getElementById('import-json-text').value.trim();
    const overwrite = document.getElementById('import-overwrite-check').checked;

    let jsonData = null;

    if (fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const text = await file.text();
      jsonData = JSON.parse(text);
    } else if (textInput) {
      jsonData = JSON.parse(textInput);
    }

    if (!jsonData) {
      alert('Please select a JSON file or paste valid JSON data.');
      return;
    }

    // Check if it's an Expunger output or vault backup
    if (jsonData.cases || jsonData.meta) {
      await vault.importVault(jsonData, overwrite);
    } else if (Array.isArray(jsonData)) {
      // Raw case array
      for (const item of jsonData) {
        await vault.saveCase(item);
      }
    }

    document.getElementById('modal-import-vault').classList.remove('active');
    await reloadAllData();
    alert('Import completed successfully.');
  });

  // Save changes from Case Detail Modal
  document.getElementById('btn-detail-save-changes').addEventListener('click', async () => {
    if (!state.activeCase) return;

    const updatedStatus = document.getElementById('detail-input-status').value;
    const updatedTier = Number(document.getElementById('detail-input-tier').value);
    const updatedDisp = document.getElementById('detail-input-disposition').value || null;
    const updatedSentence = document.getElementById('detail-input-sentence-end').value || null;
    const updatedNotes = document.getElementById('detail-input-notes').value.trim();

    const previousStatus = state.activeCase.status;

    await vault.updateCase(state.activeCase.id, {
      status: updatedStatus,
      offenseTier: updatedTier,
      dispositionDate: updatedDisp,
      sentenceCompletedDate: updatedSentence,
      notes: updatedNotes
    });

    // If status transitioned (e.g. from imported to petitioned or granted), refresh statutory milestones
    if (previousStatus !== updatedStatus) {
      const updatedCase = await vault.getCase(state.activeCase.id);
      const newMilestones = timeline.generateMilestonesForCase(updatedCase, state.cases);
      for (const m of newMilestones) {
        await vault.saveEvent(m);
      }
    }

    document.getElementById('modal-case-detail').classList.remove('active');
    await reloadAllData();
  });

  // Delete case
  document.getElementById('btn-detail-delete-case').addEventListener('click', async () => {
    if (!state.activeCase) return;
    if (confirm(`Are you sure you want to permanently delete case ${state.activeCase.causeNumber} and all its documents?`)) {
      await vault.deleteCase(state.activeCase.id);
      document.getElementById('modal-case-detail').classList.remove('active');
      await reloadAllData();
    }
  });

  // Wipe All Data
  document.getElementById('btn-wipe-vault').addEventListener('click', async () => {
    if (confirm('CRITICAL: Are you sure you want to PERMANENTLY WIPE ALL DATA from your local browser vault?')) {
      if (confirm('Confirm a second time: This cannot be undone. All cases, attached files, and deadlines will be deleted.')) {
        await vault.clearAllData();
        await reloadAllData();
        alert('Vault wiped successfully.');
      }
    }
  });
}

// ─── Rendering Helpers ───────────────────────────────────────────────

function renderCurrentCases() {
  const container = document.getElementById('cases-grid');
  let filtered = [...state.cases];

  if (state.filterStatus !== 'all') {
    filtered = filtered.filter((c) => c.status === state.filterStatus);
  }

  if (state.searchQuery) {
    filtered = filtered.filter((c) => {
      const cause = (c.causeNumber || '').toLowerCase();
      const county = (c.county || '').toLowerCase();
      const court = (c.court || '').toLowerCase();
      const charges = (c.charges || '').toLowerCase();
      return cause.includes(state.searchQuery) ||
             county.includes(state.searchQuery) ||
             court.includes(state.searchQuery) ||
             charges.includes(state.searchQuery);
    });
  }

  ui.renderCasesGrid(container, filtered, openCaseDetailModal);
}

async function openCaseDetailModal(caseItem) {
  state.activeCase = caseItem;
  const modal = document.getElementById('modal-case-detail');
  const modalBody = document.getElementById('detail-modal-body');
  document.getElementById('detail-cause-number').textContent = caseItem.causeNumber;
  document.getElementById('detail-court-county').textContent = `${caseItem.county || 'Unknown'} County Court`;

  const linkedDocs = await vault.getDocumentsByCase(caseItem.id);
  const linkedEvents = await vault.getEventsByCase(caseItem.id);

  ui.renderCaseDetailModal(
    modalBody,
    caseItem,
    linkedDocs,
    linkedEvents,
    () => {
      // Attach doc callback
      document.getElementById('doc-case-select').value = caseItem.id;
      document.getElementById('modal-upload-doc').classList.add('active');
    },
    async () => {
      // Add milestone callback
      const title = prompt('Milestone / Hearing Title:');
      if (!title) return;
      const date = prompt('Date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
      if (!date) return;

      await vault.saveEvent({
        caseId: caseItem.id,
        title,
        date,
        type: 'hearing',
        completed: false
      });
      await reloadAllData();
      await openCaseDetailModal(state.activeCase);
    }
  );

  modal.classList.add('active');
}

function renderCurrentCalendar() {
  ui.renderCalendar(state.calendarDate, state.events, (ev) => {
    alert(`Milestone: ${ev.title}\nDate: ${ui.formatDate(ev.date)}\nDetails: ${ev.notes || 'None'}`);
  });
}

function renderCurrentDocuments() {
  const container = document.getElementById('documents-grid');
  ui.renderDocumentsGrid(container, state.documents, state.cases, async (docId) => {
    await vault.deleteDocument(docId);
    await reloadAllData();
  });
}

async function updateStorageMeter() {
  const meterBar = document.getElementById('storage-meter-bar');
  const statsText = document.getElementById('storage-stats-text');
  if (!meterBar || !statsText) return;

  const stats = await vault.getStorageUsage();
  if (stats.usageMB !== 'N/A') {
    meterBar.style.width = `${Math.min(Number(stats.percentUsed) * 10, 100)}%`;
    statsText.textContent = `${stats.usageMB} MB used (Browser Quota: ${stats.quotaMB} MB, ${stats.percentUsed}% consumed)`;
  } else {
    statsText.textContent = 'Storage estimation not supported in this browser environment.';
  }
}
