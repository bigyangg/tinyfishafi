# processors/gemini_helper.py
# Purpose: Shared Gemini API call with Emergent LLM key fallback
# Dependencies: emergentintegrations, google-genai
# Env vars: GEMINI_API_KEY, EMERGENT_LLM_KEY

import os
import logging
import asyncio

logger = logging.getLogger(__name__)


async def call_gemini_async(prompt: str, session_id: str = "classify") -> str:
    """Call Gemini asynchronously with Emergent key fallback. Returns raw text response."""
    emergent_key = os.environ.get("EMERGENT_LLM_KEY", "")
    gemini_key = os.environ.get("GEMINI_API_KEY", "")

    # Try Emergent key first
    if emergent_key:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=emergent_key,
                session_id=session_id,
                system_message="You are an SEC filing analyst. Return only valid JSON.",
            )
            chat.with_model("gemini", "gemini-2.5-flash")
            result = await chat.send_message(UserMessage(text=prompt))
            return result
        except Exception as e:
            logger.warning(f"[GEMINI] Emergent key failed: {e}")

    # Fall back to direct Gemini key
    if gemini_key and not gemini_key.startswith("your-") and not gemini_key.startswith("YOUR_"):
        try:
            from google import genai
            client = genai.Client(api_key=gemini_key)
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"[GEMINI] Direct key failed: {e}")

    return ""


def call_gemini(prompt: str, session_id: str = "classify") -> str:
    """Synchronous wrapper: call Gemini with Emergent key fallback."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're in an async context - create a new thread to run the coroutine
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, call_gemini_async(prompt, session_id))
                return future.result(timeout=30)
        else:
            return loop.run_until_complete(call_gemini_async(prompt, session_id))
    except Exception as e:
        logger.error(f"[GEMINI] Sync wrapper failed: {e}")
        return ""


def has_api_key() -> bool:
    """Check if any Gemini API key is available."""
    emergent_key = os.environ.get("EMERGENT_LLM_KEY", "")
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if emergent_key:
        return True
    if gemini_key and not gemini_key.startswith("your-") and not gemini_key.startswith("YOUR_"):
        return True
    return False
