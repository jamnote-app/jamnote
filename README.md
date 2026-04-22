# JamNote

**You're playing. You find something. Tap to capture it. Keep playing.**

JamNote is an open source, one-button audio sketch recorder for songwriter-guitarists. It runs on a Raspberry Pi connected to any class-compliant USB audio interface, captures guitar and vocal simultaneously to separate WAV files, and syncs everything to Google Drive automatically when WiFi is available. A lightweight PWA served from the device gives you a clean mobile interface — no app store, no subscriptions, no setup every time you want to record. From Google Drive your captures drop straight into any DAW — BandLab, GarageBand, Reaper, Ableton, Logic, Cakewalk, or anything else that reads WAV files.

---

## The problem it solves

Every guitarist knows the moment — you find a chord progression, a riff, a melody fragment that feels like something. By the time you open your DAW, create a session, arm a track, and get back to the guitar, the idea has either evaporated or lost the spontaneous quality that made it interesting. JamNote eliminates every step between the discovery and the capture.

---

## How it works

A Raspberry Pi sits on your desk or pedalboard connected to your existing USB audio interface. A Bluetooth shutter button clips to your guitar strap. When you find something worth keeping, you tap the button. Both inputs — guitar and vocal mic — start recording simultaneously to the SD card. Tap again to stop. The files sync to Google Drive the next time the device is on a known WiFi network. A PWA on your phone lets you review captures, add notes, rename files, and manage sync — all from your home screen without opening a browser.

---

## Hardware requirements

- Raspberry Pi Zero 2W (recommended for final build) or Raspberry Pi 4 (recommended for development)
- Any class-compliant USB audio interface — tested with M-Audio M-Track Solo and Focusrite Scarlett Solo
- USB OTG adapter (Pi Zero 2W only)
- MicroSD card — Class 10 / UHS-1 minimum, Samsung Pro Endurance recommended
- Bluetooth shutter button (any HID-compatible camera shutter remote)
- Dynamic microphone with XLR cable
- Standard ¼ inch instrument cable
- Passive Y-splitter ¼ inch cable (guitar to interface and amp simultaneously)

**Estimated hardware cost (excluding interface you already own):** ~$50–60

---

## Works with any DAW

JamNote is DAW agnostic. Captures sync automatically to Google Drive as separate guitar and vocal WAV tracks, ready to import into whatever you use to make music.

| DAW | Platform | How to import |
|-----|----------|--------------|
| BandLab | Web / iOS / Android | Open project → Add Track → import from Google Drive |
| GarageBand | iOS / Mac | Files app → Google Drive → share to GarageBand |
| Reaper | Windows / Mac | Drag WAV files from Google Drive desktop app |
| Ableton Live | Windows / Mac | Drag WAV files from Google Drive desktop app |
| Logic Pro | Mac | Drag WAV files from Google Drive desktop app |
| Cakewalk | Windows | Import audio from Google Drive desktop app |
| Any other DAW | — | Download WAV from Google Drive, import as audio track |

Because captures arrive as two separate files — one for guitar, one for vocal — they drop directly onto individual tracks in your project without any splitting or conversion needed.

For users of Reaper and Cakewalk, a companion app is in development for Phase 6 that will allow JamNote to trigger DAW recording sessions directly, eliminating the import step entirely. See the roadmap for details.
```

---

## Signal chain

```
Guitar → Y-splitter → Amp (for monitoring)
                    → USB audio interface (¼ in) ─┐
Dynamic mic ──────────────────────────────────── → Pi Zero 2W → SD card → Google Drive
                                                    (USB OTG)
```

---

## Software stack

- **OS:** Raspberry Pi OS Lite with realtime kernel
- **Audio:** ALSA / arecord for capture, PyAudio for Python integration
- **API:** Flask (Python) served over HTTPS via self-signed certificate
- **PWA:** Vanilla HTML / CSS / JavaScript with service worker for offline caching
- **Sync:** rclone for Google Drive integration
- **Discovery:** mDNS — device accessible at `jamnote.local` on your network
- **Trigger:** Bluetooth HID shutter button → PWA keycode listener → Flask API

---

## Getting started

### 1. Flash the SD card

Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/) to flash Raspberry Pi OS Lite. In the advanced settings, enable SSH and pre-configure your WiFi credentials before writing.

### 2. Boot and connect

Insert the SD card, boot the Pi, and find its IP address from your router's admin page. SSH in:

```bash
ssh pi@jamnote.local
# or
ssh pi@<ip-address>
```

### 3. Run the setup script

```bash
curl -sSL https://raw.githubusercontent.com/jamnote/jamnote/main/scripts/setup.sh | bash
```

This installs all dependencies, configures HTTPS, sets up mDNS, authenticates Google Drive via rclone, and registers the recording service to start on boot.

### 4. Verify hardware

Plug in your USB audio interface and confirm both channels are visible:

```bash
arecord -l
```

You should see your interface listed as a capture device. Record a quick test:

```bash
arecord -D hw:1,0 -f S24_LE -r 44100 -c 2 -d 5 test.wav
```

If `test.wav` exists and plays back cleanly, your hardware foundation is confirmed.

### 5. Install the PWA

On your phone, connect to the same WiFi network as the Pi, open your browser, and navigate to:

```
https://jamnote.local
```

Accept the self-signed certificate warning once. When prompted, add the app to your home screen. From this point forward it launches like a native app.

### 6. Pair your Bluetooth shutter button

Put your shutter button in pairing mode and pair it to your phone via Bluetooth settings. The PWA listens for the shutter keycode and triggers recording start and stop automatically.

---

## PWA screens

**Record** — input level meters for guitar and vocal, large record button, last capture preview with waveform thumbnail and sync status.

**Library** — chronological list of all captures with waveform thumbnails, duration, active inputs, sync status, and text notes.

**Settings** — Google Drive connection and upload folder, saved WiFi networks, audio settings (sample rate, bit depth), device name, SD card usage.

**Sync flow** — when WiFi is detected, prompts you to review queued captures before upload. Per-capture review lets you add a note, rename the file from its auto-generated timestamp, and choose the upload folder. Captures sync automatically in the background if you skip review.

---

## Tested interfaces

| Interface | Status | Notes |
|-----------|--------|-------|
| M-Audio M-Track Solo | ✅ Confirmed | Direct USB, no hub required on Pi 4 |
| Focusrite Scarlett Solo (3rd gen) | ✅ Confirmed | Direct USB, low power draw |
| Behringer UMC22 | ✅ Confirmed | |
| Focusrite Scarlett 2i2 | ⚠️ Powered hub recommended | Higher current draw |

If you confirm compatibility with an interface not listed here, please open a pull request updating this table.

---

## Project structure

```
jamnote/
  firmware/
    recording/       # Python capture scripts and GPIO/Bluetooth listener
    api/             # Flask web server and API endpoints
    sync/            # rclone sync logic and queue management
    services/        # systemd service files for autostart
  pwa/
    src/             # PWA frontend — HTML, CSS, JavaScript
    public/          # Static assets, PWA manifest, service worker
  scripts/
    setup/           # First-time setup and configuration scripts
    config/          # Device configuration helpers
  docs/              # Additional documentation
```

---

## Development roadmap

### MVP (current focus)
- [x] Hardware validation and signal chain
- [x] Two-channel WAV capture on button trigger
- [x] Flask API with recording, library, and settings endpoints
- [x] PWA frontend — all screens
- [ ] Google Drive sync via rclone
- [ ] Bluetooth shutter button trigger via PWA
- [ ] mDNS local discovery at jamnote.local
- [ ] Systemd autostart on boot

### Post-MVP
- [ ] DAW integration — JSON control protocol for initiating DAW recording sessions
- [ ] Companion app for Windows (Cakewalk, Reaper)
- [ ] Companion app for Mac (Logic, Ableton)
- [ ] Remote access via Tailscale
- [ ] Hosted PWA shell for library access away from home network

---

## Contributing

JamNote is open source and welcomes contributions. The most useful contributions right now are:

- **Interface compatibility testing** — try it with your interface and report results
- **DAW companion app development** — if you know the Reaper or Cakewalk APIs
- **PWA improvements** — frontend polish, accessibility, iOS/Android edge cases
- **Documentation** — setup guides for specific hardware combinations

Please open an issue before starting significant work so we can discuss approach and avoid duplication.

---

## Philosophy

JamNote does one thing — capture the moment — and tries to do it without friction. The best version of this tool is the one you forget is there until you need it.

It is deliberately DAW agnostic and platform neutral. The capture layer runs on any Raspberry Pi with any class-compliant USB audio interface. The sync layer uses Google Drive, which every major DAW workflow can reach. The companion app layer, when it arrives, will add direct integration for specific DAWs without changing anything about how the core device works.

Feature requests that add complexity to the core capture workflow will be considered carefully. Requests that extend compatibility with new DAWs, interfaces, or platforms are always welcome.
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgements

Built on Raspberry Pi OS, Flask, rclone, and the broader open source audio community. Inspired by the Lava Me guitar's onboard recording feature and every great idea lost between the guitar and the DAW.
