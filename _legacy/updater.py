import os
import requests
from version import __version__
from logger_config import logger

GITHUB_OWNER = "ify-gif"
GITHUB_REPO = "Lazy"
RELEASES_URL = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest"
DOWNLOAD_URL = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest"


def parse_version(version_str: str) -> tuple:
    """Convert '1.2.5' -> (1, 2, 5) for comparison."""
    cleaned = version_str.lstrip("v")
    try:
        return tuple(int(x) for x in cleaned.split("."))
    except ValueError:
        return (0, 0, 0)


def check_for_update() -> dict:
    """
    Hit GitHub API, compare versions.
    Returns:
        { "update_available": bool, "latest_version": str, "download_url": str }
    """
    try:
        logger.info(f"Checking for updates (current: v{__version__})")
        headers = {"Accept": "application/vnd.github.v3+json"}
        token = os.getenv("GITHUB_TOKEN")
        if token:
            headers["Authorization"] = f"token {token}"
        response = requests.get(RELEASES_URL, timeout=5, headers=headers)

        if response.status_code != 200:
            logger.warning(f"GitHub API returned {response.status_code}")
            return {"update_available": False, "latest_version": __version__, "download_url": ""}

        data = response.json()
        latest_tag = data.get("tag_name", "")
        latest_version = latest_tag.lstrip("v")

        logger.info(f"Latest release on GitHub: {latest_tag}")

        if parse_version(latest_version) > parse_version(__version__):
            logger.info(f"Update available: v{__version__} -> v{latest_version}")
            return {
                "update_available": True,
                "latest_version": latest_version,
                "download_url": DOWNLOAD_URL
            }

        logger.info("App is up to date")
        return {"update_available": False, "latest_version": latest_version, "download_url": ""}

    except requests.Timeout:
        logger.warning("Update check timed out")
        return {"update_available": False, "latest_version": __version__, "download_url": ""}
    except Exception as e:
        logger.warning(f"Update check failed: {e}")
        return {"update_available": False, "latest_version": __version__, "download_url": ""}
