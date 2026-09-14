# Competitor Tracking

**Turn your competitors' LinkedIn activity into structured, searchable intelligence — automatically, and without paying for another SaaS subscription.**

Sales and marketing teams already know their competitors are active on LinkedIn — new product launches, client wins, hiring sprees, awards. What they don't have is a system of record for it. Competitor Tracking closes that gap directly inside ERPNext: point it at a competitor's LinkedIn page once, and it keeps a running, categorized, dated log of everything they post — tied to the same CRM data you already use for clients and opportunities.

No manual screenshotting. No spreadsheet nobody updates. No paid intelligence tool.

## Why teams use it

- **Never miss a competitor move.** New products, partnerships, hires, and wins get logged the day they're posted — not whenever someone remembers to check.
- **It's not just a feed — it's structured data.** Every post is timestamped, linked to its competitor, and automatically categorized, so you can filter, report, and search instead of scrolling.
- **AI classification, at zero marginal cost.** Posts are labeled by an open-source LLM running locally — no per-post API bill, no data leaving your infrastructure.
- **It lives where your sales data already lives.** Competitor activity sits next to your Customers and Opportunities in ERPNext, not in a disconnected tool your team has to remember to open.

## Features

**Competitor Intelligence**
- Extends ERPNext's core `Competitor` doctype with a LinkedIn Company URL, tracking metadata, and file attachments — no separate master data to maintain
- `Competitor Log` keeps a dated, auditable history per competitor, linked to the relevant Client where applicable

**Automated LinkedIn Monitoring**
- Scheduled daily scraping of each tracked competitor's LinkedIn posts — fully automatic once configured
- One-click **"Scrape LinkedIn Posts Now"** for on-demand checks between scheduled runs
- Captures post text, publish date, reactions, comments, reposts, and media links
- Automatic de-duplication — re-scraping never creates duplicate entries
- Cookie-based authentication supported, so scraping reuses a session you already trust rather than risking a flagged login attempt

**Free AI Post Classification**
- Every new post is automatically labeled — New Client, Publicity & Marketing, New Technology, New Discovery, Partnership & Collaboration, Hiring & Team Growth, Award & Recognition, Event & Conference, CSR & Community, Employee Appreciation, or Other
- Powered by a free, open-source local LLM (via Ollama) — **no API key, no per-request cost, no third-party data sharing**
- Every label is a plain editable field — override the AI's call in one click if needed

**Competitor Dashboard**
- A dedicated visual dashboard: filter by competitor, see post volume and engagement trends over time, a category breakdown, and a searchable table of recent posts
- Built for at-a-glance reporting — the view your team actually opens on a Monday morning

## How it works

1. Add a competitor's LinkedIn Company URL to their `Competitor` record.
2. Configure `LinkedIn Scraper Settings` once (authentication + enable the scheduler).
3. Posts are scraped daily (or on demand), classified automatically, and logged to `Competitor Log`.
4. Review everything — trends, categories, individual posts — on the Competitor Dashboard.

## Requirements

- Frappe / ERPNext v15+
- [Playwright](https://playwright.dev/) with the Chromium browser installed (`playwright install --with-deps chromium`) — used for LinkedIn scraping
- *(Optional, for AI classification)* [Ollama](https://ollama.com/) running locally or on a reachable host, with a pulled model (e.g. `qwen2.5:3b`) — classification is skipped gracefully if unavailable, scraping is unaffected

## Installation

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app https://github.com/OsamaASidd/Competitor-Tracking.git
bench --site <site-name> install-app competitor_tracking
```

Then set up the Chromium browser Playwright needs for scraping:

```bash
$PATH_TO_YOUR_BENCH/env/bin/playwright install --with-deps chromium
```

## Configuration

1. Open **LinkedIn Scraper Settings**.
2. Choose an authentication method:
   - **Cookie (recommended):** log into LinkedIn normally in your own browser, copy the `li_at` cookie value (DevTools → Application → Cookies), and paste it in. This reuses a session LinkedIn already trusts.
   - **Email & Password:** simpler, but more likely to trigger LinkedIn's login security checkpoint from a server IP.
3. *(Optional)* Turn on AI classification and point it at your Ollama host/model.
4. Tick **Enabled** and save.
5. Add a **LinkedIn Company URL** to any `Competitor` record, then click **Scrape LinkedIn Posts Now** — or wait for the next scheduled run.

## A note on Terms of Service

Automated scraping of LinkedIn is against LinkedIn's Terms of Service. Using an account for this purpose carries a real risk of that account being rate-limited or restricted. Use an account you're comfortable accepting that risk on — not your primary personal or company account — and use this feature at your own discretion.

## License

MIT
