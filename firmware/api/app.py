"""
JamNote — Flask API
Serves the PWA and exposes REST endpoints for recording control,
library management, settings, and sync triggering.
"""

import os
import json
import logging
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory, abort

from recording.recorder import recorder

logging.basicConfig(level=logging.INFO, format='[JamNote API] %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='../../pwa/public')

CONFIG_PATH = Path('/home/pi/jamnote/config/device.json')
METADATA_PATH = Path('/home/pi/jamnote/config/metadata.json')
CERT_PATH = Path('/home/pi/jamnote/certs/cert.pem')
KEY_PATH = Path('/home/pi/jamnote/certs/key.pem')


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def load_config():
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {}


def save_config(data):
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, 'w') as f:
        json.dump(data, f, indent=2)


def load_metadata():
    """Session metadata — notes, custom names, sync status."""
    if METADATA_PATH.exists():
        with open(METADATA_PATH) as f:
            return json.load(f)
    return {}


def save_metadata(data):
    METADATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(METADATA_PATH, 'w') as f:
        json.dump(data, f, indent=2)


def sd_card_usage():
    """Return SD card used and total bytes."""
    try:
        stat = os.statvfs('/home/pi')
        total = stat.f_blocks * stat.f_frsize
        free = stat.f_bfree * stat.f_frsize
        used = total - free
        return {'used_bytes': used, 'total_bytes': total, 'free_bytes': free}
    except Exception:
        return {'used_bytes': 0, 'total_bytes': 0, 'free_bytes': 0}


def wifi_connected():
    """Check if WiFi interface has an IP address."""
    try:
        import subprocess
        result = subprocess.run(
            ['ip', 'route', 'get', '8.8.8.8'],
            capture_output=True, text=True, timeout=3
        )
        return result.returncode == 0
    except Exception:
        return False


# ─────────────────────────────────────────────
# PWA serving
# ─────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/<path:path>')
def static_files(path):
    full = Path(app.static_folder) / path
    if full.exists():
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')


# ─────────────────────────────────────────────
# Status
# ─────────────────────────────────────────────

@app.route('/api/status')
def status():
    config = load_config()
    disk = sd_card_usage()
    sessions = recorder.list_sessions()
    unsynced = sum(1 for s in sessions if not s.get('synced'))

    return jsonify({
        'recording': recorder.is_recording,
        'current_session': recorder.current_session,
        'wifi_connected': wifi_connected(),
        'device_name': config.get('device_name', 'jamnote'),
        'sd_card': disk,
        'unsynced_count': unsynced,
        'total_captures': len(sessions),
    })


# ─────────────────────────────────────────────
# Recording
# ─────────────────────────────────────────────

@app.route('/api/record/mode', methods=['GET'])
def get_mode():
    return jsonify({'mode': recorder.current_mode})


@app.route('/api/record/mode', methods=['POST'])
def set_mode():
    data = request.get_json()
    mode = data.get('mode') if data else None
    if mode not in ('stereo', 'guitar_only'):
        return jsonify({'error': 'mode must be stereo or guitar_only'}), 400
    try:
        recorder.set_mode(mode)
        return jsonify({'mode': recorder.current_mode})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/record/start', methods=['POST'])
def record_start():
    if recorder.is_recording:
        return jsonify({'error': 'Already recording', 'session': recorder.current_session}), 409

    data = request.get_json(silent=True)
    mode = data.get('mode') if data else None

    session_id = recorder.start(mode=mode)
    logger.info(f'Recording started via API — session {session_id} — mode: {recorder.current_mode}')
    return jsonify({'status': 'recording', 'session': session_id, 'mode': recorder.current_mode})


@app.route('/api/record/stop', methods=['POST'])
def record_stop():
    if not recorder.is_recording:
        return jsonify({'error': 'Not currently recording'}), 409

    session_id = recorder.stop()
    logger.info(f'Recording stopped via API — session {session_id}')
    return jsonify({'status': 'stopped', 'session': session_id})


@app.route('/api/record/toggle', methods=['POST'])
def record_toggle():
    """Single endpoint for Bluetooth shutter button — toggles record state."""
    if recorder.is_recording:
        session_id = recorder.stop()
        return jsonify({'status': 'stopped', 'session': session_id})
    else:
        data = request.get_json(silent=True)
        mode = data.get('mode') if data else None
        session_id = recorder.start(mode=mode)
        return jsonify({'status': 'recording', 'session': session_id, 'mode': recorder.current_mode})


# ─────────────────────────────────────────────
# Library
# ─────────────────────────────────────────────

@app.route('/api/recordings')
def list_recordings():
    sessions = recorder.list_sessions()
    metadata = load_metadata()

    # Merge saved metadata into session list
    for s in sessions:
        m = metadata.get(s['id'], {})
        s['note'] = m.get('note', '')
        s['custom_name'] = m.get('custom_name', None)
        s['synced'] = m.get('synced', False)
        s['upload_path'] = m.get('upload_path', None)

    return jsonify(sessions)


@app.route('/api/recordings/<session_id>')
def get_recording(session_id):
    sessions = recorder.list_sessions()
    metadata = load_metadata()
    session = next((s for s in sessions if s['id'] == session_id), None)

    if not session:
        abort(404)

    m = metadata.get(session_id, {})
    session['note'] = m.get('note', '')
    session['custom_name'] = m.get('custom_name', None)
    session['synced'] = m.get('synced', False)

    return jsonify(session)


@app.route('/api/recordings/<session_id>', methods=['PATCH'])
def update_recording(session_id):
    """Update note, custom name, or upload path for a session."""
    data = request.get_json()
    if not data:
        abort(400)

    metadata = load_metadata()
    if session_id not in metadata:
        metadata[session_id] = {}

    if 'note' in data:
        metadata[session_id]['note'] = data['note']
    if 'custom_name' in data:
        metadata[session_id]['custom_name'] = data['custom_name']
    if 'upload_path' in data:
        metadata[session_id]['upload_path'] = data['upload_path']

    save_metadata(metadata)
    return jsonify({'status': 'updated', 'session': session_id})


@app.route('/api/recordings/<session_id>', methods=['DELETE'])
def delete_recording(session_id):
    deleted = recorder.delete_session(session_id)

    # Remove metadata entry
    metadata = load_metadata()
    metadata.pop(session_id, None)
    save_metadata(metadata)

    return jsonify({'status': 'deleted', 'files': deleted})


@app.route('/api/recordings/<session_id>/audio')
def stream_audio(session_id):
    """Stream the guitar WAV file for in-browser playback."""
    from flask import send_file
    guitar_file = Path(recorder.recordings_dir) / f'{session_id}-guitar.wav'
    if not guitar_file.exists():
        abort(404)
    return send_file(str(guitar_file), mimetype='audio/wav')


@app.route('/api/recordings/<session_id>/sync', methods=['POST'])
def sync_recording(session_id):
    """Trigger sync for a specific session."""
    from sync.sync_manager import sync_session
    result = sync_session(session_id)
    return jsonify(result)


@app.route('/api/recordings/sync-all', methods=['POST'])
def sync_all():
    """Trigger sync for all unsynced sessions."""
    from sync.sync_manager import sync_all_unsynced
    result = sync_all_unsynced()
    return jsonify(result)


# ─────────────────────────────────────────────
# Settings
# ─────────────────────────────────────────────

@app.route('/api/settings')
def get_settings():
    config = load_config()
    # Never return sensitive paths
    safe = {k: v for k, v in config.items()
            if k not in ('cert_path', 'key_path')}
    return jsonify(safe)


@app.route('/api/settings', methods=['POST'])
def update_settings():
    data = request.get_json()
    if not data:
        abort(400)

    config = load_config()
    allowed = {'device_name', 'sample_rate', 'bit_depth',
               'upload_path', 'rclone_remote', 'audio_card'}

    for key in allowed:
        if key in data:
            config[key] = data[key]

    save_config(config)
    return jsonify({'status': 'updated'})


# ─────────────────────────────────────────────
# WiFi
# ─────────────────────────────────────────────

@app.route('/api/wifi/status')
def wifi_status():
    return jsonify({'connected': wifi_connected()})


@app.route('/api/wifi/networks', methods=['POST'])
def add_wifi_network():
    """Add a new WiFi network. Writes to wpa_supplicant."""
    data = request.get_json()
    ssid = data.get('ssid', '').strip()
    password = data.get('password', '').strip()

    if not ssid:
        return jsonify({'error': 'SSID required'}), 400

    # Append to wpa_supplicant.conf
    entry = f'\nnetwork={{\n  ssid="{ssid}"\n  psk="{password}"\n  key_mgmt=WPA-PSK\n}}\n'

    try:
        with open('/etc/wpa_supplicant/wpa_supplicant.conf', 'a') as f:
            f.write(entry)
        os.system('wpa_cli -i wlan0 reconfigure')
        return jsonify({'status': 'added', 'ssid': ssid})
    except PermissionError:
        return jsonify({'error': 'Permission denied — run API as root or use sudo'}), 500


# ─────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────

if __name__ == '__main__':
    ssl_context = None
    if CERT_PATH.exists() and KEY_PATH.exists():
        ssl_context = (str(CERT_PATH), str(KEY_PATH))
        logger.info('Starting JamNote API with HTTPS')
    else:
        logger.warning('No SSL certificate found — starting without HTTPS (PWA install will not work)')

    app.run(
        host='0.0.0.0',
        port=443 if ssl_context else 5000,
        ssl_context=ssl_context,
        debug=False,
        threaded=True
    )
