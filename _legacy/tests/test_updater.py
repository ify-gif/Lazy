"""
Unit tests for updater.py

Tests the version comparison and update checking logic.
"""

import pytest
from unittest.mock import patch, MagicMock
import requests

# Add parent directory to path for imports
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from updater import parse_version, check_for_update


class TestParseVersion:
    """Test cases for version string parsing."""

    def test_standard_version(self):
        """Standard version strings should parse correctly."""
        assert parse_version("1.2.3") == (1, 2, 3)
        assert parse_version("0.0.1") == (0, 0, 1)
        assert parse_version("10.20.30") == (10, 20, 30)

    def test_version_with_v_prefix(self):
        """Version strings with 'v' prefix should parse correctly."""
        assert parse_version("v1.2.3") == (1, 2, 3)
        assert parse_version("v0.0.1") == (0, 0, 1)

    def test_invalid_version_returns_zeros(self):
        """Invalid version strings should return (0, 0, 0)."""
        assert parse_version("invalid") == (0, 0, 0)
        assert parse_version("") == (0, 0, 0)
        assert parse_version("abc.def.ghi") == (0, 0, 0)

    def test_partial_version(self):
        """Partial version strings return variable-length tuples.
        
        The implementation splits on '.' and converts each part,
        so '1.2' returns (1, 2) - a 2-tuple, not a 3-tuple.
        """
        assert parse_version("1.2") == (1, 2)  # Returns 2-tuple
        assert parse_version("1") == (1,)  # Returns 1-tuple

    def test_version_comparison(self):
        """Parsed versions should compare correctly."""
        assert parse_version("2.0.0") > parse_version("1.9.9")
        assert parse_version("1.0.1") > parse_version("1.0.0")
        assert parse_version("1.10.0") > parse_version("1.9.0")
        assert parse_version("1.0.0") == parse_version("v1.0.0")


class TestCheckForUpdate:
    """Test cases for the update checking function."""

    @patch('updater.requests.get')
    @patch('updater.__version__', '1.0.0')
    def test_update_available(self, mock_get):
        """Should detect when a newer version is available."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"tag_name": "v1.1.0"}
        mock_get.return_value = mock_response

        result = check_for_update()

        assert result["update_available"] is True
        assert result["latest_version"] == "1.1.0"
        assert "download_url" in result

    @patch('updater.requests.get')
    @patch('updater.__version__', '1.2.0')
    def test_no_update_when_current(self, mock_get):
        """Should report no update when on latest version."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"tag_name": "v1.2.0"}
        mock_get.return_value = mock_response

        result = check_for_update()

        assert result["update_available"] is False
        assert result["latest_version"] == "1.2.0"

    @patch('updater.requests.get')
    @patch('updater.__version__', '2.0.0')
    def test_no_update_when_ahead(self, mock_get):
        """Should report no update when running a newer version."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"tag_name": "v1.9.9"}
        mock_get.return_value = mock_response

        result = check_for_update()

        assert result["update_available"] is False

    @patch('updater.requests.get')
    @patch('updater.__version__', '1.0.0')
    def test_handles_api_error(self, mock_get):
        """Should handle GitHub API errors gracefully."""
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response

        result = check_for_update()

        assert result["update_available"] is False
        assert result["latest_version"] == "1.0.0"  # Returns current version

    @patch('updater.requests.get')
    @patch('updater.__version__', '1.0.0')
    def test_handles_timeout(self, mock_get):
        """Should handle network timeouts gracefully."""
        mock_get.side_effect = requests.Timeout()

        result = check_for_update()

        assert result["update_available"] is False
        assert result["download_url"] == ""

    @patch('updater.requests.get')
    @patch('updater.__version__', '1.0.0')
    def test_handles_connection_error(self, mock_get):
        """Should handle connection errors gracefully."""
        mock_get.side_effect = requests.ConnectionError()

        result = check_for_update()

        assert result["update_available"] is False

    @patch('updater.requests.get')
    @patch('updater.__version__', '1.0.0')
    def test_handles_malformed_response(self, mock_get):
        """Should handle malformed API responses gracefully."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}  # Missing tag_name
        mock_get.return_value = mock_response

        result = check_for_update()

        # Should not crash, and should indicate no update
        assert result["update_available"] is False


class TestVersionComparisons:
    """Test version comparison edge cases."""

    def test_major_version_increment(self):
        """Major version increments should be detected."""
        assert parse_version("2.0.0") > parse_version("1.9.9")

    def test_minor_version_increment(self):
        """Minor version increments should be detected."""
        assert parse_version("1.2.0") > parse_version("1.1.99")

    def test_patch_version_increment(self):
        """Patch version increments should be detected."""
        assert parse_version("1.0.2") > parse_version("1.0.1")

    def test_double_digit_versions(self):
        """Double-digit version numbers should compare correctly."""
        assert parse_version("1.10.0") > parse_version("1.9.0")
        assert parse_version("1.0.10") > parse_version("1.0.9")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
