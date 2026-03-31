<img src="https://static.nitlix.com/github/gazbot1.gif" alt="GazBot" style="width: 100%; height: auto;">

<br />

### Welcome to GazBot.

GazBot (Gazprom Bot) is an automatic ticket-sniping program for Gazprom's <a href="https://lakhta.center/en" target="_blank">Lakhta Center</a> 360-degree observation deck, northernmost in the world, highest in Europe, and 20th in the world.

This started as a private experimental project built in late July 2025. At the time, tickets could disappear within seconds, and there was a lot of frustration around availability and inflated resale listings (often 2-3x) on <a href="https://avito.ru" target="_blank">Avito.ru</a>. The goal was simple: help friends and family actually get tickets at face value when drops happened, so we could attend as well.

While building it, the reservation flow appeared to have weaknesses that made it possible (in theory) to hold a large number of reservations using automation + proxies. **That is not the purpose of this open-source release.** Any code paths that intentionally enable “holding inventory hostage” have been removed to avoid encouraging misuse.

Over time, reseller popularity/trust declined and the event went into a winter pause, so we're releasing this as **open source for summer 2026**. We do not encourage using this script to resell tickets yourself, though we do accept that you're able to do so with it anyway —— we'd rather give everyone a fair chance at getting tickets, hence the release.

Branding Disclaimer —— "Gaz" comes from "Gazprom", the company that operates the Lakhta Center. This project is not affiliated with Gazprom or the Russia-Ukraine conflict, and aims to be politically neutral.

In the most modern version, this is deployed as a Cloudflare Worker + Durable Object, driven by environment variables and a KV namespace.

### How it works (high level)

- **Telegram UI**: Users interact via commands in Telegram (create/list/delete orders, set auth token, etc.).
- **Durable Object “brain”**: All state and the main loop live inside a single Durable Object instance (`Server`).
- **Storage**: State is stored in Workers KV (`CACHE`) under a single key (`db`) and kept in sync.
- **Polling**: The DO continuously fetches availability from Lakhta’s API, then attempts reservations for matching orders.
- **Notifications**: Success/failure is sent to Telegram. Optional operational logs can be sent to Discord via a webhook.
- **Ignition / keep-alive**: A Worker cron triggers every minute and calls `/ignite`, which routes to the Durable Object. The DO starts its long-running loop from its constructor (“ignition”).

### Durable Object architecture

- **Worker entrypoint**: `src/cloudflare/worker.ts`
    - Routes requests containing `/ignite` to the DO instance named `main`.
    - Runs a **cron every minute** (see `wrangler.jsonc`) that calls `https://gazbot.nitlix.net/ignite` to keep the DO warm/alive.
- **Durable Object**: `src/cloudflare/do/server.ts`
    - Bootstraps DB state from KV, starts the Telegram bot, refreshes XSRF token, then runs the availability/reservation loop.
- **Core API clients**
    - `src/lib/getXsrfToken.ts`: fetches the XSRF token using the Lakhta auth cookie.
    - `src/lib/getTimesBot.ts`: fetches times/availability (optionally through proxies).
    - `src/lib/reserveBot.ts`: creates orders (reservations) for a chosen slot.

### Configuration

This project runs as a Cloudflare Worker + Durable Object, driven by environment variables and a KV namespace.

- **Wrangler**: `wrangler.jsonc`
    - Bindings:
        - **Durable Object**: `SERVER` (class `Server`)
        - **KV**: `CACHE` (stores the `db` JSON)
    - Cron:
        - `* * * * *` (once per minute) for the ignition ping

#### Required secrets / vars

Set these via `wrangler secret put ...` / `wrangler kv:namespace ...` (recommended), not by committing them:

- **`TELEGRAM_BOT_TOKEN`**: token for your Telegram bot.
- **`DISCORD_WEBHOOK_URL`** (optional): if set, the DO posts operational logs to Discord.
- **`CACHE` KV namespace binding**: configure IDs in `wrangler.jsonc`.

#### Lakhta auth

The bot needs a valid Lakhta session cookie to talk to the APIs.

- **Cookie name**: `AUTH_COOKIE_NAME` in `src/vars/vars.ts` (defaults to `LAKHTA_CENTRE_ONLINE_TICKETS`)
- **Cookie value**:
    - You can hardcode `AUTH_COOKIE` in `src/vars/vars.ts` (not recommended for OSS), or
    - Use the Telegram command `/token <your_auth_token>` to store it in KV (`db.authToken`), which is what the DO uses.

### Running locally (Worker dev)

Install deps with **bun**, then run Wrangler dev:

```bash
bun i # installs dependencies
bun ws # runs wrangler dev
```

Notes:

- You’ll need a KV namespace configured for preview/dev and a Telegram bot token available to the dev environment.
- The cron ignition runs in production; locally you can hit the dev URL with `/ignite` to trigger the DO.

### Telegram commands (overview)

The Durable Object registers commands like:

- **`/start`**: intro + links
- **`/create`**: guided order creation (conversation-style prompts)
- **`/list`**: list current orders + rebooking timer hints
- **`/delete <id>`**: delete an order
- **`/token <token>`**: set Lakhta auth token used for API calls
- **`/checktoken`**: show whether token is set
- **`/loadproxies <url>`**, **`/listproxies`**, **`/clearproxies`**: proxy management (expects `IP:PORT:USER:PASS` lines)

### A quick history (deployment evolution)

- **Late July 2025**: Private bot, initially run like a traditional always-on service (for example on a VPS), manually monitored and triggered.
- **August 2025 rewrite**: Moved to **Cloudflare Workers + Durable Objects**.
    - The DO became the single always-on “brain” with state in KV.
    - A simple **ignition system** (cron → `/ignite` → DO) kept it warm and continuously running the loop.
- **Summer 2026**: Open-sourced after the winter break and the decline of reseller trust/interest.

### Disclaimer

This repository is published for educational/research purposes and transparency around how the system was built. You are responsible for how you use it, and for complying with the target site’s terms, local laws, and fair-use expectations.
