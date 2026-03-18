# processors/gemini_helper.py
# Purpose: Shared Gemini API call with Emergent LLM key fallback
# Dependencies: emergentintegrations, google-genai
# Env vars: GEMINI_API_KEY, EMERGENT_LLM_KEY

import os
import logging
import asyncio

logger = logging.getLogger(__name__)


async def call_gemini_async(prompt: str, session_id: str = "classify", response_schema: dict = None) -> str:
    """Call Gemini asynchronously with Emergent key fallback. Returns raw text response.

    Args:
        prompt: The prompt text to send to Gemini.
        session_id: Session identifier for Emergent integration.
        response_schema: Optional JSON schema dict to enforce structured output via
                         Gemini's response_mime_type="application/json" mode.
    """
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

    # Fall back to direct Gemini key with optional structured output and retry
    if gemini_key and not gemini_key.startswith("your-") and not gemini_key.startswith("YOUR_"):
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=gemini_key)

        # Build generation config with structured JSON output when schema provided
        gen_config = None
        if response_schema:
            gen_config = types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=response_schema,
            )

        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=prompt,
                    config=gen_config,
                )
                return response.text.strip()
            except Exception as e:
                err_str = str(e).lower()
                if "429" in str(e) or "quota" in err_str or "rate" in err_str:
                    wait = 2 ** attempt
                    logger.warning(f"[GEMINI] Rate limited (attempt {attempt+1}/{max_retries}), waiting {wait}s")
                    await asyncio.sleep(wait)
                elif attempt == max_retries - 1:
                    logger.error(f"[GEMINI] Direct key failed after {max_retries} attempts: {e}")
                else:
                    logger.warning(f"[GEMINI] Attempt {attempt+1} failed: {e}, retrying...")
                    await asyncio.sleep(1)

    return ""


def call_gemini(prompt: str, session_id: str = "classify", response_schema: dict = None) -> str:
    """Synchronous wrapper: call Gemini with Emergent key fallback.

    Args:
        prompt: The prompt text to send to Gemini.
        session_id: Session identifier for Emergent integration.
        response_schema: Optional JSON schema dict to enforce structured output.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're in an async context - create a new thread to run the coroutine
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, call_gemini_async(prompt, session_id, response_schema))
                return future.result(timeout=30)
        else:
            return loop.run_until_complete(call_gemini_async(prompt, session_id, response_schema))
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
