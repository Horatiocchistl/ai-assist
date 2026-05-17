#!/bin/bash
# ComputerUI startup script
# Ensures Ollama is running and model is pulled before starting the app

MODEL="ministral-3:14b"
OLLAMA_URL="http://localhost:11434"

echo "Checking Ollama..."

# Check if Ollama is responding
if ! curl -s "$OLLAMA_URL/api/tags" > /dev/null 2>&1; then
  echo "Ollama is not running. Launching..."
  open -a Ollama 2>/dev/null || ollama serve &
  # Wait up to 30 seconds
  for i in $(seq 1 30); do
    if curl -s "$OLLAMA_URL/api/tags" > /dev/null 2>&1; then
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "ERROR: Ollama failed to start after 30s."
      echo "Install from https://ollama.com or run 'ollama serve' manually."
      exit 1
    fi
    sleep 1
  done
fi
echo "Ollama is running."

# Check if model is pulled
if ! curl -s "$OLLAMA_URL/api/tags" | grep -q "$MODEL"; then
  echo "Model $MODEL not found. Pulling (this may take a few minutes)..."
  ollama pull "$MODEL"
  if [ $? -ne 0 ]; then
    echo "ERROR: Failed to pull $MODEL"
    exit 1
  fi
fi
echo "Model $MODEL ready."

echo ""
echo "Starting ComputerUI..."
node server.js &
npm run dev
