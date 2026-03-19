# AFI Backend Engineer Memory Index

## Project

- [project_phase10_upgrade.md](project_phase10_upgrade.md) — Phase 10 reliability changes: EDGAR connectivity check, 3-step CIK fallback, dead-letter queue, dynamic poll interval, content hash dedup
- [project_extraction_strategy.md](project_extraction_strategy.md) — Form-specific extraction strategy: 10-K/10-Q skip TinyFish and use SEC XBRL APIs (~3s vs 685s+)
- [project_known_failure_modes.md](project_known_failure_modes.md) — Production bugs confirmed 2026-03-19: EFTS q=* zero-result bug, deprecated Gemini models (1.5-pro/2.5-flash), TinyFish LLM guard on sec.gov, Atom feed XML parse format
