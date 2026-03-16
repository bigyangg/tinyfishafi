# config/agent_config.py
# Purpose: Reads live config from Supabase agent_config table
# Dependencies: supabase

import logging

logger = logging.getLogger(__name__)


def load_agent_config(supabase_client) -> dict:
    """Load current agent configuration from Supabase."""
    try:
        result = supabase_client.table("agent_config").select("*").limit(1).execute()
        if result.data:
            return result.data[0]
        return {}
    except Exception as e:
        logger.warning(f"[CONFIG] Failed to load config: {e}")
        return {}
