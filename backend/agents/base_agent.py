# base_agent.py
# Purpose: Base class for all TinyFish agents — timeout, retry, graceful failure
# Dependencies: httpx, asyncio
# Env vars: TINYFISH_API_KEY

import asyncio
import logging
import time
import os
import json
from abc import ABC, abstractmethod

import httpx

logger = logging.getLogger(__name__)

TINYFISH_SSE_URL = "https://agent.tinyfish.ai/v1/automation/run-sse"


class BaseAgent(ABC):
    name = "base"
    timeout_seconds = 12

    async def execute(self, **kwargs) -> dict:
        """Call this — wraps run() with timeout + error handling. Never raises."""
        start = time.time()
        logger.info(f"[AGENT {self.name}] Started")
        try:
            result = await asyncio.wait_for(self.run(**kwargs), timeout=self.timeout_seconds)
            ms = int((time.time() - start) * 1000)
            logger.info(f"[AGENT {self.name}] Completed in {ms}ms")
            return result or {}
        except asyncio.TimeoutError:
            logger.warning(f"[AGENT {self.name}] Timeout after {self.timeout_seconds}s")
            return {}
        except Exception as e:
            logger.error(f"[AGENT {self.name}] Failed: {e}", exc_info=True)
            return {}

    @abstractmethod
    async def run(self, **kwargs) -> dict:
        """Override in each agent subclass."""
        pass

    async def call_tinyfish(self, task: str, url: str) -> dict:
        """Make a TinyFish SSE API call. Returns parsed JSON or empty dict."""
        api_key = os.getenv("TINYFISH_API_KEY", "")
        if not api_key:
            logger.warning(f"[AGENT {self.name}] TINYFISH_API_KEY not set")
            return {}

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds + 5) as client:
                async with client.stream(
                    "POST",
                    TINYFISH_SSE_URL,
                    headers={
                        "X-API-Key": api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "url": url,
                        "goal": task,
                        "browser_profile": "stealth",
                    },
                    timeout=self.timeout_seconds + 5,
                ) as resp:
                    if resp.status_code != 200:
                        logger.warning(f"[AGENT {self.name}] TinyFish HTTP {resp.status_code}")
                        return {}

                    result_data = {}
                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if not raw:
                            continue
                        try:
                            event = json.loads(raw)
                            if event.get("type") == "PROGRESS":
                                logger.debug(f"[AGENT {self.name}] {event.get('message', '')}")
                            elif event.get("type") == "COMPLETE" and event.get("status") == "COMPLETED":
                                res = event.get("resultJson") or event.get("result", "")
                                result_data = self._parse_tinyfish_result(res)
                                break
                            elif event.get("type") == "ERROR":
                                logger.warning(f"[AGENT {self.name}] TinyFish error: {event.get('message')}")
                                break
                        except json.JSONDecodeError:
                            continue

                    return result_data

        except Exception as e:
            logger.warning(f"[AGENT {self.name}] TinyFish call failed: {e}")
            return {}

    def _parse_tinyfish_result(self, res) -> dict:
        """Parse TinyFish result into a dict."""
        if isinstance(res, dict):
            return res
        if isinstance(res, str):
            # Strip markdown fences
            text = res.strip()
            if text.startswith("```"):
                parts = text.split("```")
                if len(parts) >= 2:
                    text = parts[1]
                    if text.startswith("json"):
                        text = text[4:]
                    text = text.strip()
            try:
                return json.loads(text)
            except (json.JSONDecodeError, ValueError):
                return {"raw_text": text}
        return {}
