"""
JamNote — Core Recording Module
Handles simultaneous two-channel audio capture from USB interface.
Saves guitar and vocal as separate timestamped WAV files to SD card.
"""

import os
import wave
import time
import threading
import subprocess
import json
import logging
from datetime import datetime
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='[JamNote] %(message)s')
logger = logging.getLogger(__name__)

CONFIG_PATH = Path('/home/pi/jamnote/config/device.json')
DEFAULT_RECORDINGS_DIR = Path('/home/pi/recordings')


def load_config():
    """Load device configuration from JSON file."""
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, 'r') as f:
            return json.load(f)
    return {
        'sample_rate': 44100,
        'bit_depth': 24,
        'channels': 2,
        'audio_card': 1,
    }


class Recorder:
    """
    Manages audio capture from the USB interface.
    Uses arecord for reliable low-latency stereo capture,
    then splits channels into separate guitar and vocal WAV files.
    """

    def __init__(self):
        self.config = load_config()
        self.recording = False
        self.current_session = None
        self.recordings_dir = DEFAULT_RECORDINGS_DIR
        self.recordings_dir.mkdir(parents=True, exist_ok=True)
        self._process = None
        self._thread = None

    @property
    def is_recording(self):
        return self.recording

    def _timestamp(self):
        """Generate a filesystem-safe timestamp string."""
        return datetime.now().strftime('%Y%m%d-%H%M%S')

    def _stereo_path(self, timestamp):
        """Path for the raw stereo capture (temporary)."""
        return self.recordings_dir / f'{timestamp}-stereo.wav'

    def guitar_path(self, timestamp):
        """Path for the guitar channel WAV file."""
        return self.recordings_dir / f'{timestamp}-guitar.wav'

    def vocal_path(self, timestamp):
        """Path for the vocal channel WAV file."""
        return self.recordings_dir / f'{timestamp}-vocal.wav'

    def start(self):
        """Begin recording. Returns the session timestamp string."""
        if self.recording:
            logger.warning('Already recording — ignoring start request')
            return self.current_session

        timestamp = self._timestamp()
        self.current_session = timestamp
        self.recording = True

        stereo_file = self._stereo_path(timestamp)
        card = self.config.get('audio_card', 1)
        rate = self.config.get('sample_rate', 44100)

        logger.info(f'Recording started — session {timestamp}')

        # Use arecord for reliable stereo capture
        # S24_3LE = 24-bit packed, stereo, from USB interface
        cmd = [
            'arecord',
            f'-D', f'hw:{card},0',
            '-f', 'S24_3LE',
            '-r', str(rate),
            '-c', '2',
            str(stereo_file)
        ]

        self._process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        return timestamp

    def stop(self):
        """
        Stop recording. Splits stereo file into separate
        guitar and vocal WAV files. Returns session timestamp.
        """
        if not self.recording:
            logger.warning('Not currently recording — ignoring stop request')
            return None

        timestamp = self.current_session
        self.recording = False

        if self._process:
            self._process.terminate()
            self._process.wait()
            self._process = None

        logger.info(f'Recording stopped — session {timestamp}')

        # Split channels in a background thread so API responds immediately
        self._thread = threading.Thread(
            target=self._split_channels,
            args=(timestamp,),
            daemon=True
        )
        self._thread.start()

        self.current_session = None
        return timestamp

    def _split_channels(self, timestamp):
        """
        Split the stereo WAV into separate guitar (ch1) and vocal (ch2) files.
        Uses sox if available, falls back to Python wave splitting.
        """
        stereo_file = self._stereo_path(timestamp)

        if not stereo_file.exists():
            logger.error(f'Stereo file not found: {stereo_file}')
            return

        guitar_file = self.guitar_path(timestamp)
        vocal_file = self.vocal_path(timestamp)

        # Try sox first — faster and more reliable
        try:
            subprocess.run(
                ['sox', str(stereo_file), str(guitar_file), 'remix', '1'],
                check=True, capture_output=True
            )
            subprocess.run(
                ['sox', str(stereo_file), str(vocal_file), 'remix', '2'],
                check=True, capture_output=True
            )
            logger.info(f'Channels split via sox — {timestamp}')
        except (subprocess.CalledProcessError, FileNotFoundError):
            logger.info('sox not available — using Python wave splitter')
            self._python_split(stereo_file, guitar_file, vocal_file)

        # Remove the raw stereo file
        stereo_file.unlink(missing_ok=True)
        logger.info(f'Session {timestamp} ready — guitar: {guitar_file.name}, vocal: {vocal_file.name}')

    def _python_split(self, stereo_path, guitar_path, vocal_path):
        """Pure Python stereo channel splitter — fallback if sox unavailable."""
        with wave.open(str(stereo_path), 'rb') as stereo:
            params = stereo.getparams()
            n_channels = params.nchannels
            sampwidth = params.sampwidth
            n_frames = params.nframes
            frames = stereo.readframes(n_frames)

        # Interleaved stereo: L R L R L R...
        # Extract every other sample starting at 0 (guitar/left) and 1 (vocal/right)
        mono_params = params._replace(nchannels=1)

        guitar_frames = bytearray()
        vocal_frames = bytearray()

        step = sampwidth * n_channels
        for i in range(0, len(frames), step):
            guitar_frames += frames[i:i + sampwidth]
            vocal_frames += frames[i + sampwidth:i + sampwidth * 2]

        with wave.open(str(guitar_path), 'wb') as gf:
            gf.setparams(mono_params)
            gf.writeframes(bytes(guitar_frames))

        with wave.open(str(vocal_path), 'wb') as vf:
            vf.setparams(mono_params)
            vf.writeframes(bytes(vocal_frames))

    def list_sessions(self):
        """
        Return a list of completed capture sessions with metadata.
        A session is complete when both guitar and vocal files exist.
        """
        sessions = []
        guitar_files = sorted(
            self.recordings_dir.glob('*-guitar.wav'),
            reverse=True
        )

        for gf in guitar_files:
            timestamp = gf.stem.replace('-guitar', '')
            vf = self.vocal_path(timestamp)

            try:
                dt = datetime.strptime(timestamp, '%Y%m%d-%H%M%S')
                display_time = dt.strftime('%B %d, %Y at %I:%M %p')
            except ValueError:
                display_time = timestamp

            guitar_size = gf.stat().st_size if gf.exists() else 0
            vocal_size = vf.stat().st_size if vf.exists() else 0

            # Estimate duration from file size
            # 44100 samples/s * 3 bytes/sample * 1 channel
            bytes_per_second = 44100 * 3
            duration = round(guitar_size / bytes_per_second) if bytes_per_second > 0 else 0

            sessions.append({
                'id': timestamp,
                'display_time': display_time,
                'duration_seconds': duration,
                'guitar_file': str(gf),
                'vocal_file': str(vf) if vf.exists() else None,
                'has_vocal': vf.exists(),
                'guitar_size_bytes': guitar_size,
                'vocal_size_bytes': vocal_size,
                'synced': False,  # updated by sync module
                'note': '',       # updated by sync module
                'custom_name': None,
            })

        return sessions

    def delete_session(self, timestamp):
        """Delete both files for a given session."""
        gf = self.guitar_path(timestamp)
        vf = self.vocal_path(timestamp)
        stereo = self._stereo_path(timestamp)

        deleted = []
        for f in [gf, vf, stereo]:
            if f.exists():
                f.unlink()
                deleted.append(f.name)

        logger.info(f'Deleted session {timestamp}: {deleted}')
        return deleted


# Module-level recorder instance shared across the application
recorder = Recorder()
