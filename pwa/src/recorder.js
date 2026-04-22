// JamNote Recorder Module
// Manages record button UI, timer, Bluetooth shutter trigger,
// level meters, last capture preview, and input mode toggle

const Recorder = (() => {

  let recording = false;
  let timerInterval = null;
  let timerSeconds = 0;
  let currentSession = null;
  let meterInterval = null;
  let currentMode = 'stereo'; // 'stereo' or 'guitar_only'

  const btn = () => document.getElementById('record-btn');
  const timer = () => document.getElementById('record-timer');
  const hint = () => document.getElementById('record-hint');
  const meterGuitar = () => document.getElementById('meter-guitar');
  const meterVocal = () => document.getElementById('meter-vocal');
  const modeToggle = () => document.getElementById('mode-toggle');
  const modeLabel = () => document.getElementById('mode-label');
  const vocalCard = () => document.getElementById('vocal-input-card');

  function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  function updateModeUI() {
    const isGuitarOnly = currentMode === 'guitar_only';
    if (modeLabel()) modeLabel().textContent = isGuitarOnly ? 'Guitar only' : 'Guitar + vocal';
    if (modeToggle()) modeToggle().checked = !isGuitarOnly;
    if (vocalCard()) vocalCard().style.opacity = isGuitarOnly ? '0.35' : '1';
  }

  async function setMode(mode) {
    if (recording) return;
    currentMode = mode;
    updateModeUI();
    try {
      await API.setMode(mode);
    } catch (err) {
      console.warn('Could not sync mode to device:', err);
    }
  }

  function startTimer() {
    timerSeconds = 0;
    timer().textContent = formatTime(0);
    timer().classList.add('recording');
    timerInterval = setInterval(() => {
      timerSeconds++;
      timer().textContent = formatTime(timerSeconds);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    timer().classList.remove('recording');
    timer().textContent = formatTime(timerSeconds);
  }

  function startMeterSimulation() {
    meterInterval = setInterval(() => {
      if (!recording) return;
      const g = Math.random() * 70 + 10;
      meterGuitar().style.width = g + '%';
      meterGuitar().classList.toggle('clipping', g > 90);
      if (currentMode === 'stereo') {
        const v = Math.random() * 50 + 5;
        meterVocal().style.width = v + '%';
        meterVocal().classList.toggle('clipping', v > 90);
      }
    }, 100);
  }

  function stopMeterSimulation() {
    clearInterval(meterInterval);
    meterInterval = null;
    meterGuitar().style.width = '0%';
    meterVocal().style.width = '0%';
    meterGuitar().classList.remove('clipping');
    meterVocal().classList.remove('clipping');
  }

  async function startRecording() {
    try {
      const res = await API.recordStart(currentMode);
      currentSession = res.session;
      recording = true;
      btn().classList.add('recording');
      hint().textContent = 'tap to stop';
      startTimer();
      startMeterSimulation();
    } catch (err) {
      console.error('Failed to start recording:', err);
      alert('Could not start recording. Is the Pi reachable?');
    }
  }

  async function stopRecording() {
    try {
      await API.recordStop();
      recording = false;
      btn().classList.remove('recording');
      hint().textContent = 'tap to record';
      stopTimer();
      stopMeterSimulation();
      setTimeout(() => { Library.loadLastCapture(); }, 2000);
    } catch (err) {
      console.error('Failed to stop recording:', err);
    }
  }

  function toggle() {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function initShutterListener() {
    document.addEventListener('keydown', (e) => {
      const shutterKeys = ['VolumeUp', ' ', 'Enter', 'F9'];
      if (shutterKeys.includes(e.key)) {
        e.preventDefault();
        toggle();
      }
    });
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'record') {
      startRecording();
    }
  }

  function initModeToggle() {
    const toggle = modeToggle();
    if (!toggle) return;

    // Load mode from device on init
    API.getMode().then(res => {
      currentMode = res.mode || 'stereo';
      updateModeUI();
    }).catch(() => {
      updateModeUI();
    });

    toggle.addEventListener('change', () => {
      setMode(toggle.checked ? 'stereo' : 'guitar_only');
    });
  }

  function init() {
    btn().addEventListener('click', toggle);
    initShutterListener();
    initModeToggle();
    updateModeUI();
  }

  return { init, toggle, startRecording, stopRecording, isRecording: () => recording, getMode: () => currentMode };

})();

window.Recorder = Recorder;
