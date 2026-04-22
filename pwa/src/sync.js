// JamNote Sync Module
// Handles WiFi detection, sync review flow, and upload progress

const Sync = (() => {

  let reviewQueue = [];
  let currentReviewIndex = 0;

  function formatDate(id) {
    try {
      const y = id.slice(0, 4), mo = id.slice(4, 6), d = id.slice(6, 8);
      const h = id.slice(9, 11), mi = id.slice(11, 13);
      const date = new Date(`${y}-${mo}-${d}T${h}:${mi}`);
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ' at ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch { return id; }
  }

  function formatDuration(s) {
    if (!s) return '0:00';
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  }

  // Check for unsynced captures when WiFi connects
  async function checkOnWifiConnect(wasConnected, isConnected) {
    if (!wasConnected && isConnected) {
      await checkUnsyncedCaptures();
    }
  }

  async function checkUnsyncedCaptures() {
    try {
      const captures = await API.recordings();
      const unsynced = captures.filter(c => !c.synced);

      if (unsynced.length > 0) {
        showSyncPrompt(unsynced);
      }
    } catch (err) {
      console.error('Failed to check unsynced captures:', err);
    }
  }

  function showSyncPrompt(unsynced) {
    const modal = document.getElementById('sync-modal');
    const content = document.getElementById('sync-modal-content');

    const captureListHTML = unsynced.slice(0, 5).map(c => `
      <div class="sync-capture-item">
        <div>
          <div class="sync-capture-name">${c.custom_name || formatDate(c.id)}</div>
          <div class="sync-capture-meta">${formatDuration(c.duration_seconds)} · ${c.has_vocal ? 'guitar + vocal' : 'guitar only'}</div>
        </div>
        <span class="sync-badge review">needs review</span>
      </div>
    `).join('');

    const moreText = unsynced.length > 5
      ? `<div style="text-align:center;font-size:12px;color:var(--text-tertiary);padding:8px 0">and ${unsynced.length - 5} more...</div>`
      : '';

    content.innerHTML = `
      <div class="sync-review-header">
        <div class="sync-review-icon">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#1D9E75" stroke-width="1.5" stroke-linecap="round">
            <path d="M2 7c2.5-2.5 5.8-4 9-4s6.5 1.5 9 4"/>
            <path d="M5 10.5c1.6-1.6 3.7-2.5 6-2.5s4.4.9 6 2.5"/>
            <circle cx="11" cy="16" r="2" fill="#1D9E75" stroke="none"/>
          </svg>
        </div>
        <div class="sync-review-title">WiFi connected</div>
        <div class="sync-review-sub">${unsynced.length} capture${unsynced.length !== 1 ? 's' : ''} waiting to sync</div>
      </div>

      <div class="sync-capture-list">
        ${captureListHTML}
        ${moreText}
      </div>

      <div class="sync-actions">
        <button class="btn btn-primary" id="sync-review-btn">Review and sync</button>
        <button class="btn btn-secondary" id="sync-skip-btn">Sync now, skip review</button>
        <button class="btn btn-secondary" id="sync-later-btn">Remind me later</button>
      </div>
    `;

    modal.classList.remove('hidden');

    document.getElementById('sync-review-btn').addEventListener('click', () => {
      modal.classList.add('hidden');
      startReviewFlow(unsynced);
    });

    document.getElementById('sync-skip-btn').addEventListener('click', async () => {
      modal.classList.add('hidden');
      await syncAllSilently();
    });

    document.getElementById('sync-later-btn').addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  function startReviewFlow(captures) {
    reviewQueue = captures;
    currentReviewIndex = 0;
    showReviewStep();
  }

  function showReviewStep() {
    if (currentReviewIndex >= reviewQueue.length) {
      showUploadProgress();
      return;
    }

    const capture = reviewQueue[currentReviewIndex];
    const modal = document.getElementById('sync-modal');
    const content = document.getElementById('sync-modal-content');
    const total = reviewQueue.length;
    const current = currentReviewIndex + 1;

    const dotsHTML = reviewQueue.map((_, i) =>
      `<div class="progress-dot ${i === currentReviewIndex ? 'active' : ''}"></div>`
    ).join('');

    content.innerHTML = `
      <div class="modal-header">
        <button class="text-btn" id="review-cancel">Cancel</button>
        <span style="font-size:13px;color:var(--text-secondary)">Capture ${current} of ${total}</span>
        <button class="text-btn" id="review-next">${current < total ? 'Next →' : 'Upload'}</button>
      </div>

      <div class="progress-dots">${dotsHTML}</div>

      <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">${formatDate(capture.id)}</div>

      <div class="capture-card" style="margin-bottom:16px">
        <button class="play-btn" id="review-play-btn" aria-label="Play">
          <svg width="10" height="12" viewBox="0 0 10 12"><path d="M1 1l8 5-8 5V1z" fill="currentColor"/></svg>
        </button>
        <div class="capture-wave" id="review-waveform"></div>
        <div class="capture-meta">
          <div class="capture-time">${capture.has_vocal ? 'guitar + vocal' : 'guitar only'}</div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px">
        <div>
          <label class="field-label">Note (optional)</label>
          <textarea class="field-input" id="review-note" placeholder="What were you playing?" rows="2">${capture.note || ''}</textarea>
        </div>
        <div>
          <label class="field-label">File name</label>
          <input type="text" class="field-input" id="review-name" value="${capture.custom_name || capture.id}" placeholder="Leave as timestamp or rename">
        </div>
        <div>
          <label class="field-label">Upload folder</label>
          <input type="text" class="field-input" id="review-path" value="${capture.upload_path || '/recordings'}" placeholder="/recordings">
        </div>
      </div>

      <button class="btn btn-danger" id="review-delete-btn">Delete this capture</button>
    `;

    // Render waveform
    const waveEl = document.getElementById('review-waveform');
    const bars = Array.from({ length: 28 }, () => Math.max(15, Math.random() * 100));
    bars.forEach(h => {
      const bar = document.createElement('div');
      bar.className = 'wave-bar';
      bar.style.height = h + '%';
      waveEl.appendChild(bar);
    });

    modal.classList.remove('hidden');

    // Play
    document.getElementById('review-play-btn').addEventListener('click', () => {
      Library.playCapture(capture.id);
    });

    // Cancel
    document.getElementById('review-cancel').addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    // Next / Upload
    document.getElementById('review-next').addEventListener('click', async () => {
      await saveReviewData(capture.id);
      currentReviewIndex++;
      if (currentReviewIndex >= reviewQueue.length) {
        modal.classList.add('hidden');
        await syncAllSilently();
        showUploadComplete();
      } else {
        showReviewStep();
      }
    });

    // Delete
    document.getElementById('review-delete-btn').addEventListener('click', async () => {
      if (!confirm('Delete this capture? This cannot be undone.')) return;
      try {
        await API.deleteRecording(capture.id);
        reviewQueue.splice(currentReviewIndex, 1);
        if (reviewQueue.length === 0) {
          modal.classList.add('hidden');
        } else {
          if (currentReviewIndex >= reviewQueue.length) currentReviewIndex--;
          showReviewStep();
        }
      } catch (err) {
        console.error('Delete failed:', err);
      }
    });
  }

  async function saveReviewData(id) {
    const note = document.getElementById('review-note')?.value || '';
    const name = document.getElementById('review-name')?.value || '';
    const path = document.getElementById('review-path')?.value || '/recordings';

    try {
      await API.updateRecording(id, {
        note: note.trim(),
        custom_name: name.trim() !== id ? name.trim() : null,
        upload_path: path.trim(),
      });
    } catch (err) {
      console.error('Failed to save review data:', err);
    }
  }

  async function syncAllSilently() {
    try {
      await API.syncAll();
      Library.load();
    } catch (err) {
      console.error('Sync failed:', err);
    }
  }

  function showUploadComplete() {
    const modal = document.getElementById('sync-modal');
    const content = document.getElementById('sync-modal-content');

    content.innerHTML = `
      <div class="sync-review-header">
        <div class="sync-review-icon">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#1D9E75" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 11l5 5 9-9"/>
          </svg>
        </div>
        <div class="sync-review-title">Uploads complete</div>
        <div class="sync-review-sub">All captures saved to Google Drive</div>
      </div>
      <button class="btn btn-primary" id="sync-done-btn">Done</button>
    `;

    modal.classList.remove('hidden');

    document.getElementById('sync-done-btn').addEventListener('click', () => {
      modal.classList.add('hidden');
      Library.load();
    });
  }

  function showUploadProgress() {
    showUploadComplete();
  }

  function init() {
    // Poll status every 30 seconds to detect WiFi connection changes
    let lastWifiState = false;

    setInterval(async () => {
      try {
        const status = await API.status();
        const isConnected = status.wifi_connected;
        await checkOnWifiConnect(lastWifiState, isConnected);
        lastWifiState = isConnected;

        // Update WiFi status dot
        const dot = document.getElementById('status-wifi');
        if (dot) dot.classList.toggle('online', isConnected);

        // Update SD display
        const sdLabel = document.getElementById('status-sd');
        if (sdLabel && status.sd_card) {
          const freeGB = (status.sd_card.free_bytes / (1024 * 1024 * 1024)).toFixed(1);
          sdLabel.title = `${freeGB}GB free`;
        }

      } catch (err) {
        // Pi not reachable — offline mode
        document.getElementById('status-wifi')?.classList.remove('online');
      }
    }, 30000);

    // Run once on load
    API.status().then(status => {
      lastWifiState = status.wifi_connected;
      document.getElementById('status-wifi')?.classList.toggle('online', status.wifi_connected);
      if (status.unsynced_count > 0 && status.wifi_connected) {
        checkUnsyncedCaptures();
      }
    }).catch(() => {});
  }

  return { init, checkUnsyncedCaptures };

})();

window.Sync = Sync;
