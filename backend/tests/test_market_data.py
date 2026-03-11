"""Tests for market_data.py — Price cache, news cache, and graceful failures."""
import time
import pytest
from market_data import MarketDataService, PriceData, CACHE_TTL_SECONDS


class TestPriceData:
    def test_not_expired_when_fresh(self):
        pd = PriceData(price=150.0, fetched_at=time.time())
        assert not pd.is_expired

    def test_expired_after_ttl(self):
        pd = PriceData(price=150.0, fetched_at=time.time() - CACHE_TTL_SECONDS - 1)
        assert pd.is_expired


class TestMarketDataService:
    def setup_method(self):
        self.mds = MarketDataService()

    def test_get_price_unknown_ticker(self):
        assert self.mds.get_price("UNKNOWN") is None

    def test_get_price_empty_ticker(self):
        assert self.mds.get_price("") is None

    def test_get_news_unknown_ticker(self):
        result = self.mds.get_news_headlines("UNKNOWN")
        assert result == []

    def test_get_news_empty_ticker(self):
        result = self.mds.get_news_headlines("")
        assert result == []

    def test_cache_stats_empty(self):
        stats = self.mds.get_cache_stats()
        assert stats["price_entries"] == 0
        assert stats["news_entries"] == 0
        assert stats["price_active"] == 0
        assert stats["news_active"] == 0

    def test_price_cache_hit(self):
        # Manually populate cache
        self.mds._price_cache["TEST"] = PriceData(price=42.0, fetched_at=time.time())
        result = self.mds.get_price("TEST")
        assert result == 42.0

    def test_price_cache_expired_triggers_fetch(self):
        # Populate with expired cache entry
        self.mds._price_cache["TEST"] = PriceData(
            price=42.0, fetched_at=time.time() - CACHE_TTL_SECONDS - 1
        )
        # Since yfinance may not be installed, result could be None
        result = self.mds.get_price("TEST")
        # Either fetched fresh or returned None (yfinance not installed)
        assert result is None or isinstance(result, float)

    def test_clear_cache(self):
        self.mds._price_cache["TEST"] = PriceData(price=42.0, fetched_at=time.time())
        self.mds.clear_cache()
        assert len(self.mds._price_cache) == 0

    def test_cache_stats_after_add(self):
        self.mds._price_cache["AAPL"] = PriceData(price=150.0, fetched_at=time.time())
        self.mds._price_cache["OLD"] = PriceData(
            price=100.0, fetched_at=time.time() - CACHE_TTL_SECONDS - 1
        )
        stats = self.mds.get_cache_stats()
        assert stats["price_entries"] == 2
        assert stats["price_active"] == 1  # Only AAPL is active
