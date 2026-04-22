#!/bin/bash

# JamNote Setup Script
# Run this on a fresh Raspberry Pi OS Lite installation
# Usage: bash setup.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[JamNote]${NC} $1"; }
warn() { echo -e "${YELLOW}[JamNote]${NC} $1"; }
error() { echo -e "${RED}[JamNote]${NC} $1"; exit 1; }

echo ""
echo "========================================="
echo "  JamNote Setup"
echo "  One-button guitar sketch recorder"
echo "========================================="
echo ""

# Confirm running as pi user
if [ "$USER" != "pi" ]; then
  warn "This script is intended to run as the 'pi' user."
  read -p "Continue anyway? (y/n): " confirm
  [ "$confirm" != "y" ] && exit 1
fi

# Update system
log "Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

# Install system dependencies
log "Installing system dependencies..."
sudo apt-get install -y -qq \
  python3 \
  python3-pip \
  python3-venv \
  alsa-utils \
  portaudio19-dev \
  libportaudio2 \
  avahi-daemon \
  openssl \
  curl \
  git \
  libasound2-dev

# Install rclone
log "Installing rclone..."
curl -fsSL https://rclone.org/install.sh | sudo bash

# Create virtual environment
log "Creating Python virtual environment..."
cd /home/pi
python3 -m venv jamnote-env
source jamnote-env/bin/activate

# Install Python dependencies
log "Installing Python packages..."
pip install -q \
  flask \
  pyaudio \
  RPi.GPIO \
  requests

deactivate

# Clone the JamNote repo
log "Cloning JamNote repository..."
if [ -d "/home/pi/jamnote" ]; then
  warn "JamNote directory already exists — pulling latest..."
  cd /home/pi/jamnote
  git pull origin dev
else
  git clone -b dev https://github.com/jamnote/jamnote.git /home/pi/jamnote
fi

# Generate self-signed SSL certificate for PWA HTTPS requirement
log "Generating SSL certificate..."
mkdir -p /home/pi/jamnote/certs
openssl req -x509 -newkey rsa:4096 -keyout /home/pi/jamnote/certs/key.pem \
  -out /home/pi/jamnote/certs/cert.pem -days 3650 -nodes \
  -subj "/C=US/ST=Local/L=Local/O=JamNote/CN=jamnote.local" \
  -addext "subjectAltName=DNS:jamnote.local,IP:127.0.0.1" 2>/dev/null
log "SSL certificate generated (valid 10 years)"

# Configure mDNS hostname
log "Configuring mDNS hostname..."
sudo hostnamectl set-hostname jamnote
echo "127.0.1.1 jamnote.local jamnote" | sudo tee -a /etc/hosts > /dev/null

# Configure ALSA for low latency audio
log "Configuring ALSA..."
cat > /home/pi/.asoundrc << 'EOF'
pcm.!default {
  type asym
  playback.pcm "plughw:0,0"
  capture.pcm "plughw:1,0"
}
ctl.!default {
  type hw
  card 1
}
EOF

# Install systemd services
log "Installing systemd services..."
sudo cp /home/pi/jamnote/firmware/services/jamnote-api.service /etc/systemd/system/
sudo cp /home/pi/jamnote/firmware/services/jamnote-sync.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable jamnote-api
sudo systemctl enable jamnote-sync

# Configure rclone Google Drive
echo ""
log "Now configuring Google Drive sync..."
warn "You will be prompted to authenticate with Google Drive."
warn "Follow the instructions — you may need to open a URL on another device."
echo ""
rclone config

echo ""
log "Testing audio interface..."
echo ""
arecord -l
echo ""
warn "Verify your USB audio interface appears in the list above."
warn "Note the card number (e.g. 'card 1') — you may need it for configuration."
echo ""

# Write device config
log "Writing device configuration..."
mkdir -p /home/pi/jamnote/config
cat > /home/pi/jamnote/config/device.json << EOF
{
  "device_name": "jamnote",
  "hostname": "jamnote.local",
  "sample_rate": 44100,
  "bit_depth": 24,
  "channels": 2,
  "audio_card": 1,
  "upload_path": "/recordings",
  "rclone_remote": "gdrive",
  "cert_path": "/home/pi/jamnote/certs/cert.pem",
  "key_path": "/home/pi/jamnote/certs/key.pem"
}
EOF

echo ""
echo "========================================="
echo "  Setup complete"
echo "========================================="
echo ""
log "Next steps:"
echo "  1. Reboot the Pi: sudo reboot"
echo "  2. After reboot, visit https://jamnote.local on your phone"
echo "  3. Accept the certificate warning once"
echo "  4. Add JamNote to your home screen"
echo ""
log "To test audio capture manually before rebooting:"
echo "  arecord -D hw:1,0 -f S24_LE -r 44100 -c 2 -d 5 /tmp/test.wav"
echo "  aplay /tmp/test.wav"
echo ""
