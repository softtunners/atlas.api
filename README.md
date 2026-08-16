<div align="center">

<img src="https://raw.githubusercontent.com/softtunners/atlas.api/main/icon.png" width="88" alt="Atlas" />

# Atlas

**A fast API client that runs in your browser. No account, no install,
nothing stored on our servers.**

[![npm](https://img.shields.io/npm/v/@atlas.api/agent?style=for-the-badge&color=059669&label=agent)](https://www.npmjs.com/package/@atlas.api/agent)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

[Open Atlas](https://atlas.api) · [Report a bug](https://github.com/softtunners/atlas.api/issues/new?template=bug_report.yml) · [Request a feature](https://github.com/softtunners/atlas.api/issues/new?template=feature_request.yml)

</div>

---

## The app

Atlas runs at **[atlas.api](https://atlas.api)** — import an OpenAPI or Postman
file, or paste a `cURL` command, and start sending. Collections, environments,
saved responses and chained requests, all kept in your browser.

Install it from the address bar and it opens in its own window and works
offline.

## This repository

Two things live here:

1. **`@atlas.api/agent`** — the small program below, which lets the web app
   reach `localhost`.
2. **Issues** — bugs and feature requests for Atlas as a whole.

---

# @atlas.api/agent

A page served over `https://` is not allowed to open a connection to
`http://localhost`. Browsers block it on purpose: otherwise any site you
visited could quietly scan the services running on your machine.

That rule is worth keeping, so instead there is this — a small program you run
yourself. Atlas asks it to make a request, it makes the call, it hands back the
answer.

## Install

Nothing to install permanently. Run it when you need it:

```bash
npx github:softtunners/atlas.api
```

Once it is on npm:

```bash
npx @atlas.api/agent
```

Or keep it around:

```bash
npm install -g github:softtunners/atlas.api
atlas-agent
```

Needs **Node 18 or newer**. That is the only requirement.

## Use

Start it:

```bash
$ npx github:softtunners/atlas.api

  Atlas agent · 127.0.0.1:4400

  Paste this into Atlas (Settings → Local agent):

    ws://127.0.0.1:4400?token=8fJ2nQ...

  Only this terminal has the token. Ctrl+C to stop.
```

Copy the `ws://` line into **Settings → Local agent** in Atlas. Requests to
local addresses then go through it — `localhost` on any port, containers, and
anything on your network or VPN. Public URLs carry on going out directly.

Leave it running while you work. Ctrl+C when you are done.

### Options

```
-p, --port <n>    Port to listen on            (default 4400)
    --allow <re>  Additionally allow an origin (regex)
-h, --help
```

## What it does not do

- **It reads no files.** There is no filesystem access anywhere in it.
- It stores nothing, and writes nothing to disk.
- It talks to no host except the one in the request you asked for.

## Security

It is a program listening on a port, so that deserves a straight answer.

Three checks, all of them, on every connection:

1. **Binds `127.0.0.1` only** — never `0.0.0.0`, never a LAN address. Nothing
   else on your network can see it.
2. **Checks the calling page's `Origin`** against a short allowlist. Requests
   from any other site are refused before anything is read.
3. **Requires a token**, generated fresh on each run and printed only in your
   terminal. Close the agent and it stops working.

Cloud metadata endpoints (`169.254.*` and the Google and Azure equivalents) are
refused outright — they hand out credentials to anything on the machine that
asks, and running locally is no reason to be relaxed about that.

### No dependencies

Not "few" — zero. Every dependency this had would be one you were also trusting
with a listening socket and outbound network access. The WebSocket layer is
about 180 lines of RFC 6455 in [`lib/ws.mjs`](lib/ws.mjs), and the whole thing
is under 25 KB unpacked.

Read it before you run it. It is short on purpose.

## Browser support

| Browser | Works |
|---|---|
| Chrome, Edge, Brave | Yes |
| Firefox | No — refuses connections from `https://` to local addresses |
| Safari | No — same |

Nothing the agent does changes this; the restriction is in the browser.

---

## Licence

MIT. See [LICENSE](LICENSE).
