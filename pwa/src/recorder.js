// JamNote Recorder Module
// Manages record button UI, timer, Bluetooth shutter trigger,
// level meters, and last capture preview

const Recorder = (() => {

  let recording = false;
  let timerInterval = null;
  let timerSeconds = 0;
  let currentSession = null;
  let meterInterval = null;

  const btn = () => document.getElementById('record-btn');
  const timer = () => document.getElementById('record-timer');
  const hint = () => document.getElementById('record-hint');
  const meterGuitar = () => document.getElementById('meter-guitar');
  const meterVocal = () => document.getElementById('meter-vocal');

  function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
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
    // Simulate meter activity — replace with real VU data when available
    meterInterval = setInterval(() => {
      if (!recording) return;
      const g = Math.random() * 70 + 10;
      const v = Math.random() * 50 + 5;
      meterGuitar().style.width = g + '%';
      meterVocal().style.width = v + '%';
      meterGuitar().classList.toggle('clipping', g > 90);
      meterVocal().classList.toggle('clipping', v > 90);
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
      const res = await API.recordStart();
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
      const res = await API.recordStop();
      recording = false;
      btn().classList.remove('recording');
      hint().textContent = 'tap to record';
      stopTimer();
      stopMeterSimulation();

      // Show last capture after a short delay for file processing
      setTimeout(() => {
        Library.loadLastCapture();
      }, 2000);

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
    // Bluetooth shutter buttons send keyboard events
    // Most common keycodes: VolumeUp (Android), space bar, or Enter
    document.addEventListener('keydown', (e) => {
      const shutterKeys = ['VolumeUp', ' ', 'Enter', 'F9'];
      if (shutterKeys.includes(e.key)) {
        e.preventDefault();
        toggle();
      }
    });

    // Also listen for the PWA shortcut URL param
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'record') {
      startRecording();
    }
  }

  function init() {
    btn().addEventListener('click', toggle);
    initShutterListener();
  }

  return { init, toggle, startRecording, stopRecording, isRecording: () => recording };

})();

window.Recorder = Recorder;
