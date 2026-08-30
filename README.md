<div align="center">

<img src="https://raw.githubusercontent.com/softtunners/atlas.api/main/icon.png" width="88" alt="Atlas" />

# Atlas

**Point it at a backend and it tells you what the API actually is —
every endpoint, what it expects, and what it touches.
Your code never leaves your machine.**

[![npm](https://img.shields.io/npm/v/@atlas.api/agent?style=for-the-badge&color=059669&label=agent)](https://www.npmjs.com/package/@atlas.api/agent)
[![License](https://img.shields.io/badge/agent-MIT-blue?style=for-the-badge)](LICENSE)

[Open Atlas](https://api-observer.vercel.app) ·
[Report a bug](https://github.com/softtunners/atlas.api/issues/new?template=bug_report.yml) ·
[Request a feature](https://github.com/softtunners/atlas.api/issues/new?template=feature_request.yml)

</div>

---

## What Atlas does

Most API clients start from the assumption that you already know what the API
is. Atlas starts one step earlier: it reads the source and works that out.

- **Discovery** — point it at a backend and get every route, the shape of what
  it expects, what it returns, and which database tables it touches. Static
  analysis; nothing has to be running.
- **Testing** — send requests, chain them into flows, save responses.

Express, NestJS, Fastify, Django, FastAPI, Spring, ASP.NET and Laravel are
recognised today. Node and .NET are the most accurate; other stacks find routes
reliably and fewer body shapes.

## Where your work lives

There is no account and no database on our side.

- **Scanned projects** — written into a `.atlas.api/` directory inside your own
  project, as plain JSON you can read, delete or commit.
- **Collections, environments, saved responses** — in your browser's own
  storage. Clearing site data clears them; they do not follow you to another
  machine.
- **Committing** — done by this agent using the Git credentials already on your
  computer. There is no token to create and none is stored.

`environments.json` is excluded by a `.gitignore` the agent writes, because an
environment usually holds a real token.

## This repository

1. **`@atlas.api/agent`** — the program below. It reads your backend on your
   own machine, and lets the web app reach `localhost`.
2. **Issues** — bugs and feature requests for Atlas as a whole.

---

# @atlas.api/agent

A browser tab cannot read a folder on your disk, and a page served over
`https://` may not open a connection to `http://localhost`. Both rules are
worth keeping — otherwise any site you visited could read your files and scan
the services on your machine.

So instead there is this: a small program you run yourself, which does those
jobs on your side of the line.

**It reads your project locally.** The analyser runs here, in a process you
started. Your source is never uploaded — only the result crosses the socket.
For anyone who cannot send proprietary code to a third party, this is the
point.

**It forwards requests.** Atlas asks it to call a local address; it makes the
call and hands back the answer.

**It runs Git for you.** Committing your API description goes through the
credentials already configured on your machine, so a private repository behind
corporate SSO works exactly as well as a public one.

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

```bash
$ npx github:softtunners/atlas.api

  atlas.api agent 0.2.0 · 127.0.0.1:4400

  Paste this into Atlas (it asks on the first local request)

    ws://127.0.0.1:4400?token=8fJ2nQ...

  keys  c copy url   r new token   s status   q quit
```

Choose "Scan a project" in Atlas, or send a request to a local address, and it
asks for this line. Paste it in and the work carries on. You can also set it up
ahead of time under **Settings → Local agent**.

Requests to local addresses then go through it — `localhost` on any port,
containers, and anything on your network or VPN. Public URLs carry on going out
directly.

Leave it running while you work. `q` or Ctrl+C when you are done.

### Options

```
-p, --port <n>    Port to listen on              (default 4400)
    --no-open     Do not print or copy the URL
    --allow <re>  Additionally allow an origin   (regex)
-h, --help
```

## What it does, and does not

It **does** read source files — but only under a folder you choose, and only
when a connected Atlas tab asks. That is the feature.

- It **uploads nothing.** Your code is read here and analysed here. What
  crosses the socket is the API map, not your source.
- It **writes only inside `.atlas.api/`**, in the folder you selected, and only
  when you ask it to save or commit. Nothing else on your disk is modified.
- It **stages only the files it wrote.** Never `git add .` — a repository with
  unrelated work in progress comes out of a commit with that work untouched.
- It talks to no host except the one in a request you asked for.
- It refuses to scan `/`, system directories, and your home directory itself —
  point it at a project.
- It stores nothing between runs. The token is new every time it starts.

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

Git is scoped the same way: only inside the folder you selected, only paths
under `.atlas.api/`, and with `GIT_TERMINAL_PROMPT=0` so it can never sit
waiting on a credential prompt you cannot see.

### One dependency

`typescript`, which the analyser uses to read your code properly rather than
with regular expressions. Nothing else. The WebSocket layer is about 180 lines
of RFC 6455 in [`lib/ws.mjs`](lib/ws.mjs), written by hand rather than pulled
in, for exactly the reason you would expect of something holding a listening
socket.

`index.mjs`, `lib/ws.mjs`, `lib/proxy.mjs`, `lib/scan.mjs` and `lib/git.mjs`
are the parts that listen, read, forward and commit. They are MIT and short on
purpose — read them before you run this.

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
applies to scanning and committing as well as to requests, since all three use
the same socket.

---

## Licence

The agent source is MIT. The bundled analyser is proprietary. See
[LICENSE](LICENSE) for both.
