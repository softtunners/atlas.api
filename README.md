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

1. **`@atlas.api/agent`** — the small program below. It reads your backend on
   your own machine and sends Atlas the API map, and it lets the web app reach
   `localhost`.
2. **Issues** — bugs and feature requests for Atlas as a whole.

---

# @atlas.api/agent

A browser tab cannot read a folder on your disk, and a page served over
`https://` is not allowed to open a connection to `http://localhost`. Both
rules are worth keeping — otherwise any site you visited could read your files
and scan the services on your machine.

So instead there is this: a small program you run yourself, which does both
jobs on your side of the line.

**It reads your project locally.** The analyser runs here, on your machine, in
a process you started. Your source code is never uploaded — only the result
(routes, request shapes, the database map) is sent to your browser tab. For
anyone who cannot send proprietary code to a third party, this is the point.

**It forwards requests.** Atlas asks it to make a call to a local address, it
makes the call, it hands back the answer.

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

  Paste this into Atlas (it asks on the first local request):

    ws://127.0.0.1:4400?token=8fJ2nQ...

  Only this terminal has the token. Ctrl+C to stop.
```

Send a request to a local address in Atlas and it asks for this line. Paste it
in and the request carries on. You can also set it up ahead of time under
**Settings → Local agent**.

Requests to local addresses then go through it — `localhost` on any port,
containers, and anything on your network or VPN. Public URLs carry on going out
directly.

Leave it running while you work. Ctrl+C when you are done.

### Options

```
-p, --port <n>    Port to listen on            (default 4400)
    --allow <re>  Additionally allow an origin (regex)
-h, --help
```

## What it does and does not do

It **does** read source files, but only under a folder you choose, and only
when a connected Atlas tab asks it to. That is the feature.

- It **uploads nothing.** Your code is read here and analysed here. What
  crosses the socket is the API map, not your source.
- It writes nothing to disk, and stores nothing between runs.
- It talks to no host except the one in a request you asked for.
- It refuses to scan `/`, system directories, and your home directory itself —
  point it at a project.

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

### One dependency

`typescript`, which the analyser uses to read your code properly rather than
with regular expressions. Nothing else. The WebSocket layer is about 180 lines
of RFC 6455 in [`lib/ws.mjs`](lib/ws.mjs), written by hand rather than pulled
in, for exactly the reason you would expect of something holding a listening
socket.

`index.mjs`, `lib/ws.mjs`, `lib/proxy.mjs` and `lib/scan.mjs` are the parts
that listen, read and forward. They are MIT and short on purpose — read them
before you run this.

`lib/analyzer.min.mjs` is a compiled build artifact and is not readable source.
It is the product, and it is not MIT — see [LICENSE](LICENSE). Everything it is
allowed to do is bounded by `lib/scan.mjs`, which you can read.

## Browser support

| Browser | Works |
|---|---|
| Chrome, Edge, Brave | Yes |
| Firefox | No — refuses connections from `https://` to local addresses |
| Safari | No — same |

Nothing the agent does changes this; the restriction is in the browser. It
applies to scanning as well as to requests, since both use the same socket.

---

## Licence

The agent source is MIT. The bundled analyser is proprietary. See
[LICENSE](LICENSE) for both.
