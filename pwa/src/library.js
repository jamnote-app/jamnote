// JamNote Library Module
// Manages the captures list, waveform rendering, playback, and last capture preview

const Library = (() => {

  let captures = [];
  let playingId = null;
  let audio = null;

  function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatDate(id) {
    try {
      const y = id.slice(0, 4);
      const mo = id.slice(4, 6);
      const d = id.slice(6, 8);
      const h = id.slice(9, 11);
      const mi = id.slice(11, 13);
      const date = new Date(`${y}-${mo}-${d}T${h}:${mi}`);
      const now = new Date();
      const diff = now - date;
      const days = Math.floor(diff / 86400000);

      if (days === 0) {
        return `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      } else if (days === 1) {
        return `Yesterday, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
          `, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      }
    } catch {
      return id;
    }
  }

  function generateWaveBars(count = 40) {
    const bars = [];
    for (let i = 0; i < count; i++) {
      // Create a natural-looking waveform shape
      const height = Math.max(15, Math.random() * 100);
      bars.push(height);
    }
    return bars;
  }

  function renderWaveform(container, heights, playedFraction = 0) {
    container.innerHTML = '';
    const playedCount = Math.floor(heights.length * playedFraction);
    heights.forEach((h, i) => {
      const bar = document.createElement('div');
      bar.className = 'wave-bar' + (i < playedCount ? ' played' : '');
      bar.style.height = h + '%';
      container.appendChild(bar);
    });
  }

  function syncBadgeHTML(capture) {
    if (capture.synced) {
      return `<span class="sync-badge synced">synced</span>`;
    } else {
      return `<span class="sync-badge queued">queued</span>`;
    }
  }

  function renderLibraryCard(capture) {
    const div = document.createElement('div');
    div.className = 'library-card';
    div.dataset.id = capture.id;

    const displayName = capture.custom_name || formatDate(capture.id);
    const inputs = capture.has_vocal ? 'guitar + vocal' : 'guitar only';
    const duration = formatDuration(capture.duration_seconds);
    const noteHTML = capture.note
      ? `<div class="library-card-note">"${capture.note}"</div>`
      : '';

    div.innerHTML = `
      <div class="library-card-header">
        <button class="play-btn" data-id="${capture.id}" aria-label="Play">
          <svg width="10" height="12" viewBox="0 0 10 12"><path d="M1 1l8 5-8 5V1z" fill="currentColor"/></svg>
        </button>
        <div class="library-card-info">
          <div class="library-card-title">${displayName}</div>
          <div class="library-card-meta">${duration} · ${inputs}</div>
        </div>
        ${syncBadgeHTML(capture)}
      </div>
      <div class="capture-wave" id="wave-${capture.id}"></div>
      ${noteHTML}
    `;

    // Render waveform
    const waveContainer = div.querySelector(`#wave-${capture.id}`);
    const bars = generateWaveBars(36);
    renderWaveform(waveContainer, bars);

    // Play button
    div.querySelector('.play-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      playCapture(capture.id);
    });

    return div;
  }

  async function load() {
    const list = document.getElementById('library-list');
    const empty = document.getElementById('library-empty');

    try {
      captures = await API.recordings();

      list.innerHTML = '';

      if (captures.length === 0) {
        empty.classList.remove('hidden');
        return;
      }

      empty.classList.add('hidden');
      captures.forEach(c => {
        list.appendChild(renderLibraryCard(c));
      });

    } catch (err) {
      console.error('Failed to load library:', err);
      list.innerHTML = '<div class="empty-state">Could not load captures.<br>Is the Pi reachable?</div>';
    }
  }

  async function loadLastCapture() {
    try {
      const captures = await API.recordings();
      if (captures.length === 0) return;

      const last = captures[0];
      const section = document.getElementById('last-capture-section');
      const card = document.getElementById('last-capture-card');
      const timeEl = document.getElementById('last-time');
      const badgeEl = document.getElementById('last-sync-badge');
      const waveEl = document.getElementById('last-waveform');
      const playBtn = document.getElementById('last-play-btn');

      timeEl.textContent = last.custom_name || formatDate(last.id);
      badgeEl.className = 'sync-badge ' + (last.synced ? 'synced' : 'queued');
      badgeEl.textContent = last.synced ? 'synced' : 'queued';

      const bars = generateWaveBars(28);
      renderWaveform(waveEl, bars);

      playBtn.onclick = () => playCapture(last.id);

      section.classList.remove('hidden');
    } catch (err) {
      console.error('Failed to load last capture:', err);
    }
  }

  function playCapture(id) {
    // Stop any current playback
    if (audio) {
      audio.pause();
      audio = null;
    }

    if (playingId === id) {
      playingId = null;
      return;
    }

    playingId = id;
    // Serve the guitar file directly from the Pi recordings directory
    audio = new Audio(`/api/recordings/${id}/audio`);
    audio.play().catch(err => {
      console.error('Playback error:', err);
    });
    audio.onended = () => { playingId = null; };
  }

  return { load, loadLastCapture, playCapture, getCaptures: () => captures };

})();

window.Library = Library;
