#!/bin/bash

# JamNote Audio Verification Script
# Run this after setup.sh to confirm both channels of your
# USB audio interface are capturing correctly
# Usage: bash verify_audio.sh

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[JamNote]${NC} $1"; }
warn() { echo -e "${YELLOW}[JamNote]${NC} $1"; }
fail() { echo -e "${RED}[JamNote]${NC} $1"; }

echo ""
echo "========================================="
echo "  JamNote Audio Verification"
echo "========================================="
echo ""

# List all audio devices
log "Detected audio capture devices:"
echo ""
arecord -l
echo ""

# Find the USB interface card number
CARD=$(arecord -l | grep -i "usb\|m-track\|scarlett\|behringer\|focusrite" | head -1 | grep -oP 'card \K[0-9]+')

if [ -z "$CARD" ]; then
  warn "Could not auto-detect USB audio interface."
  warn "Check the device list above and enter the card number manually."
  read -p "Enter card number: " CARD
fi

log "Using card $CARD for testing"
echo ""

# Test 5 second stereo capture
warn "Recording 5 seconds of stereo audio from card $CARD..."
warn "Make sure your guitar and mic are connected and producing signal."
echo ""

arecord -D hw:$CARD,0 -f S24_LE -r 44100 -c 2 -d 5 /tmp/jamnote_test.wav

if [ $? -eq 0 ]; then
  log "Capture successful — /tmp/jamnote_test.wav created"
  
  # Check file size — should be > 1MB for 5 seconds stereo 24bit 44.1k
  SIZE=$(du -k /tmp/jamnote_test.wav | cut -f1)
  if [ "$SIZE" -gt 1000 ]; then
    log "File size looks correct: ${SIZE}KB"
  else
    warn "File size seems small (${SIZE}KB) — signal may be silent or clipped"
  fi
  
  echo ""
  log "Playing back recording..."
  aplay /tmp/jamnote_test.wav
  
  echo ""
  log "Audio verification complete."
  echo ""
  warn "Did you hear your guitar and/or voice in the playback? (y/n)"
  read -p "> " result
  
  if [ "$result" = "y" ]; then
    log "Audio interface confirmed working on card $CARD"
    
    # Update device config with confirmed card number
    if [ -f /home/pi/jamnote/config/device.json ]; then
      sed -i "s/\"audio_card\": [0-9]*/\"audio_card\": $CARD/" /home/pi/jamnote/config/device.json
      log "Updated device.json with audio_card: $CARD"
    fi
  else
    fail "Audio playback did not sound correct."
    warn "Things to check:"
    echo "  - Is the USB interface plugged in and powered?"
    echo "  - Is the guitar cable connected to the ¼ in input?"
    echo "  - Is the gain knob on the interface turned up?"
    echo "  - Try a different USB port on the Pi"
    echo "  - Try: arecord -l to see if the card number changed"
  fi
else
  fail "Audio capture failed on card $CARD"
  warn "Try running: arecord -l to find the correct card number"
fi

echo ""
# Clean up
rm -f /tmp/jamnote_test.wav
