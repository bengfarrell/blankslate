"""Tests for config auto-detection functionality."""

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from blankslate.utils.finddevice import find_config_for_device


class TestFindConfigForDevice:
    """Tests for find_config_for_device function."""

    @pytest.fixture
    def config_dir(self):
        """Create a temporary directory with test config files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # XP-Pen config
            xp_pen_config = {
                "name": "XP-Pen Deco 640",
                "deviceInfo": {
                    "vendor_id": 0x28BD,
                    "product_id": 0x0042,
                },
            }
            with open(os.path.join(tmpdir, "xp-pen.json"), "w") as f:
                json.dump(xp_pen_config, f)

            # Wacom config
            wacom_config = {
                "name": "Wacom Intuos",
                "deviceInfo": {
                    "vendor_id": 0x056A,
                    "product_id": 0x0357,
                },
            }
            with open(os.path.join(tmpdir, "wacom.json"), "w") as f:
                json.dump(wacom_config, f)

            # Invalid JSON file
            with open(os.path.join(tmpdir, "invalid.json"), "w") as f:
                f.write("not valid json {")

            # Config without deviceInfo
            no_device_config = {"name": "No Device Info"}
            with open(os.path.join(tmpdir, "no-device-info.json"), "w") as f:
                json.dump(no_device_config, f)

            yield tmpdir

    def test_returns_none_for_nonexistent_directory(self):
        """Should return None for non-existent directory."""
        result = find_config_for_device("/non/existent/path")
        assert result is None

    @patch("blankslate.utils.finddevice.hid.enumerate")
    def test_returns_none_when_no_tablet_devices_connected(self, mock_enumerate, config_dir):
        """Should return None when no tablet devices are connected."""
        mock_enumerate.return_value = []
        result = find_config_for_device(config_dir)
        assert result is None

    @patch("blankslate.utils.finddevice.hid.enumerate")
    def test_finds_matching_config_for_xp_pen_device(self, mock_enumerate, config_dir):
        """Should find matching config for connected XP-Pen device."""
        mock_enumerate.return_value = [
            {"vendor_id": 0x28BD, "product_id": 0x0042, "usage_page": 13}
        ]
        result = find_config_for_device(config_dir)
        assert result is not None
        assert result.endswith("xp-pen.json")

    @patch("blankslate.utils.finddevice.hid.enumerate")
    def test_finds_matching_config_for_wacom_device(self, mock_enumerate, config_dir):
        """Should find matching config for connected Wacom device."""
        mock_enumerate.return_value = [
            {"vendor_id": 0x056A, "product_id": 0x0357, "usage_page": 13}
        ]
        result = find_config_for_device(config_dir)
        assert result is not None
        assert result.endswith("wacom.json")

    @patch("blankslate.utils.finddevice.hid.enumerate")
    def test_returns_none_when_no_matching_config(self, mock_enumerate, config_dir):
        """Should return None when connected device has no matching config."""
        mock_enumerate.return_value = [
            {"vendor_id": 0x28BD, "product_id": 0x9999, "usage_page": 13}  # Unknown product
        ]
        result = find_config_for_device(config_dir)
        assert result is None

    @patch("blankslate.utils.finddevice.hid.enumerate")
    def test_filters_devices_by_tablet_vendor_ids(self, mock_enumerate, config_dir):
        """Should filter devices by known tablet vendor IDs."""
        mock_enumerate.return_value = [
            {"vendor_id": 0x1234, "product_id": 0x5678, "usage_page": 1},  # Not a tablet
            {"vendor_id": 0x28BD, "product_id": 0x0042, "usage_page": 1},  # XP-Pen (known vendor)
        ]
        result = find_config_for_device(config_dir)
        assert result is not None
        assert result.endswith("xp-pen.json")

    @patch("blankslate.utils.finddevice.hid.enumerate")
    def test_filters_devices_by_digitizer_usage_page(self, mock_enumerate, config_dir):
        """Should filter devices by digitizer usage page (13)."""
        mock_enumerate.return_value = [
            {"vendor_id": 0x28BD, "product_id": 0x0042, "usage_page": 13}  # Digitizer
        ]
        result = find_config_for_device(config_dir)
        assert result is not None
        assert result.endswith("xp-pen.json")

    def test_handles_empty_config_directory(self):
        """Should return None for empty config directory."""
        with tempfile.TemporaryDirectory() as empty_dir:
            result = find_config_for_device(empty_dir)
            assert result is None

    @patch("blankslate.utils.finddevice.hid.enumerate")
    def test_skips_invalid_json_files_gracefully(self, mock_enumerate, config_dir):
        """Should skip invalid JSON files and still find valid configs."""
        mock_enumerate.return_value = [
            {"vendor_id": 0x28BD, "product_id": 0x0042, "usage_page": 13}
        ]
        # Should still find valid config despite invalid.json existing
        result = find_config_for_device(config_dir)
        assert result is not None
        assert result.endswith("xp-pen.json")

    @patch("blankslate.utils.finddevice.hid.enumerate")
    def test_skips_configs_without_device_info(self, mock_enumerate, config_dir):
        """Should skip configs without deviceInfo."""
        mock_enumerate.return_value = [
            {"vendor_id": 0x1111, "product_id": 0x2222, "usage_page": 13}
        ]
        # no-device-info.json should be skipped, no match found
        result = find_config_for_device(config_dir)
        assert result is None

    @patch("blankslate.utils.finddevice.hid.enumerate")
    def test_accepts_explicit_vendor_and_product_ids(self, mock_enumerate, config_dir):
        """Should accept explicit vendor_id and product_id parameters."""
        # When explicit IDs are provided, should not call enumerate
        result = find_config_for_device(config_dir, vendor_id=0x28BD, product_id=0x0042)
        assert result is not None
        assert result.endswith("xp-pen.json")
        mock_enumerate.assert_not_called()

    @patch("blankslate.utils.finddevice.hid.enumerate")
    def test_explicit_ids_no_match(self, mock_enumerate, config_dir):
        """Should return None when explicit IDs don't match any config."""
        result = find_config_for_device(config_dir, vendor_id=0x9999, product_id=0x9999)
        assert result is None
        mock_enumerate.assert_not_called()
