#!/usr/bin/env python3
"""
Wrapper to run event viewer - allows Ctrl+C to work in WebStorm
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from thelearningtablet.cli.event_viewer import main

if __name__ == '__main__':
    main()
