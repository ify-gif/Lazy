"""
Thread-safe rate limiter for API calls.
Prevents excessive API usage and cost overruns.
"""

from functools import wraps
from time import time
import threading


class RateLimiter:
    """
    Thread-safe rate limiter decorator for API calls.

    Usage:
        @RateLimiter(calls_per_minute=10)
        def my_api_function():
            ...

    Raises Exception when rate limit is exceeded with helpful message.
    """

    def __init__(self, calls_per_minute=10):
        """
        Initialize rate limiter.

        Args:
            calls_per_minute: Maximum number of calls allowed per 60-second window
        """
        self.calls_per_minute = calls_per_minute
        self.calls = []  # Timestamps of recent calls
        self.lock = threading.Lock()  # Thread-safe access to calls list

    def __call__(self, func):
        """Decorator implementation"""
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Import logger here to avoid circular dependency
            try:
                from logger_config import logger
            except ImportError:
                logger = None

            with self.lock:
                now = time()

                # Remove calls older than 1 minute
                self.calls = [t for t in self.calls if now - t < 60]

                # Check if rate limit exceeded
                if len(self.calls) >= self.calls_per_minute:
                    wait_time = 60 - (now - self.calls[0])

                    if logger:
                        logger.warning(
                            f"Rate limit reached for {func.__name__}: "
                            f"{len(self.calls)}/{self.calls_per_minute} calls in window. "
                            f"Wait {wait_time:.1f}s"
                        )

                    raise Exception(
                        f"Rate limit: Please wait {int(wait_time) + 1} seconds before trying again. "
                        f"This prevents excessive API costs."
                    )

                # Record this call
                self.calls.append(now)

                if logger:
                    logger.debug(
                        f"Rate limiter for {func.__name__}: "
                        f"{len(self.calls)}/{self.calls_per_minute} calls in window"
                    )

            # Execute the function
            return func(*args, **kwargs)

        return wrapper
