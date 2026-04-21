# JamNote — Setup Guide

This guide walks through everything needed to get JamNote running on a Raspberry Pi. It covers hardware preparation, OS installation, running the setup script, verifying audio, and installing the PWA on your phone.

---

## What you need before starting

**Hardware:**
- Raspberry Pi 4 (development) or Pi Zero 2W (final build)
- MicroSD card — 32GB, Class 10 / UHS-1 minimum (Samsung Pro Endurance recommended)
- MicroSD card reader for your computer
- USB audio interface — M-Audio M-Track Solo, Focusrite Scarlett Solo, or any class-compliant USB interface
- USB OTG adapter if using Pi Zero 2W (micro USB to USB A)
- Dynamic microphone with XLR cable
- Guitar with ¼ inch cable
- Passive Y-splitter ¼ inch cable
- Power supply — official Raspberry Pi USB-C power supply recommended
- A phone on the same WiFi network for PWA installation

**Software on your computer:**
- Raspberry Pi Imager — download free from raspberrypi.com/software

**Accounts:**
- Google account for Google Drive sync

---

## Step 1 — Flash the SD card

Download and open Raspberry Pi Imager on your computer.

- Click **Choose Device** and select your Pi model
- Click **Choose OS** → **Raspberry Pi OS (other)** → **Raspberry Pi OS Lite (64-bit)**
- Click **Choose Storage** and select your SD card — double check you have the right drive
- Click the **gear icon** (or Next → Edit Settings) to open advanced settings before writing:

In advanced settings configure the following:

| Setting | Value |
|---------|-------|
| Hostname | `jamnote` |
| Enable SSH | Yes — use password authentication |
| Username | `pi` |
| Password | Choose a strong password and note it down |
| WiFi SSID | Your home network name |
| WiFi Password | Your home network password |
| WiFi Country | Your country code (e.g. US, GB) |

Click **Save** then **Write**. This takes a few minutes. When complete, eject the SD card safely.

---

## Step 2 — First boot

Insert the SD card into the Pi and connect power. The Pi will boot and connect to your WiFi network automatically using the credentials you entered.

Wait about 60 seconds for the first boot to complete.

Find the Pi's IP address by checking your router's admin page — look for a device named `jamnote` or `raspberrypi`. Note the IP address for the next step.

---

## Step 3 — Connect via SSH

On your computer open a terminal (Mac/Linux) or Command Prompt / PowerShell (Windows) and type:

```bash
ssh pi@jamnote.local
```

If that doesn't resolve try the IP address directly:

```bash
ssh pi@192.168.1.x
```

Replace `192.168.1.x` with the actual IP address from your router.

When prompted, type `yes` to accept the host key, then enter the password you set in the Imager.

You should now see a prompt like `pi@jamnote:~ $` — you are connected.

---

## Step 4 — Clone the repository

Download the JamNote code from GitHub:

```bash
git clone -b dev https://github.com/jamnote/jamnote.git /home/pi/jamnote
```

This creates a `/home/pi/jamnote` folder containing all the firmware, scripts, and PWA files.

---

## Step 5 — Run the setup script

```bash
cd /home/pi/jamnote
bash scripts/setup/setup.sh
```

The setup script will work through the following automatically — this takes around 5 to 10 minutes:

1. Update system packages
2. Install system dependencies (Python, ALSA audio tools, avahi for mDNS, openssl, git)
3. Install rclone for Google Drive sync
4. Create a Python virtual environment at `/home/pi/jamnote-env`
5. Install Python packages (Flask, PyAudio, RPi.GPIO)
6. Generate a self-signed SSL certificate (required for PWA installation on phone)
7. Configure the hostname as `jamnote` and set up mDNS so the device is reachable at `jamnote.local`
8. Configure ALSA audio settings for low latency capture
9. Install and enable systemd services for the API and sync watcher

**Google Drive authentication**

Near the end of the script you will be prompted to configure rclone for Google Drive. Follow these steps when prompted:

- Type `n` for new remote
- Name it `gdrive`
- Choose `drive` as the storage type (Google Drive)
- Leave client ID and secret blank — press Enter
- Choose scope `1` (full access)
- Leave service account blank — press Enter
- Type `y` to use auto config if you are on a desktop Pi, or `n` if headless (Pi Zero 2W or SSH session without a browser)
- If headless: rclone will display a URL — open it on another device, sign in with your Google account, and paste the verification code back into the terminal
- Type `n` when asked if this is a shared drive
- Type `y` to confirm the configuration

When rclone configuration is complete the script will finish and display next steps.

---

## Step 6 — Verify audio capture

Plug your USB audio interface into the Pi. Then run the audio verification script:

```bash
bash /home/pi/jamnote/scripts/setup/verify_audio.sh
```

This script will:
- List all detected audio capture devices
- Attempt to auto-detect your USB interface
- Record 5 seconds of stereo audio
- Play it back so you can confirm both channels are working
- Update the device configuration with the correct audio card number

**What you should see:** Your USB interface listed in the device list — for example `card 1: Solo [M-Track Solo], device 0`.

**What you should hear on playback:** Your guitar signal on one channel, your microphone on the other.

**If the interface is not detected:**
- Check the USB cable is firmly connected
- Try a different USB port
- Run `arecord -l` to list devices manually
- If using Pi Zero 2W confirm the OTG adapter is connected correctly

---

## Step 7 — Test a manual recording

Before relying on the full system, do a quick manual capture to confirm end to end:

```bash
# Record 10 seconds of stereo audio
arecord -D hw:1,0 -f S24_LE -r 44100 -c 2 -d 10 /tmp/test.wav

# Confirm the file was created and has content
ls -lh /tmp/test.wav

# Play it back
aplay /tmp/test.wav
```

If `test.wav` exists and plays back with audible signal from both guitar and mic inputs, the hardware foundation is confirmed.

---

## Step 8 — Reboot

```bash
sudo reboot
```

After rebooting, the JamNote API and sync watcher will start automatically as systemd services. Wait about 30 seconds then confirm the API is running:

```bash
ssh pi@jamnote.local
sudo systemctl status jamnote-api
sudo systemctl status jamnote-sync
```

Both should show `active (running)`. If either shows `failed`, check the logs:

```bash
sudo journalctl -u jamnote-api -n 50
sudo journalctl -u jamnote-sync -n 50
```

---

## Step 9 — Install the PWA on your phone

Make sure your phone is on the same WiFi network as the Pi.

**On Android (Chrome):**
- Open Chrome and navigate to `https://jamnote.local`
- You will see a security warning about the self-signed certificate — tap **Advanced** then **Proceed to jamnote.local**
- Chrome will show an **Install app** banner or you can tap the three-dot menu → **Add to Home screen**
- Tap **Install**

**On iPhone (Safari):**
- Open Safari and navigate to `https://jamnote.local`
- You will see a certificate warning — tap **Show Details** → **visit this website** → **Visit Website**
- Tap the **Share** icon at the bottom of the screen
- Tap **Add to Home Screen**
- Tap **Add**

The JamNote icon will appear on your home screen. Tap it to launch — it opens full screen without browser chrome, like a native app.

---

## Step 10 — Pair the Bluetooth shutter button

Put your Bluetooth shutter button into pairing mode (hold the button until the LED flashes — refer to your button's instructions).

On your phone go to **Settings → Bluetooth** and pair the shutter button. It will appear as a camera shutter or HID keyboard device.

Once paired, open JamNote from your home screen. The PWA listens for the shutter keycode. Press the button once to start recording, press again to stop.

---

## Confirming everything works

With the PWA open and your guitar plugged in:

1. Press the shutter button — the record indicator in the PWA should activate
2. Play something on the guitar and speak into the mic
3. Press the shutter button again to stop
4. The capture should appear in the Library screen within a few seconds
5. Tap the waveform thumbnail to confirm playback works
6. If WiFi is connected, the capture should sync to Google Drive automatically or prompt you to review on next WiFi connection

---

## Troubleshooting

**`jamnote.local` not reachable from phone:**
- Confirm Pi is on and connected to the same WiFi network
- Try the Pi's IP address directly in the browser instead
- Check avahi-daemon is running: `sudo systemctl status avahi-daemon`

**Certificate warning won't let you proceed:**
- On iPhone use Safari specifically — Chrome on iOS does not support PWA installation
- On Android use Chrome

**Recording button does nothing:**
- Confirm the API service is running: `sudo systemctl status jamnote-api`
- Check the browser console for errors (Android Chrome: chrome://inspect)
- Confirm Bluetooth shutter button is connected to the phone, not the Pi

**No signal in recordings:**
- Run `verify_audio.sh` again to confirm the audio card number is correct
- Check the gain knob on the interface is turned up
- Confirm the correct input is selected on the interface (instrument vs mic)

**Google Drive sync not working:**
- Test rclone manually: `rclone ls gdrive:/recordings`
- If it asks to authenticate again: `rclone config reconnect gdrive:`
- Check the sync service logs: `sudo journalctl -u jamnote-sync -n 50`

**API service fails to start:**
- Check port 443 is not in use: `sudo lsof -i :443`
- Confirm the SSL certificate exists: `ls /home/pi/jamnote/certs/`
- If certs are missing re-run the certificate generation step from setup.sh manually:

```bash
mkdir -p /home/pi/jamnote/certs
openssl req -x509 -newkey rsa:4096 \
  -keyout /home/pi/jamnote/certs/key.pem \
  -out /home/pi/jamnote/certs/cert.pem \
  -days 3650 -nodes \
  -subj "/CN=jamnote.local" \
  -addext "subjectAltName=DNS:jamnote.local"
```

---

## Useful commands reference

```bash
# Check service status
sudo systemctl status jamnote-api
sudo systemctl status jamnote-sync

# Restart services
sudo systemctl restart jamnote-api
sudo systemctl restart jamnote-sync

# View live logs
sudo journalctl -u jamnote-api -f
sudo journalctl -u jamnote-sync -f

# List audio devices
arecord -l

# Manual recording test (10 seconds)
arecord -D hw:1,0 -f S24_LE -r 44100 -c 2 -d 10 /tmp/test.wav

# Check recordings on SD card
ls -lh /home/pi/recordings/

# Test Google Drive connection
rclone ls gdrive:/recordings

# Check disk space
df -h /home/pi

# Update JamNote to latest dev branch
cd /home/pi/jamnote && git pull origin dev
sudo systemctl restart jamnote-api jamnote-sync
```

---

## File locations reference

| File / Directory | Purpose |
|-----------------|---------|
| `/home/pi/jamnote/` | Main project directory |
| `/home/pi/jamnote/config/device.json` | Device configuration |
| `/home/pi/jamnote/config/metadata.json` | Session notes, names, sync status |
| `/home/pi/jamnote/config/sync_queue.json` | Persisted sync queue |
| `/home/pi/jamnote/certs/` | SSL certificate and key |
| `/home/pi/recordings/` | Captured WAV files |
| `/home/pi/jamnote-env/` | Python virtual environment |
| `/etc/systemd/system/jamnote-api.service` | API systemd service |
| `/etc/systemd/system/jamnote-sync.service` | Sync systemd service |
| `~/.config/rclone/rclone.conf` | rclone Google Drive credentials |
