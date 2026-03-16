# email_service.py
# Purpose: Send per-signal alerts and morning brief via Resend
# Dependencies: resend
# Env vars: RESEND_API_KEY, RESEND_FROM_EMAIL, EMAIL_ENABLED

import os
import logging

logger = logging.getLogger(__name__)


def _get_resend():
    """Lazy import and configure resend."""
    api_key = os.getenv("RESEND_API_KEY", "")
    if not api_key:
        return None
    import resend
    resend.api_key = api_key
    return resend


def send_signal_alert(signal: dict, to_email: str = None) -> bool:
    """Send email alert for a new enriched signal."""
    resend = _get_resend()
    if not resend:
        logger.info("[EMAIL] RESEND_API_KEY not configured, skipping email")
        return False

    if not to_email:
        to_email = os.getenv("DIGEST_EMAIL", "")
    if not to_email:
        return False

    try:
        ticker = signal.get("ticker", "")
        sig = signal.get("signal", "")
        conf = signal.get("confidence", 0)
        summary = signal.get("summary", "")

        subject = f"[{ticker}] {sig} Filing Alert — {conf}% confidence"
        html = build_signal_email_html(signal)

        from_email = os.getenv("RESEND_FROM_EMAIL", "alerts@afi.dev")

        resend.Emails.send({
            "from": f"AFI <{from_email}>",
            "to": [to_email],
            "subject": subject,
            "html": html,
        })
        logger.info(f"[EMAIL] Alert sent for {ticker} to {to_email}")
        return True

    except Exception as e:
        logger.error(f"[EMAIL] Failed to send alert: {e}")
        return False


def build_signal_email_html(signal: dict) -> str:
    """Dark-themed email matching AFI design system."""
    ticker = signal.get("ticker", "?")
    sig = signal.get("signal", "Neutral")
    conf = signal.get("confidence", 0)
    summary = signal.get("summary", "")
    filing_type = signal.get("filing_type", "8-K")
    event_type = (signal.get("event_type") or "").replace("_", " ")
    impact = signal.get("impact_score", 0)

    sig_color = "#00C805" if sig == "Positive" else "#FF3333" if sig == "Risk" else "#71717A"

    # Divergence section
    divergence_html = ""
    div_score = signal.get("divergence_score", 0)
    if div_score and int(div_score) > 60:
        div_color = "#FF3333" if int(div_score) > 80 else "#F59E0B"
        div_summary = signal.get("contradiction_summary", "")
        divergence_html = f"""
        <div style="background:#1a0000;border:1px solid {div_color}40;border-left:3px solid {div_color};padding:12px;margin:12px 0;">
            <div style="font-family:monospace;font-size:11px;color:{div_color};font-weight:700;margin-bottom:4px;">
                DIVERGENCE {div_score}/100 {'— CRITICAL' if int(div_score) > 80 else ''}
            </div>
            <div style="font-size:11px;color:#888;">{div_summary}</div>
        </div>"""

    # Genome section
    genome_html = ""
    if signal.get("genome_alert"):
        genome_html = f"""
        <div style="background:#0a0a1a;border:1px solid #0066FF40;border-left:3px solid #0066FF;padding:12px;margin:12px 0;">
            <div style="font-family:monospace;font-size:11px;color:#0066FF;font-weight:700;">GENOME ALERT</div>
        </div>"""

    # Insider section
    insider_html = ""
    insider_30d = signal.get("insider_net_30d", 0)
    if insider_30d:
        insider_color = "#00C805" if float(insider_30d) > 0 else "#FF3333"
        insider_html = f'<span style="color:{insider_color};font-family:monospace;font-size:11px;">Insider 30d: ${float(insider_30d):,.0f}</span>'

    return f"""
    <div style="background:#050505;color:#fff;padding:32px;font-family:Inter,sans-serif;max-width:600px;margin:0 auto;">
        <div style="font-family:monospace;font-size:10px;color:#333;letter-spacing:0.1em;margin-bottom:20px;">AFI SIGNAL ALERT</div>

        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <span style="font-family:monospace;font-size:24px;font-weight:700;color:#fff;">{ticker}</span>
            <span style="font-size:10px;color:#555;background:#0a0a0a;border:1px solid #1a1a1a;padding:2px 8px;">{filing_type}</span>
        </div>

        <div style="margin-bottom:16px;">
            <span style="color:{sig_color};font-weight:700;font-size:14px;">{sig}</span>
            <span style="color:#444;font-family:monospace;font-size:12px;margin-left:8px;">{conf}% confidence</span>
            {f'<span style="color:#555;font-family:monospace;font-size:11px;margin-left:12px;">Impact: {impact}/100</span>' if impact else ''}
        </div>

        {f'<div style="font-size:10px;color:#0066FF;margin-bottom:8px;">{event_type}</div>' if event_type else ''}

        <div style="background:#0a0a0a;border:1px solid #1a1a1a;padding:16px;margin-bottom:16px;">
            <p style="margin:0;font-size:13px;color:#aaa;line-height:1.6;">{summary}</p>
        </div>

        {divergence_html}
        {genome_html}

        <div style="margin:16px 0;font-size:11px;color:#444;">
            {insider_html}
        </div>

        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #111;">
            <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={ticker}&type=8-K&count=5"
               style="font-family:monospace;font-size:11px;color:#0066FF;text-decoration:none;">
                VIEW ON SEC EDGAR →
            </a>
        </div>
    </div>"""
