/**
 * Bill Splitter
 * Pure ES6+ JavaScript, zero external libraries.
 * Features:
 * 1. Exact Penny Balancing Algorithm
 * 2. Real-Time Split Calculation
 * 3. Export as Plain Text Summary (.TXT) to Local Device
 * 4. Persistent History Logging with Load/Delete/Export
 * 5. Strict Validation & Overflow-Safe String Formatting
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'billsplitter_app_state_v1';
  const HISTORY_STORAGE_KEY = 'billsplitter_history_v1';

  // DOM Elements - Inputs & Controls
  const form = document.getElementById('split-form');
  const occasionInput = document.getElementById('occasion');
  const billAmountInput = document.getElementById('bill-amount');
  const numPeopleInput = document.getElementById('num-people');
  const currencySelect = document.getElementById('currency-select');
  const currencyPrefix = document.getElementById('currency-prefix');
  const btnDecrease = document.getElementById('btn-decrease-people');
  const btnIncrease = document.getElementById('btn-increase-people');
  const btnReset = document.getElementById('btn-reset');
  const btnCopy = document.getElementById('btn-copy-summary');
  const btnExportTxt = document.getElementById('btn-export-txt');
  const btnSaveHistory = document.getElementById('btn-save-history');
  const btnClearHistory = document.getElementById('btn-clear-history');
  
  // DOM Elements - Display Containers
  const alertBox = document.getElementById('alert-box');
  const alertMessage = document.getElementById('alert-message');
  const emptyState = document.getElementById('empty-state');
  const resultContent = document.getElementById('result-content');
  const breakdownList = document.getElementById('breakdown-list');
  const toastEl = document.getElementById('toast');
  const tipButtons = document.querySelectorAll('.tip-btn');
  const historyList = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');
  const historyCountBadge = document.getElementById('history-count-badge');

  // Summary Elements
  const summaryOccasion = document.getElementById('summary-occasion');
  const summarySplitAmount = document.getElementById('summary-split-amount');
  const metricTotalBill = document.getElementById('metric-total-bill');
  const metricPeopleCount = document.getElementById('metric-people-count');
  const metricBaseShare = document.getElementById('metric-base-share');
  const pennyBalanceText = document.getElementById('penny-balance-text');

  // App State
  let currentTipPercent = 0;
  let customPersonNames = {};
  let currentSplitData = null;
  let lastSavedHistorySignature = '';

  /**
   * Currency Symbol Map
   */
  const CURRENCY_SYMBOLS = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    INR: '₹',
    JPY: '¥',
    CAD: 'C$',
    AUD: 'A$',
    CHF: 'CHF '
  };

  function getCurrencySymbol() {
    return CURRENCY_SYMBOLS[currencySelect.value] || '$';
  }

  function formatMoney(amount) {
    const sym = getCurrencySymbol();
    if (isNaN(amount) || amount === null || amount === undefined) {
      return `${sym}0.00`;
    }
    return `${sym}${amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  /**
   * Exact Penny Balancing Algorithm
   * Sum of all individual shares is mathematically guaranteed to equal the total bill.
   */
  function calculatePrecisionSplit(totalBill, numPeople) {
    const totalCents = Math.round(totalBill * 100);
    const baseCents = Math.floor(totalCents / numPeople);
    const remainderCents = totalCents % numPeople;

    const shares = [];
    for (let i = 0; i < numPeople; i++) {
      const shareCents = i < remainderCents ? baseCents + 1 : baseCents;
      shares.push({
        index: i + 1,
        shareCents: shareCents,
        shareAmount: shareCents / 100,
        hasExtraPenny: i < remainderCents
      });
    }

    const sumAllocatedCents = shares.reduce((acc, s) => acc + s.shareCents, 0);
    const isBalanced = sumAllocatedCents === totalCents;

    return {
      originalBill: totalBill,
      totalCents: totalCents,
      totalAmount: totalCents / 100,
      numPeople: numPeople,
      baseShareAmount: baseCents / 100,
      remainderCents: remainderCents,
      isBalanced: isBalanced,
      shares: shares
    };
  }

  /**
   * Validation & Error Handling
   */
  function clearErrors() {
    alertBox.classList.remove('visible');
    alertBox.setAttribute('aria-hidden', 'true');
    alertMessage.textContent = '';
    billAmountInput.classList.remove('input-error');
    numPeopleInput.classList.remove('input-error');
    billAmountInput.removeAttribute('aria-invalid');
    numPeopleInput.removeAttribute('aria-invalid');
  }

  function showError(message, targetInput) {
    alertMessage.textContent = message;
    alertBox.classList.add('visible');
    alertBox.setAttribute('aria-hidden', 'false');

    if (targetInput) {
      targetInput.classList.add('input-error');
      targetInput.setAttribute('aria-invalid', 'true');
      targetInput.focus();
    }

    resultContent.classList.remove('visible');
    emptyState.style.display = 'flex';
    currentSplitData = null;
  }

  /**
   * Toast notification
   */
  let toastTimeout;
  function showToast(msg) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toastEl.querySelector('.toast-text').textContent = msg;
    toastEl.classList.add('show');
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2800);
  }

  /**
   * Render Split Results
   */
  function renderResults(splitData, occasion) {
    const sym = getCurrencySymbol();

    const displayOccasion = occasion && occasion.trim().length > 0 
      ? occasion.trim() 
      : 'SPLIT SUMMARY';
    summaryOccasion.textContent = displayOccasion;

    if (splitData.remainderCents === 0) {
      summarySplitAmount.innerHTML = `${formatMoney(splitData.baseShareAmount)} <span>/ PERSON</span>`;
    } else {
      const lowAmount = formatMoney(splitData.baseShareAmount);
      const highAmount = formatMoney(splitData.baseShareAmount + 0.01);
      summarySplitAmount.innerHTML = `${lowAmount} - ${highAmount} <span>/ PERSON</span>`;
    }

    metricTotalBill.textContent = formatMoney(splitData.totalAmount);
    metricPeopleCount.textContent = splitData.numPeople.toString();
    metricBaseShare.textContent = formatMoney(splitData.baseShareAmount);

    if (splitData.remainderCents === 0) {
      pennyBalanceText.textContent = `All ${splitData.numPeople} people pay ${formatMoney(splitData.baseShareAmount)}. The sum matches the total of ${formatMoney(splitData.totalAmount)} exactly.`;
    } else {
      const extraCount = splitData.remainderCents;
      const baseCount = splitData.numPeople - splitData.remainderCents;
      const extraShare = formatMoney(splitData.baseShareAmount + 0.01);
      const baseShare = formatMoney(splitData.baseShareAmount);

      pennyBalanceText.textContent = `${extraCount} person(s) pay ${extraShare} and ${baseCount} person(s) pay ${baseShare}. The sum adds up exactly to ${formatMoney(splitData.totalAmount)}.`;
    }

    // Populate Individual Breakdown List
    breakdownList.innerHTML = '';
    splitData.shares.forEach((share) => {
      const row = document.createElement('div');
      row.className = 'share-row';

      const defaultName = `Person ${share.index}`;
      const savedName = customPersonNames[share.index] || defaultName;

      row.innerHTML = `
        <div class="person-info">
          <div class="person-avatar" aria-hidden="true">[${share.index < 10 ? '0' + share.index : share.index}]</div>
          <div class="person-name-group">
            <input 
              type="text" 
              class="person-name-input" 
              data-index="${share.index}" 
              value="${escapeHtml(savedName)}" 
              placeholder="${defaultName}"
              aria-label="Name of person ${share.index}"
              maxlength="40"
            />
            <span class="person-tag">${share.hasExtraPenny ? 'Allocated +1¢ remainder penny' : 'Equal base share'}</span>
          </div>
        </div>
        <div class="share-meta">
          ${share.hasExtraPenny ? '<span class="penny-tag">+1¢</span>' : ''}
          <div class="share-amount">${formatMoney(share.shareAmount)}</div>
        </div>
      `;

      const nameInput = row.querySelector('.person-name-input');
      nameInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        customPersonNames[share.index] = val || defaultName;
        saveActiveDraftToStorage();
      });

      breakdownList.appendChild(row);
    });

    emptyState.style.display = 'none';
    resultContent.classList.add('visible');
    currentSplitData = splitData;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Real-Time & Explicit Calculation Handler
   */
  function executeCalculation(options = { isLive: false, logToHistory: false }) {
    const isLive = options.isLive || false;
    const logToHistory = options.logToHistory || false;

    const occasion = occasionInput.value.trim();
    const rawBill = billAmountInput.value.trim();
    const rawPeople = numPeopleInput.value.trim();

    // 1. Validate Bill Amount
    if (!rawBill || rawBill === '') {
      if (!isLive) {
        showError('Enter a valid positive bill amount.', billAmountInput);
      } else {
        resultContent.classList.remove('visible');
        emptyState.style.display = 'flex';
        currentSplitData = null;
      }
      return;
    }

    const billAmount = parseFloat(rawBill);
    if (isNaN(billAmount) || billAmount <= 0) {
      if (!isLive) {
        showError('Enter a valid positive bill amount.', billAmountInput);
      } else {
        resultContent.classList.remove('visible');
        emptyState.style.display = 'flex';
        currentSplitData = null;
      }
      return;
    }

    // 2. Validate Number of People
    if (!rawPeople || rawPeople === '') {
      if (!isLive) {
        showError('Enter the number of people (at least 1).', numPeopleInput);
      } else {
        resultContent.classList.remove('visible');
        emptyState.style.display = 'flex';
        currentSplitData = null;
      }
      return;
    }

    const numPeople = parseInt(rawPeople, 10);
    if (isNaN(numPeople) || numPeople <= 0) {
      if (!isLive) {
        showError('Enter the number of people (at least 1).', numPeopleInput);
      } else {
        resultContent.classList.remove('visible');
        emptyState.style.display = 'flex';
        currentSplitData = null;
      }
      return;
    }

    if (parseFloat(rawPeople) !== numPeople) {
      if (!isLive) {
        showError('Number of people must be a whole number.', numPeopleInput);
      }
      return;
    }

    // Clean any prior error states
    clearErrors();

    // 3. Compute tip & final total
    let finalBill = billAmount;
    if (currentTipPercent > 0) {
      const tipAmount = (billAmount * currentTipPercent) / 100;
      finalBill = billAmount + tipAmount;
    }

    // 4. Calculate Precision Split
    const splitResult = calculatePrecisionSplit(finalBill, numPeople);

    // 5. Render
    renderResults(splitResult, occasion);

    // 6. Persist draft
    saveActiveDraftToStorage();

    // 7. Log to history if requested
    if (logToHistory) {
      addHistoryRecord(splitResult, occasion);
    }
  }

  /**
   * Plain Text Receipt & Summary Formatter
   */
  function generatePlainTextSummary(splitData, occasion) {
    if (!splitData) return '';

    const sym = getCurrencySymbol();
    const title = occasion && occasion.trim().length > 0 ? occasion.trim() : 'Bill Split';
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }) + ', ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const divider = '==================================================';
    const subDivider = '--------------------------------------------------';

    const lines = [
      divider,
      `BILL SPLIT SUMMARY`,
      divider,
      `Occasion:         ${title}`,
      `Date & Time:      ${formattedDate}`,
      `Number of People: ${splitData.numPeople}`,
      `Base Bill:        ${formatMoney(parseFloat(billAmountInput.value) || splitData.totalAmount)}`,
      `Tip Added:        ${currentTipPercent}%`,
      `Final Total:      ${formatMoney(splitData.totalAmount)}`,
      subDivider,
      `INDIVIDUAL BREAKDOWN:`,
      subDivider
    ];

    splitData.shares.forEach((share) => {
      const name = customPersonNames[share.index] || `Person ${share.index}`;
      const note = share.hasExtraPenny ? ' (+1¢ remainder)' : '';
      const formattedAmount = formatMoney(share.shareAmount);
      lines.push(`• [${share.index < 10 ? '0' + share.index : share.index}] ${name.padEnd(20, ' ')} : ${formattedAmount}${note}`);
    });

    lines.push(subDivider);
    lines.push(`Exact Penny Balancing: Sum matches total bill (${formatMoney(splitData.totalAmount)})`);
    lines.push(divider);

    return lines.join('\n');
  }

  /**
   * Export Plain Text (.txt) File to Local Device
   */
  function exportSummaryAsTextFile() {
    if (!currentSplitData) {
      showError('Enter a valid positive amount and headcount.', billAmountInput);
      return;
    }

    const occasion = occasionInput.value.trim() || 'bill_split';
    const textContent = generatePlainTextSummary(currentSplitData, occasion);
    
    const safeOccasion = occasion.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 30) || 'bill_split';
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${safeOccasion}_${dateStr}.txt`;

    try {
      const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = filename;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);

      showToast(`Downloaded: ${filename}`);
    } catch (err) {
      console.error('File export error', err);
      fallbackCopy(textContent);
      showToast('Export fallback: summary copied to clipboard.');
    }
  }

  /**
   * Copy Summary to Clipboard
   */
  function copySummaryToClipboard() {
    if (!currentSplitData) {
      showError('Enter a valid positive amount and headcount.', billAmountInput);
      return;
    }

    const occasion = occasionInput.value.trim();
    const textContent = generatePlainTextSummary(currentSplitData, occasion);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textContent)
        .then(() => showToast('Summary copied to clipboard.'))
        .catch(() => fallbackCopy(textContent));
    } else {
      fallbackCopy(textContent);
    }
  }

  function fallbackCopy(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast('Summary copied to clipboard.');
    } catch (e) {
      showToast('Could not copy summary.');
    }
    document.body.removeChild(textArea);
  }

  /**
   * History Logging & Management
   */
  function getHistory() {
    try {
      const data = localStorage.getItem(HISTORY_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('Could not read history', e);
      return [];
    }
  }

  function setHistory(historyItems) {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyItems));
    } catch (e) {
      console.warn('Could not write history', e);
    }
    renderHistory();
  }

  function addHistoryRecord(splitData, occasion) {
    if (!splitData) return;

    const signature = `${occasion}|${splitData.totalAmount}|${splitData.numPeople}|${currentTipPercent}|${currencySelect.value}`;
    if (signature === lastSavedHistorySignature) {
      return;
    }
    lastSavedHistorySignature = signature;

    const historyItems = getHistory();
    const now = new Date();
    const record = {
      id: 'split_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: Date.now(),
      dateFormatted: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      occasion: occasion.trim() || 'UNTITLED SPLIT',
      billAmount: billAmountInput.value.trim(),
      tipPercent: currentTipPercent,
      numPeople: splitData.numPeople,
      currency: currencySelect.value,
      totalAmount: splitData.totalAmount,
      baseShareAmount: splitData.baseShareAmount,
      remainderCents: splitData.remainderCents,
      customPersonNames: { ...customPersonNames },
      splitData: splitData
    };

    historyItems.unshift(record);
    if (historyItems.length > 30) {
      historyItems.pop();
    }

    setHistory(historyItems);
    showToast('Split saved to history.');
  }

  function renderHistory() {
    const historyItems = getHistory();
    historyCountBadge.textContent = `${historyItems.length} SAVED`;

    if (historyItems.length === 0) {
      historyEmpty.style.display = 'flex';
      historyList.innerHTML = '';
      return;
    }

    historyEmpty.style.display = 'none';
    historyList.innerHTML = '';

    historyItems.forEach((item) => {
      const sym = CURRENCY_SYMBOLS[item.currency] || '$';
      const card = document.createElement('div');
      card.className = 'history-card';

      const formattedTotal = `${sym}${item.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const formattedBase = `${sym}${item.baseShareAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      card.innerHTML = `
        <div>
          <div class="history-card-top">
            <h3 class="history-occasion-title">${escapeHtml(item.occasion)}</h3>
            <span class="history-timestamp">${escapeHtml(item.dateFormatted)}</span>
          </div>

          <div class="history-stats-grid">
            <div class="history-stat-col">
              <span class="history-stat-lbl">TOTAL</span>
              <span class="history-stat-val">${formattedTotal}</span>
            </div>
            <div class="history-stat-col">
              <span class="history-stat-lbl">PEOPLE</span>
              <span class="history-stat-val">${item.numPeople}</span>
            </div>
            <div class="history-stat-col">
              <span class="history-stat-lbl">PER PERSON</span>
              <span class="history-stat-val">${formattedBase}${item.remainderCents > 0 ? '+' : ''}</span>
            </div>
          </div>
        </div>

        <div class="history-card-actions">
          <button type="button" class="btn-history-action btn-load" data-id="${item.id}" title="Load this split into calculator">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            LOAD
          </button>
          <button type="button" class="btn-history-action btn-export" data-id="${item.id}" title="Download text file for this split">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            EXPORT .TXT
          </button>
          <button type="button" class="btn-history-action btn-delete" data-id="${item.id}" title="Delete this entry from history">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            DELETE
          </button>
        </div>
      `;

      card.querySelector('.btn-load').addEventListener('click', () => {
        loadHistoryItem(item);
      });

      card.querySelector('.btn-export').addEventListener('click', () => {
        exportHistoryItemAsText(item);
      });

      card.querySelector('.btn-delete').addEventListener('click', () => {
        deleteHistoryItem(item.id);
      });

      historyList.appendChild(card);
    });
  }

  function loadHistoryItem(item) {
    occasionInput.value = item.occasion === 'UNTITLED SPLIT' ? '' : item.occasion;
    billAmountInput.value = item.billAmount;
    numPeopleInput.value = item.numPeople;
    currencySelect.value = item.currency || 'USD';
    currencyPrefix.textContent = getCurrencySymbol();

    currentTipPercent = item.tipPercent || 0;
    tipButtons.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.tip, 10) === currentTipPercent);
    });

    customPersonNames = { ...(item.customPersonNames || {}) };

    executeCalculation({ isLive: false, logToHistory: false });
    window.scrollTo({ top: form.offsetTop - 80, behavior: 'smooth' });
    showToast(`Loaded: ${item.occasion}`);
  }

  function exportHistoryItemAsText(item) {
    const textContent = generatePlainTextSummary(item.splitData, item.occasion);
    const safeOccasion = item.occasion.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 30) || 'bill_split';
    const filename = `${safeOccasion}_archived.txt`;

    try {
      const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Downloaded: ${filename}`);
    } catch (e) {
      fallbackCopy(textContent);
      showToast('Export fallback: summary copied to clipboard.');
    }
  }

  function deleteHistoryItem(id) {
    const historyItems = getHistory().filter(item => item.id !== id);
    setHistory(historyItems);
    showToast('Removed from history.');
  }

  function clearAllHistory() {
    if (getHistory().length === 0) {
      showToast('History is already empty.');
      return;
    }
    setHistory([]);
    lastSavedHistorySignature = '';
    showToast('Split history cleared.');
  }

  /**
   * Active Draft LocalStorage Management
   */
  function saveActiveDraftToStorage() {
    if (!currentSplitData) return;

    const dataToSave = {
      occasion: occasionInput.value.trim(),
      rawBill: billAmountInput.value.trim(),
      numPeople: numPeopleInput.value.trim(),
      currency: currencySelect.value,
      tipPercent: currentTipPercent,
      customPersonNames: customPersonNames,
      splitData: currentSplitData,
      savedAt: Date.now()
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (e) {
      console.warn('Unable to persist draft', e);
    }
  }

  function loadActiveDraftFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;

      const data = JSON.parse(saved);
      if (!data) return;

      if (data.occasion !== undefined) occasionInput.value = data.occasion;
      if (data.rawBill !== undefined) billAmountInput.value = data.rawBill;
      if (data.numPeople !== undefined) numPeopleInput.value = data.numPeople;
      if (data.currency) {
        currencySelect.value = data.currency;
        currencyPrefix.textContent = getCurrencySymbol();
      }
      if (typeof data.tipPercent === 'number') {
        currentTipPercent = data.tipPercent;
        tipButtons.forEach(btn => {
          btn.classList.toggle('active', parseInt(btn.dataset.tip, 10) === currentTipPercent);
        });
      }
      if (data.customPersonNames) {
        customPersonNames = data.customPersonNames;
      }

      if (data.rawBill && data.numPeople && data.splitData) {
        executeCalculation({ isLive: true, logToHistory: false });
      }
    } catch (e) {
      console.warn('Could not restore active draft', e);
    }
  }

  function resetAllData() {
    form.reset();
    currentTipPercent = 0;
    customPersonNames = {};
    currentSplitData = null;
    lastSavedHistorySignature = '';

    tipButtons.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.tip, 10) === 0);
    });

    clearErrors();
    resultContent.classList.remove('visible');
    emptyState.style.display = 'flex';

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Unable to clear draft storage', e);
    }

    showToast('All fields and calculations reset.');
    occasionInput.focus();
  }

  /**
   * Event Listeners
   */
  
  // Explicit Calculate Form Submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    executeCalculation({ isLive: false, logToHistory: true });
  });

  // Real-Time Inputs
  billAmountInput.addEventListener('input', () => {
    executeCalculation({ isLive: true, logToHistory: false });
  });

  numPeopleInput.addEventListener('input', () => {
    executeCalculation({ isLive: true, logToHistory: false });
  });

  occasionInput.addEventListener('input', () => {
    if (currentSplitData) {
      summaryOccasion.textContent = occasionInput.value.trim() || 'SPLIT SUMMARY';
      saveActiveDraftToStorage();
    }
  });

  // Stepper Controls
  btnDecrease.addEventListener('click', () => {
    let current = parseInt(numPeopleInput.value, 10);
    if (isNaN(current) || current <= 1) {
      current = 1;
    } else {
      current -= 1;
    }
    numPeopleInput.value = current;
    executeCalculation({ isLive: true, logToHistory: false });
  });

  btnIncrease.addEventListener('click', () => {
    let current = parseInt(numPeopleInput.value, 10);
    if (isNaN(current) || current < 1) {
      current = 2;
    } else {
      current += 1;
    }
    numPeopleInput.value = current;
    executeCalculation({ isLive: true, logToHistory: false });
  });

  // Currency select
  currencySelect.addEventListener('change', () => {
    currencyPrefix.textContent = getCurrencySymbol();
    if (currentSplitData) {
      executeCalculation({ isLive: true, logToHistory: false });
    }
    renderHistory();
  });

  // Tip buttons
  tipButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tipButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTipPercent = parseInt(btn.dataset.tip, 10);
      executeCalculation({ isLive: true, logToHistory: false });
    });
  });

  // Action Buttons
  btnReset.addEventListener('click', resetAllData);
  btnCopy.addEventListener('click', copySummaryToClipboard);
  btnExportTxt.addEventListener('click', exportSummaryAsTextFile);

  // Save to History button
  btnSaveHistory.addEventListener('click', () => {
    if (!currentSplitData) {
      showError('Enter a valid positive amount and headcount.', billAmountInput);
      return;
    }
    addHistoryRecord(currentSplitData, occasionInput.value.trim());
  });

  // Clear History button
  btnClearHistory.addEventListener('click', clearAllHistory);

  /**
   * Safe Initialization
   */
  function init() {
    currencyPrefix.textContent = getCurrencySymbol();
    loadActiveDraftFromStorage();
    renderHistory();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
