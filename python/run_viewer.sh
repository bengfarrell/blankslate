#!/bin/bash
# Run event viewer and save PID for easy killing

cd "$(dirname "$0")"
source venv/bin/activate 2>/dev/null || true

# Kill any existing processes first
./kill_tablet_processes.sh

echo ""
echo "Starting event viewer..."
echo "To stop: run ./kill_tablet_processes.sh in another terminal"
echo ""

python -m thelearningtablet.cli.event_viewer -c my-tablet-config.json
