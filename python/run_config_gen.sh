#!/bin/bash
# Run config generator and save PID for easy killing

cd "$(dirname "$0")"
source venv/bin/activate 2>/dev/null || true

# Kill any existing processes first
./kill_tablet_processes.sh

echo ""
echo "Starting config generator..."
echo "To stop: Press Ctrl+C or run ./kill_tablet_processes.sh in another terminal"
echo ""

python -m blankslate.cli.config_generator "$@"
