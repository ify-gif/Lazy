"""
Centralized logging configuration for LAZY application.
Creates rotating log files in user's home directory.
"""

import logging
import sys
from pathlib import Path
from logging.handlers import RotatingFileHandler


def setup_logging():
    """
    Initialize rotating file logger + console output.

    Logs are stored in: ~/.lazy/logs/lazy.log
    - File handler: DEBUG level, 10MB max, 5 backups
    - Console handler: INFO level
    - Thread names included for debugging multi-threading issues
    """
    # Create logs directory
    log_dir = Path.home() / ".lazy" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    # Create logger
    logger = logging.getLogger("lazy")
    logger.setLevel(logging.DEBUG)

    # Remove any existing handlers (prevents duplicate logs)
    logger.handlers.clear()

    # File handler (10MB, keep 5 backups)
    file_handler = RotatingFileHandler(
        log_dir / "lazy.log",
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding='utf-8'
    )
    file_handler.setLevel(logging.DEBUG)

    # Console handler (less verbose)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)

    # Formatter with thread info (critical for debugging threading issues)
    formatter = logging.Formatter(
        '%(asctime)s [%(levelname)-8s] [%(threadName)-12s] %(name)s.%(funcName)s:%(lineno)d - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger


# Global logger instance - import this in other modules
logger = setup_logging()

# Log the logger initialization
logger.info("="*60)
logger.info("LAZY Logger initialized")
logger.info(f"Log file location: {Path.home() / '.lazy' / 'logs' / 'lazy.log'}")
logger.info("="*60)
