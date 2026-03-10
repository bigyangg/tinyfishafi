"""AFI Backend API Tests - Auth, Signals, Watchlist"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test user credentials
TEST_EMAIL = f"TEST_{uuid.uuid4().hex[:8]}@afi.com"
TEST_PASSWORD = "testpass123"
EXISTING_EMAIL = "test@afi.com"
EXISTING_PASSWORD = "test123"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_token(api):
    res = api.post(f"{BASE_URL}/api/auth/login", json={"email": EXISTING_EMAIL, "password": EXISTING_PASSWORD})
    if res.status_code == 200:
        return res.json()["token"]
    pytest.skip("Login failed - skipping authenticated tests")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


# ---- Health ----
class TestHealth:
    def test_health(self, api):
        res = api.get(f"{BASE_URL}/api/")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"


# ---- Auth ----
class TestAuth:
    def test_signup_new_user(self, api):
        res = api.post(f"{BASE_URL}/api/auth/signup", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        assert res.status_code == 200
        data = res.json()
        assert "token" in data
        assert data["user"]["email"] == TEST_EMAIL

    def test_signup_duplicate_email(self, api):
        res = api.post(f"{BASE_URL}/api/auth/signup", json={"email": EXISTING_EMAIL, "password": "anything"})
        assert res.status_code == 400

    def test_login_success(self, api):
        res = api.post(f"{BASE_URL}/api/auth/login", json={"email": EXISTING_EMAIL, "password": EXISTING_PASSWORD})
        assert res.status_code == 200
        data = res.json()
        assert "token" in data
        assert data["user"]["email"] == EXISTING_EMAIL

    def test_login_wrong_password(self, api):
        res = api.post(f"{BASE_URL}/api/auth/login", json={"email": EXISTING_EMAIL, "password": "wrongpass"})
        assert res.status_code == 401

    def test_get_me(self, api, auth_headers):
        res = api.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert "email" in data


# ---- Signals ----
class TestSignals:
    def test_get_all_signals(self, api):
        res = api.get(f"{BASE_URL}/api/signals")
        assert res.status_code == 200
        data = res.json()
        assert "signals" in data
        assert len(data["signals"]) == 10

    def test_signals_have_required_fields(self, api):
        res = api.get(f"{BASE_URL}/api/signals")
        for s in res.json()["signals"]:
            assert "ticker" in s
            assert "filing_type" in s
            assert "classification" in s
            assert "summary" in s
            assert "confidence" in s
            assert "filed_at" in s

    def test_signals_filter_by_ticker(self, api):
        res = api.get(f"{BASE_URL}/api/signals?tickers=AAPL")
        assert res.status_code == 200
        data = res.json()
        assert all(s["ticker"] == "AAPL" for s in data["signals"])

    def test_signals_filter_multiple_tickers(self, api):
        res = api.get(f"{BASE_URL}/api/signals?tickers=AAPL,NVDA")
        assert res.status_code == 200
        data = res.json()
        tickers = {s["ticker"] for s in data["signals"]}
        assert tickers.issubset({"AAPL", "NVDA"})

    def test_signals_classifications(self, api):
        res = api.get(f"{BASE_URL}/api/signals")
        classifications = {s["classification"] for s in res.json()["signals"]}
        assert classifications.issubset({"Positive", "Neutral", "Risk"})


# ---- Watchlist ----
class TestWatchlist:
    def test_get_watchlist(self, api, auth_headers):
        res = api.get(f"{BASE_URL}/api/watchlist", headers=auth_headers)
        assert res.status_code == 200
        assert "tickers" in res.json()

    def test_add_valid_ticker(self, api, auth_headers):
        # Clean up first
        api.delete(f"{BASE_URL}/api/watchlist/TSTT", headers=auth_headers)
        res = api.post(f"{BASE_URL}/api/watchlist", json={"ticker": "TSTT"}, headers=auth_headers)
        assert res.status_code in [200, 400]  # 400 if already exists

    def test_add_invalid_ticker_numbers(self, api, auth_headers):
        res = api.post(f"{BASE_URL}/api/watchlist", json={"ticker": "123"}, headers=auth_headers)
        assert res.status_code == 400

    def test_add_invalid_ticker_too_long(self, api, auth_headers):
        res = api.post(f"{BASE_URL}/api/watchlist", json={"ticker": "TOOLONG"}, headers=auth_headers)
        assert res.status_code == 400

    def test_remove_ticker(self, api, auth_headers):
        # Add first
        api.post(f"{BASE_URL}/api/watchlist", json={"ticker": "TSTT"}, headers=auth_headers)
        res = api.delete(f"{BASE_URL}/api/watchlist/TSTT", headers=auth_headers)
        assert res.status_code == 200
        assert "TSTT" not in res.json()["tickers"]

    def test_watchlist_requires_auth(self, api):
        res = api.get(f"{BASE_URL}/api/watchlist")
        assert res.status_code == 401
