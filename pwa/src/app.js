// JamNote — Main App
// Initialises the PWA, handles navigation, registers service worker

(async () => {

  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (err) {
      console.warn('Service worker registration failed:', err);
    }
  }

  // Navigation
  const tabs = document.querySelectorAll('.tab');
  const screens = document.querySelectorAll('.screen');

  function showScreen(name) {
    screens.forEach(s => s.classList.toggle('active', s.id === `screen-${name}`));
    tabs.forEach(t => t.classList.toggle('active', t.dataset.screen === name));

    // Load data when switching to library or settings
    if (name === 'library') Library.load();
    if (name === 'settings') Settings.load();
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => showScreen(tab.dataset.screen));
  });

  // Initialise all modules
  Recorder.init();
  Settings.init();
  Sync.init();

  // Load last capture on the record screen
  Library.loadLastCapture();

  // Check initial status
  try {
    const status = await API.status();
    document.getElementById('status-wifi')?.classList.toggle('online', status.wifi_connected);
  } catch {
    // Pi not reachable on load — show offline state gracefully
    console.warn('JamNote device not reachable — running in offline mode');
  }

})();
