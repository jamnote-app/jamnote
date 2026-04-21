# JamNote — Project Summary

*Comprehensive reference document capturing all decisions, architecture, and context from the initial project session. Use this as the starting context for future Claude conversations about JamNote.*

---

## The concept in one sentence

You're playing guitar, you find something worth keeping — tap a Bluetooth button, keep playing, the capture happens silently, everything syncs to Google Drive automatically.

---

## Problem statement

The friction between discovering a musical idea and capturing it causes good material to get lost. Opening a DAW, creating a session, arming tracks, and getting back to the guitar breaks creative momentum and often means the spontaneous quality of the idea is gone before it's recorded. JamNote eliminates every step between the discovery and the capture.

---

## What it is

A Raspberry Pi device that connects to any existing USB audio interface, captures guitar and vocal simultaneously as separate WAV files on button trigger, and syncs to Google Drive when WiFi is available. A PWA (Progressive Web App) served from the device provides the interface — no app store, no subscription, no DAW required for basic capture.

---

## Origin

Developed in a single conversation session. The core hardware concept came from a personal frustration with the gap between idea and capture. The Lava Me acoustic guitar's onboard recording feature was the inspiration — the goal is to replicate that one-button capture experience for electric guitar players who already own an interface.

---

## Hardware

### Final build (production)
- **Compute:** Raspberry Pi Zero 2W (~$15)
- **Interface:** Any class-compliant USB audio interface (user-owned)
- **Adapter:** USB OTG micro USB to USB A (~$5)
- **Button:** Bluetooth HID shutter button clipped to guitar strap (~$10–20)
- **Storage:** Samsung Pro Endurance 32GB microSD (~$18)
- **Enclosure:** Small project box (~$10)
- **Total additional cost:** ~$50–60 (excluding interface already owned)

### Development/prototype
- Raspberry Pi 4 (gifted — use for all development work)
- Pi 4 has full-size USB ports — no OTG adapter needed
- Same GPIO pinout as Zero 2W — all code transfers directly

### Primary test interface
- M-Audio M-Track Solo — USB bus powered, class compliant, confirmed working on Pi 4
- Power note: M-Track Solo draws ~500mA — should be fine on Pi 4 direct, may need powered hub on Zero 2W

### Confirmed compatible interfaces
- M-Audio M-Track Solo ✅
- Focusrite Scarlett Solo 3rd gen ✅ (low power draw)
- Behringer UMC22 ✅
- Focusrite Scarlett 2i2 ⚠️ (powered hub recommended)

---

## Signal chain

```
Guitar → passive Y-splitter → Fender Mustang III front input (playing tone / monitoring)
                            → M-Track Solo ¼ in input (dry capture)
Dynamic mic ──────────────→ M-Track Solo XLR input (vocal capture)
M-Track Solo ─────────────→ Pi Zero 2W via USB OTG
Pi Zero 2W ───────────────→ SD card (immediate) → Google Drive (on WiFi)
```

### Key decisions
- **Y-splitter** rather than amp thru: Mustang III uses amp modeling through front input; M-Track RCA outputs are line level which would require attenuation or use of FX return (bypasses amp modeling). Passive Y-splitter at the guitar is simpler and cleaner.
- **Dry capture:** Always record the direct instrument signal. Amp simulation applied post-production in DAW.
- **Dynamic mic:** No phantom power required — simplifies hardware significantly. Adequate quality for reference recordings.
- **No GPIO button:** Physical button eliminated in favor of Bluetooth shutter button → PWA trigger. Cleaner architecture, puts the trigger in the player's hand on the instrument.

---

## Software architecture

### On the Pi
- **OS:** Raspberry Pi OS Lite with realtime kernel patch
- **Audio capture:** Python with PyAudio or arecord — two-channel simultaneous WAV
- **Web server:** Flask (Python) — serves both the PWA and the API
- **API:** REST endpoints for recording control, library management, settings, sync
- **Cloud sync:** rclone — Google Drive integration, async background sync
- **Discovery:** mDNS — device accessible at `jamnote.local`
- **Security:** Self-signed HTTPS certificate (required for PWA installation)
- **Autostart:** systemd services — Flask and recording daemon start on boot
- **File naming:** Automatic timestamp — `YYYYMMDD-HHMMSS-guitar.wav` / `YYYYMMDD-HHMMSS-vocal.wav`

### PWA frontend
- **Stack:** Vanilla HTML, CSS, JavaScript — no framework needed for this scope
- **PWA:** Manifest + service worker for home screen installation and offline caching
- **Hosted on:** The Pi itself — accessible at `jamnote.local` on local network
- **Installation:** Navigate to `jamnote.local` in phone browser → accept cert warning once → Add to Home Screen

### Bluetooth trigger chain
Shutter button → Bluetooth HID → phone sees as keyboard keycode → PWA keycode listener → POST /record/start to Flask API → Pi starts recording

This means the Pi never needs to know a physical button exists — it just responds to API calls regardless of what initiated them.

---

## PWA screens

### Record screen
- Input level meters for guitar and vocal channels
- Large record button (soft UI — no physical button on device)
- Last capture preview with waveform thumbnail and sync status
- Device status indicators — WiFi connectivity, SD card

### Library screen
- Chronological capture list
- Waveform thumbnails, duration, active inputs
- Sync status badges (synced / queued)
- Text notes added during sync review

### Settings screen
- Google Drive connection and upload folder path
- Saved WiFi networks (multiple — home, rehearsal space, phone hotspot)
- Audio settings: sample rate (default 44.1kHz), bit depth (default 24-bit)
- Device name (default: jamnote.local)
- SD card usage display

### Sync flow (triggered on WiFi connection)
1. **WiFi detected** — shows queued captures, offers Review and Sync vs Sync Now (skip review) vs Remind Me Later
2. **Review each capture** — playback, add text note, rename file from timestamp, choose upload folder, option to delete; steps through captures one at a time with progress indicator
3. **Upload complete** — confirmation screen showing uploaded files with names and statuses

### Key design decisions
- **No prompt at capture time** — recording is silent and immediate, never interrupts playing
- **Review at sync time** — metadata (notes, filenames) added when WiFi connects, not during capture
- **Timestamp as default filename** — always captures even if never reviewed
- **SD card as safety net** — files persist locally regardless of WiFi; cloud is async

---

## PWA hosting

The PWA is served locally from the Pi. This is the correct approach for MVP:
- No external hosting needed
- No domain, no SSL certificate authority, no deployment pipeline
- PWA and Flask API are always the same version
- Self-signed cert warning appears once on installation, never again

Future options if remote access needed:
- Tailscale for secure remote access without exposing Pi to internet
- Hosted PWA shell on GitHub Pages / Netlify for library browsing away from home

---

## DAW integration (post-MVP feature)

A future companion app running on the user's PC would allow the Bluetooth button to trigger actual DAW recording sessions rather than just capturing to the Pi.

### Protocol concept
Pi sends standardized JSON over local network:
```json
{
  "action": "record",
  "mode": "new_project",
  "track_name": "sketch",
  "timestamp": "2025-04-17T09:38:12",
  "inputs": ["guitar", "vocal"]
}
```

Companion app on PC translates to DAW-specific API calls.

### DAW targets
- **Cakewalk** (Windows): COM automation API
- **Reaper** (Windows/Mac): HTTP API (ReaScript) — most open and accessible
- **Ableton Live**: MIDI remote scripting API
- **Logic** (Mac): Limited external control options

### Companion app design
- Runs in system tray, starts on login
- Invisible until triggered
- DAW-agnostic device firmware — translation layer is DAW-specific
- Round-trip latency target: under 500ms from button press to DAW recording start

---

## Open source strategy

### Why open source
- Hardware compatibility: community tests their own interfaces and contributes results
- Platform expansion: community ports companion app to their DAW
- No manufacturing burden: users provide their own Pi and interface
- Eliminates supply chain complexity entirely

### Monetization options
- **SaaS layer:** Free local firmware, paid cloud backend for organized library, search, sharing (~$3–5/month)
- **Hosted PWA:** Free self-hosted version, paid hosted version with polished onboarding
- **GitHub Sponsors / Patreon:** Direct community support
- **Setup services:** Paid setup and configuration for non-technical users
- **Compatibility with commercial Kickstarter:** Build community first, validate demand, then consider hardware bundle

### Commercial positioning if hardware product pursued
- **Price point:** $50–60 as an add-on for users who already own an interface
- **Market:** Guitarist-songwriters with existing USB interface who find DAW setup too slow for idea capture
- **Pitch:** "Already have a Focusrite? Turn it into an always-on sketch recorder for $50"
- **Distribution:** Reverb.com, direct website, small Kickstarter to validate

---

## Project name

**JamNote** — cleared in search, no existing music/recording product with this name. Jam.dev and Jamworks exist but are completely unrelated categories.

### Domain candidates
- jamnote.app (most fitting given PWA nature)
- jamnote.io
- jamnote.com

### GitHub
- Reserve `jamnote` organization name early (free)
- Repo: `github.com/jamnote/jamnote`

---

## Logo concept

**Direction:** A circle containing a solid-filled DAW-style waveform — dense, mirrored, exaggerated height variation. Rising from the center as the tallest peak is a capital J drawn as an eighth note. The J's vertical stroke is the note stem, the hook curves right at the bottom, and a single curved flag sweeps down and to the right from the top of the stem in classic handwritten notation style. The waveform presses in close on both sides of the J so the note feels like it's emerging from the audio.

**Color:** DAW green — approximately #0F6E56 — on transparent background.

**Wordmark:** Jam in brand green at heavier weight, Note in neutral at light weight, horizontal to the right of or below the mark.

**Note:** SVG hand-coding cannot render the J letterform cleanly — needs a professional designer in Illustrator or Inkscape to execute the bezier curves properly. The concept is clear enough to brief a designer directly.

**Rationale for simplicity:** Earlier explorations incorporating J + a + M letterforms plus crosshair plus waveform plus outer ring were too busy. The reduced mark (J eighth note in waveform inside circle) does one thing well and scales to favicon size.

---

## Git strategy

### Branching model
- `main` — last known working state, nothing merged here until tested on Pi
- `dev` — active development, day-to-day work
- Feature branches off dev: `feature/phase1-foundation`, `feature/phase2-recording`, etc.
- Merge feature → dev (confirm working) → merge dev → main

### Repo structure
```
jamnote/
  firmware/
    recording/
    api/
    sync/
    services/
  pwa/
    src/
    public/
  scripts/
    setup/
    config/
  docs/
  README.md
```

### Important
- Never commit rclone config or Google Drive auth tokens — add to .gitignore immediately
- Template session in README setup script handles credentials separately

---

## Development phases

### Phase 1 — Pi foundation (first session when Pi 4 arrives)
Install OS, configure SSH and WiFi, verify M-Track Solo recognized as USB audio device, confirm both channels visible, test basic two-channel capture from command line, test rclone upload to Google Drive.

**First session milestone:** `arecord -l` shows M-Track, test WAV records and plays back cleanly. Everything after this is software.

### Phase 2 — Core recording
Python capture script, timestamped file naming, Bluetooth/PWA trigger, end-to-end test: button press → two WAV files in Google Drive.

### Phase 3 — Flask API
Full REST API, mDNS, HTTPS, all endpoints for recording, library, settings, sync, WiFi config.

### Phase 4 — PWA frontend
All screens built and functional, service worker, PWA manifest, tested on iOS and Android.

### Phase 5 — Polish
Error handling, sync queue persistence across reboots, systemd autostart, SD card warnings, buffer optimization, waveform thumbnail generation.

### Phase 6 — DAW integration (separate release)
JSON protocol spec, Windows companion app (Cakewalk + Reaper), Mac companion app (Logic + Ableton).

---

## The guitar and the song

*Context: JamNote emerged from a songwriter working on an original song. The song development informed some of the product thinking. Captured here for reference.*

### Song structure
- **Key:** D major
- **Structure:** Verse → Chorus → Verse → Chorus → Break → Solo → Chorus (stripped) → Final Chorus

### Verse progression
D → Em → A (I → ii → V)

Guitar voicings (tab, strings 6–1, standard EADGBE):
- D variants: `10-0-0-11-x-x` (D major), `10-0-0-9-x-x` (Dsus2), `10-0-11-9-x-x` (Dmaj7), `10-0-12-9-x-x` (Dadd9)
- Em: `0-14-12-11-x-x` (Em add13)
- A: `x-0-11-9-x-x` (A major)

The G string carries an embedded melodic line across all D variants: 11 → 9 → 9 → 9 (F# → E → E → E).

### Chorus progression
Two cycles: Em7 → Asus4 → [resolution]
- Cycle 1 resolves to A major (full landing)
- Cycle 2 withholds resolution: Asus4 → Aaug → Asus2 → returns to verse D

Chorus voicings:
- Em add9: `0-14-12-14-x-x`
- Em7: `0-14-12-12-x-x`
- Asus4: `x-0-11-11-x-x`
- A major: `x-0-11-9-x-x`
- Aaug: `x-0-11-12-x-x`
- Asus2: `x-0-11-14-x-x`

G string melodic arc across chorus: 14 → 12 → 11 → 9 (descending, cycle 1) then 11 → 12 → 14 (ascending, cycle 2 — denied resolution pulls back to verse).

### Break
Bm7 → A (vi → V)

Voicing: `x-14-16-14-14-x` (Bm7) with hammer-on figure on D string fret 16 → 17 (F# → G, b3 to 4th)
Resolution: `x-0-16-14-x-x` (G/A) → `x-0-14-14-x-x` (Dmaj7/A)

### Production concept
- **Primary guitar:** Fender Telecaster, middle pickup, Fender Princeton emulation (light breakup) via Fender Mustang III
- **Backing guitar:** Cowboy chords (D, Em, A) — verse only, Champion 15 emulation (thin, bridge pickup)
- **Solo:** Clean neck pickup tone transitioning to heavier distortion; final note (D) rings and dissolves into distortion as vocal enters acapella
- **Stripped section:** After solo — near-acapella chorus or sparse bass and drums, vocal emerges over dying distorted D note
- **Final chorus:** Full arrangement returns, additional guitar layer
- **Bass:** Palm-muted D (fret 10, low E string) during D chord variants; alternating open E and 7th fret A string (both E, different octaves) during Em and A sections
- **Recording setup:** Cakewalk Sonar, M-Track Solo interface, record dry then add amp simulation post-production
- **Second guitar:** Potentially mirrors chorus melody or variation; decisions deferred until vocal melody established

### Compositional notes
- G string melodic line is a compound melody embedded in the voicings — intentional throughout
- The Aaug in chorus cycle 2 is the only non-diatonic moment in the song — its surprise lands because everything else is settled D major
- Vocal melody: intended to be short (few notes), counterpoint to guitar, letting the guitar carry the melodic weight
- Lyrics not yet written — structure and feel established first

---

## Open questions and next steps

### Immediate (when Pi 4 arrives)
- Run Phase 1 setup with Claude's assistance — setup script will be written during that session
- Confirm M-Track Solo recognized and both channels capture cleanly
- Register `jamnote` on GitHub

### Near term
- Commission logo from a designer using the brief in this document
- Check domain availability and register jamnote.app
- Build Phase 2 core recording functionality

### Deferred
- Vocal melody and lyrics for the song
- Bass line through chorus and break sections
- Second guitar arrangement decisions
- DAW integration companion app
- Commercial viability assessment after prototype is working

---

## How to use this document in a new Claude conversation

Paste this document (or relevant sections) at the start of a new chat with a message like:

> "I'm continuing work on JamNote, an open source Pi-based guitar sketch recorder. Here's the project summary from my previous session: [paste document]. Today I want to work on [specific task]."

Claude will have full context on decisions made, architecture chosen, and reasoning behind key choices without needing to re-derive everything from scratch.
