# Provenance — ru-market-analyst

Vendored third-party Claude Code skill bundle for Russian securities-market
portfolio analysis (bonds/equity): broker-report parsing, live MOEX/CBR/cbonds
data, risk baskets, duration, Monte-Carlo risk (VaR/CVaR), strategy and taxes
(ИИС/ЛДВ).

## Source

- Upstream: https://github.com/TimurTsedik/ru-market-analyst
- Commit vendored: `17f68ae99cfe8cc1d3580b950fd4afcca7256879`
- Vendored on: 2026-07-13
- License: MIT (see `LICENSE`, retained unchanged)

## Changes made when vendoring

The skill content (all `SKILL.md`, `references/`, and Python under
`risk-strategy/quant/`) is **unmodified** from upstream, except:

1. **Pinned dependency versions.**
   - `risk-strategy/quant/requirements.txt`: `>=` ranges replaced with exact
     `==` pins, resolved and verified on Python 3.11.
   - `broker-parse/requirements.txt`: **added** (upstream installs `pypdf`/`xlrd`
     ad-hoc); now pinned for reproducibility.
2. Removed build artifacts not part of the skill: `__pycache__/`, `*.pyc`,
   `.pytest_cache/`, local virtualenvs.

Resolved & pinned versions:

| Tier | Package | Pinned |
|---|---|---|
| quant | numpy | 2.4.6 |
| quant | scipy | 1.17.1 |
| quant | pandas | 3.0.3 |
| quant | requests | 2.34.2 |
| quant | pytest | 9.1.1 |
| broker-parse | pypdf | 6.14.2 |
| broker-parse | xlrd | 2.0.2 |
| broker-parse | pdfplumber | 0.11.10 |

Verification: `python -m pytest risk-strategy/quant/selftests` → **30 passed**
on the pinned set.

## Security review summary (as vendored)

Full read-through of every `SKILL.md` and every Python module was done before
vendoring. Findings:

- No shell exfiltration, no `subprocess`/`os.system`/`eval`/`exec`, no
  credential or env-var access anywhere in the Python.
- The **only** network call in the whole codebase is `risk-strategy/quant/data.py`,
  an outbound **GET** of the public MOEX ISS / CBR yield curve (read-only, no
  auth, no data upload).
- Broker reports are parsed **locally** (`pypdf`/`xlrd`); account numbers are
  masked; no broker logins stored.

Residual (non-code) considerations: upstream is new and lightly reviewed by the
community; and, in a cloud session, portfolio contents pass through the LLM
agent. Install/run in an isolated environment and feed only data you're
comfortable processing.

## How to activate

These folders are Claude Code skills. To use them, copy each top-level folder
into `~/.claude/skills/` (as sibling folders), e.g.:

```
~/.claude/skills/ru-market-analyst
~/.claude/skills/broker-parse
~/.claude/skills/cbonds-research
~/.claude/skills/market-data
~/.claude/skills/risk-strategy
~/.claude/skills/portfolio-kb
~/.claude/skills/ru-market-shared
```

Then set up the tier venvs from the pinned requirements:

```bash
# quant tier
python3 -m venv risk-strategy/quant/.venv-quant
risk-strategy/quant/.venv-quant/bin/pip install -r risk-strategy/quant/requirements.txt

# broker-parse tier
python3 -m venv broker-parse/.venv-parse
broker-parse/.venv-parse/bin/pip install -r broker-parse/requirements.txt
```
