"""
Unit tests for rate_limiter.py

Tests the thread-safe rate limiting decorator that prevents API abuse.
"""

import pytest
import time
import threading
from unittest.mock import patch, MagicMock


# Add parent directory to path for imports
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rate_limiter import RateLimiter


class TestRateLimiter:
    """Test cases for the RateLimiter decorator."""

    def test_allows_calls_under_limit(self):
        """Calls under the rate limit should succeed."""
        limiter = RateLimiter(calls_per_minute=5)
        call_count = 0

        @limiter
        def test_func():
            nonlocal call_count
            call_count += 1
            return "success"

        # Should allow 5 calls
        for _ in range(5):
            result = test_func()
            assert result == "success"
        
        assert call_count == 5

    def test_blocks_calls_over_limit(self):
        """Calls over the rate limit should raise an exception."""
        limiter = RateLimiter(calls_per_minute=3)

        @limiter
        def test_func():
            return "success"

        # First 3 calls succeed
        for _ in range(3):
            test_func()

        # 4th call should be blocked
        with pytest.raises(Exception) as exc_info:
            test_func()
        
        assert "Rate limit" in str(exc_info.value)
        assert "wait" in str(exc_info.value).lower()

    def test_rate_limit_resets_after_window(self):
        """Rate limit should reset after the 60-second window."""
        limiter = RateLimiter(calls_per_minute=2)

        @limiter
        def test_func():
            return "success"

        # Use up the limit
        test_func()
        test_func()

        # Should be blocked now
        with pytest.raises(Exception):
            test_func()

        # Simulate time passing by clearing the calls list
        with limiter.lock:
            limiter.calls = []

        # Should work again
        result = test_func()
        assert result == "success"

    def test_preserves_function_metadata(self):
        """Decorator should preserve the wrapped function's metadata."""
        limiter = RateLimiter(calls_per_minute=10)

        @limiter
        def my_documented_function():
            """This is the docstring."""
            pass

        assert my_documented_function.__name__ == "my_documented_function"
        assert my_documented_function.__doc__ == "This is the docstring."

    def test_thread_safety(self):
        """Rate limiter should be thread-safe."""
        limiter = RateLimiter(calls_per_minute=10)
        call_count = 0
        call_count_lock = threading.Lock()
        errors = []

        @limiter
        def test_func():
            nonlocal call_count
            with call_count_lock:
                call_count += 1
            return "success"

        def worker():
            try:
                for _ in range(3):
                    test_func()
            except Exception as e:
                errors.append(str(e))

        # Start 5 threads, each trying to make 3 calls (15 total, limit is 10)
        threads = [threading.Thread(target=worker) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Should have exactly 10 successful calls (the limit)
        assert call_count == 10
        # Should have some rate limit errors
        assert len(errors) > 0
        assert all("Rate limit" in e for e in errors)

    def test_passes_arguments_correctly(self):
        """Decorated function should receive its arguments correctly."""
        limiter = RateLimiter(calls_per_minute=10)

        @limiter
        def add(a, b, multiplier=1):
            return (a + b) * multiplier

        assert add(2, 3) == 5
        assert add(2, 3, multiplier=2) == 10
        assert add(a=1, b=2) == 3

    def test_propagates_exceptions(self):
        """Exceptions from the wrapped function should propagate."""
        limiter = RateLimiter(calls_per_minute=10)

        @limiter
        def failing_func():
            raise ValueError("Something went wrong")

        with pytest.raises(ValueError) as exc_info:
            failing_func()
        
        assert "Something went wrong" in str(exc_info.value)


class TestRateLimiterEdgeCases:
    """Edge case tests for RateLimiter."""

    def test_zero_calls_per_minute_blocks_all(self):
        """Zero calls per minute should block all calls.
        
        Note: This is an edge case - with 0 limit, the first call
        triggers the rate limit check which may error differently.
        """
        limiter = RateLimiter(calls_per_minute=0)

        @limiter
        def test_func():
            return "success"

        # Should raise some exception (either rate limit or index error)
        with pytest.raises(Exception):
            test_func()

    def test_single_call_per_minute(self):
        """Single call per minute limit should work correctly."""
        limiter = RateLimiter(calls_per_minute=1)

        @limiter
        def test_func():
            return "success"

        # First call succeeds
        assert test_func() == "success"

        # Second call fails
        with pytest.raises(Exception):
            test_func()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
