// JamNote API Client
// All communication with the Flask API on the Pi

const API = {

  async get(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  },

  async post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  },

  async patch(path, body) {
    const res = await fetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  },

  async delete(path) {
    const res = await fetch(path, { method: 'DELETE' });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  },

  // Status
  status: () => API.get('/api/status'),

  // Recording
  recordStart: () => API.post('/api/record/start'),
  recordStop:  () => API.post('/api/record/stop'),
  recordToggle: () => API.post('/api/record/toggle'),

  // Library
  recordings: () => API.get('/api/recordings'),
  recording: (id) => API.get(`/api/recordings/${id}`),
  updateRecording: (id, data) => API.patch(`/api/recordings/${id}`, data),
  deleteRecording: (id) => API.delete(`/api/recordings/${id}`),
  syncRecording: (id) => API.post(`/api/recordings/${id}/sync`),
  syncAll: () => API.post('/api/recordings/sync-all'),

  // Settings
  settings: () => API.get('/api/settings'),
  updateSettings: (data) => API.post('/api/settings', data),

  // WiFi
  wifiStatus: () => API.get('/api/wifi/status'),
  addWifi: (ssid, password) => API.post('/api/wifi/networks', { ssid, password }),
};

// Make available globally
window.API = API;
