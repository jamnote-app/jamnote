// JamNote Settings Module
// Loads and displays device settings, handles WiFi config modal

const Settings = (() => {

  async function load() {
    try {
      const [config, status] = await Promise.all([
        API.settings(),
        API.status(),
      ]);

      // Device info
      const deviceName = document.getElementById('device-name');
      if (deviceName) deviceName.textContent = config.device_name || 'jamnote.local';

      const uploadPath = document.getElementById('upload-path');
      if (uploadPath) uploadPath.textContent = config.upload_path || '/recordings';

      // SD card usage
      const sdUsage = document.getElementById('sd-usage');
      if (sdUsage && status.sd_card) {
        const used = formatBytes(status.sd_card.used_bytes);
        const total = formatBytes(status.sd_card.total_bytes);
        sdUsage.textContent = `${used} / ${total}`;
      }

      // WiFi status
      const wifiEl = document.getElementById('wifi-ssid');
      if (wifiEl) {
        wifiEl.textContent = status.wifi_connected ? 'Connected' : 'Not connected';
      }

    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  function formatBytes(bytes) {
    if (!bytes) return '—';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${Math.round(mb)} MB`;
  }

  function initWifiModal() {
    const addBtn = document.getElementById('add-wifi-btn');
    const modal = document.getElementById('wifi-modal');
    const closeBtn = document.getElementById('wifi-modal-close');
    const saveBtn = document.getElementById('wifi-save-btn');
    const backdrop = modal.querySelector('.modal-backdrop');

    addBtn.addEventListener('click', () => {
      modal.classList.remove('hidden');
    });

    const closeModal = () => {
      modal.classList.add('hidden');
      document.getElementById('wifi-ssid-input').value = '';
      document.getElementById('wifi-password-input').value = '';
    };

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);

    saveBtn.addEventListener('click', async () => {
      const ssid = document.getElementById('wifi-ssid-input').value.trim();
      const password = document.getElementById('wifi-password-input').value;

      if (!ssid) {
        alert('Please enter a network name');
        return;
      }

      try {
        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;
        await API.addWifi(ssid, password);
        closeModal();
        alert(`Network "${ssid}" saved. The Pi will connect automatically.`);
        load();
      } catch (err) {
        console.error('Failed to save WiFi:', err);
        alert('Could not save network. Check the Pi is reachable.');
      } finally {
        saveBtn.textContent = 'Save network';
        saveBtn.disabled = false;
      }
    });
  }

  function init() {
    initWifiModal();
    load();
  }

  return { init, load };

})();

window.Settings = Settings;
