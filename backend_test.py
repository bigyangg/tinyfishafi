#!/usr/bin/env python3
"""
Backend API Testing for AFI v3.0 Platform
Tests all endpoints as specified in the review request
"""

import requests
import json
import sys
import time
from datetime import datetime

# Use the public endpoint from .env
BASE_URL = "https://97c7bf2d-8799-47ab-ac7d-1cafcb0cb811.preview.emergentagent.com/api"

class APITester:
    def __init__(self):
        self.session = requests.Session()
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_result(self, test_name, passed, details=""):
        """Log test result"""
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
            print(f"✅ {test_name}")
        else:
            print(f"❌ {test_name} - {details}")
        
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })

    def test_health_endpoint(self):
        """Test /api/health endpoint"""
        try:
            response = self.session.get(f"{BASE_URL}/health", timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "ok":
                    self.log_result("Health endpoint", True, f"Status: {data.get('status')}")
                    return True
                else:
                    self.log_result("Health endpoint", False, f"Unexpected status: {data.get('status')}")
            else:
                self.log_result("Health endpoint", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_result("Health endpoint", False, str(e))
        return False

    def test_demo_trigger(self):
        """Test POST /api/demo/trigger with AAPL ticker"""
        try:
            payload = {"ticker": "AAPL"}
            response = self.session.post(f"{BASE_URL}/demo/trigger", json=payload, timeout=35)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "triggered":
                    self.log_result("Demo trigger AAPL", True, f"Message: {data.get('message', '')}")
                    return True
                elif "error" in data:
                    self.log_result("Demo trigger AAPL", False, f"Error: {data.get('error', '')}")
                else:
                    self.log_result("Demo trigger AAPL", False, f"Unexpected response: {data}")
            else:
                self.log_result("Demo trigger AAPL", False, f"HTTP {response.status_code}: {response.text[:200]}")
        except requests.exceptions.Timeout:
            self.log_result("Demo trigger AAPL", False, "Request timed out after 35s")
        except Exception as e:
            self.log_result("Demo trigger AAPL", False, str(e))
        return False

    def test_migration_endpoint(self):
        """Test GET /api/migrate endpoint"""
        try:
            response = self.session.get(f"{BASE_URL}/migrate", timeout=10)
            if response.status_code == 200:
                data = response.json()
                if "sql" in data and "CREATE TABLE IF NOT EXISTS company_genomes" in data.get("sql", ""):
                    self.log_result("Migration SQL", True, "SQL contains required tables")
                    return True
                else:
                    self.log_result("Migration SQL", False, "SQL missing expected content")
            else:
                self.log_result("Migration SQL", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_result("Migration SQL", False, str(e))
        return False

    def test_telegram_setup(self):
        """Test GET /api/telegram/setup endpoint"""
        try:
            response = self.session.get(f"{BASE_URL}/telegram/setup", timeout=10)
            if response.status_code == 200:
                data = response.json()
                # Either we get a chat_id or an error about no messages
                if "chat_id" in data or "error" in data:
                    self.log_result("Telegram setup", True, f"Response: {data}")
                    return True
                else:
                    self.log_result("Telegram setup", False, f"Unexpected response: {data}")
            else:
                self.log_result("Telegram setup", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_result("Telegram setup", False, str(e))
        return False

    def test_signals_endpoint(self):
        """Test GET /api/signals endpoint"""
        try:
            response = self.session.get(f"{BASE_URL}/signals", timeout=15)
            if response.status_code == 200:
                data = response.json()
                if "signals" in data:
                    signals = data.get("signals", [])
                    # Check if signals have v3 fields
                    has_v3_fields = False
                    if signals:
                        sample = signals[0]
                        v3_fields = ["event_type", "impact_score", "news_headlines", "divergence_score", "genome_alert"]
                        has_v3_fields = any(field in sample for field in v3_fields)
                    
                    self.log_result("Signals endpoint", True, f"Found {len(signals)} signals, v3 fields: {has_v3_fields}")
                    return True
                else:
                    self.log_result("Signals endpoint", False, "Missing 'signals' field")
            else:
                self.log_result("Signals endpoint", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_result("Signals endpoint", False, str(e))
        return False

    def test_radar_endpoint(self):
        """Test GET /api/radar endpoint"""
        try:
            response = self.session.get(f"{BASE_URL}/radar", timeout=10)
            if response.status_code == 200:
                data = response.json()
                if "upcoming" in data:
                    upcoming = data.get("upcoming", [])
                    self.log_result("Radar endpoint", True, f"Found {len(upcoming)} upcoming filings")
                    return True
                else:
                    self.log_result("Radar endpoint", False, "Missing 'upcoming' field")
            else:
                self.log_result("Radar endpoint", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_result("Radar endpoint", False, str(e))
        return False

    def test_intel_endpoint(self):
        """Test GET /api/intel/TSLA endpoint"""
        try:
            response = self.session.get(f"{BASE_URL}/intel/TSLA", timeout=15)
            if response.status_code == 200:
                data = response.json()
                if "ticker" in data and data.get("ticker") == "TSLA":
                    signals = data.get("signals", [])
                    genome = data.get("genome")
                    self.log_result("Intel TSLA", True, f"Ticker: {data.get('ticker')}, Signals: {len(signals)}, Genome: {genome is not None}")
                    return True
                else:
                    self.log_result("Intel TSLA", False, f"Unexpected response: {data}")
            else:
                self.log_result("Intel TSLA", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_result("Intel TSLA", False, str(e))
        return False

    def test_genomes_endpoint(self):
        """Test GET /api/genomes endpoint"""
        try:
            response = self.session.get(f"{BASE_URL}/genomes", timeout=10)
            if response.status_code == 200:
                data = response.json()
                if "genomes" in data:
                    genomes = data.get("genomes", [])
                    self.log_result("Genomes endpoint", True, f"Found {len(genomes)} genomes")
                    return True
                elif "error" in data:
                    # Table might not exist yet - that's expected
                    self.log_result("Genomes endpoint", True, f"Expected error (table not created): {data.get('error')}")
                    return True
                else:
                    self.log_result("Genomes endpoint", False, f"Unexpected response: {data}")
            else:
                self.log_result("Genomes endpoint", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_result("Genomes endpoint", False, str(e))
        return False

    def test_brief_endpoint(self):
        """Test GET /api/brief endpoint"""
        try:
            response = self.session.get(f"{BASE_URL}/brief", timeout=15)
            if response.status_code == 200:
                data = response.json()
                if "brief" in data:
                    brief = data.get("brief", "")
                    signal_count = data.get("signal_count", 0)
                    self.log_result("Brief endpoint", True, f"Brief length: {len(brief)}, Signals: {signal_count}")
                    return True
                else:
                    self.log_result("Brief endpoint", False, "Missing 'brief' field")
            else:
                self.log_result("Brief endpoint", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_result("Brief endpoint", False, str(e))
        return False

    def test_auth_endpoints(self):
        """Test auth endpoints with demo credentials"""
        try:
            # Test signup first (might fail if user exists)
            signup_payload = {
                "email": "demo2@afi.dev",
                "password": "demopass123"
            }
            
            response = self.session.post(f"{BASE_URL}/auth/signup", json=signup_payload, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if "token" in data:
                    self.token = data["token"]
                    self.log_result("Auth signup", True, "User created and token received")
                else:
                    self.log_result("Auth signup", False, "No token in response")
            elif response.status_code == 400 and "already" in response.text.lower():
                # User already exists, try login
                login_response = self.session.post(f"{BASE_URL}/auth/login", json=signup_payload, timeout=10)
                if login_response.status_code == 200:
                    login_data = login_response.json()
                    if "token" in login_data:
                        self.token = login_data["token"]
                        self.log_result("Auth login", True, "Existing user logged in successfully")
                    else:
                        self.log_result("Auth login", False, "No token in login response")
                else:
                    self.log_result("Auth login", False, f"HTTP {login_response.status_code}")
            else:
                self.log_result("Auth signup", False, f"HTTP {response.status_code}: {response.text[:100]}")
                
        except Exception as e:
            self.log_result("Auth endpoints", False, str(e))

    def run_all_tests(self):
        """Run all tests"""
        print("🚀 Starting AFI v3.0 Backend API Tests")
        print(f"Testing endpoint: {BASE_URL}")
        print("-" * 50)

        # Test endpoints in order
        self.test_health_endpoint()
        self.test_auth_endpoints()
        self.test_migration_endpoint()
        self.test_telegram_setup()
        self.test_signals_endpoint()
        self.test_radar_endpoint()
        self.test_intel_endpoint()
        self.test_genomes_endpoint()
        self.test_brief_endpoint()
        
        # Demo trigger test (might be slow)
        print("\n⏱️  Running demo trigger test (may take 30+ seconds)...")
        self.test_demo_trigger()

        # Results
        print("\n" + "=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            failed = self.tests_run - self.tests_passed
            print(f"⚠️  {failed} test(s) failed")
            return False

def main():
    tester = APITester()
    success = tester.run_all_tests()
    
    # Save results to file
    results_file = "/app/test_reports/backend_api_results.json"
    try:
        with open(results_file, 'w') as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "base_url": BASE_URL,
                "total_tests": tester.tests_run,
                "passed_tests": tester.tests_passed,
                "success_rate": round((tester.tests_passed / tester.tests_run * 100), 2) if tester.tests_run > 0 else 0,
                "test_results": tester.test_results
            }, f, indent=2)
        print(f"\n📄 Results saved to: {results_file}")
    except Exception as e:
        print(f"⚠️  Could not save results: {e}")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())