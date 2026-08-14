<div align="center">

<img src="https://raw.githubusercontent.com/softtunners/atlas.api/main/icon.png" width="88" alt="Atlas" />

# Atlas

**Point it at a backend folder. It reads the code and tells you every endpoint,
what each one expects, and which ones nobody protected.**

[![Download](https://img.shields.io/badge/Download-macOS%20%7C%20Windows-059669?style=for-the-badge)](https://github.com/softtunners/atlas.api/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

[Download](https://atlas.api/download) · [Report a bug](https://github.com/softtunners/atlas.api/issues/new?template=bug_report.yml) · [Request a feature](https://github.com/softtunners/atlas.api/issues/new?template=feature_request.yml)

</div>

---

## What it is

Atlas reads your backend source and works out the API from the code itself —
no OpenAPI spec, no annotations, no manual documentation.

Open a folder and within about a second you have:

- **Every endpoint**, grouped by controller, with the method and full path
- **Request shapes** pulled from Zod schemas, class-validator decorators or plain
  `req.body` destructuring
- **Response codes and messages** the handler can actually return
- **Security findings** — routes with no auth, no rate limit, possible IDOR
- **What each route touches** — services, database models, external APIs, env vars
- **Call order**, as a graph: what you must call before this endpoint will work
- **Dead routes** — endpoints shadowed by an earlier match that never run

Then you can call any of it. Requests are pre-filled from the analysis, sent
straight to your own backend, and saved responses become the documentation.

## Two halves

| | |
|---|---|
| **Discovery** | Derived from your code. Read-only, always current, tells you things you did not know. |
| **Build** | Authored by you. Collections, folders, saved examples, environments — the Postman half. |

Anything Discovery finds can be sent to Build in one click, and **Flows** connects
requests so one can hand a token or an id to the next.

## Install

Download for your platform from the [latest release](https://github.com/softtunners/atlas.api/releases/latest):

| Platform | File |
|---|---|
| macOS · Apple silicon | `Atlas-x.y.z-arm64.dmg` |
| macOS · Intel | `Atlas-x.y.z.dmg` |
| Windows | `Atlas-Setup-x.y.z.exe` |
| Linux | `Atlas-x.y.z.AppImage` |

### The first launch shows a warning

Atlas is not code-signed yet, so your OS flags it as coming from an unknown
developer. This is expected.

**macOS** — right-click Atlas in Applications → **Open** → **Open**. Once only.

**Windows** — SmartScreen shows *"Windows protected your PC"* → **More info** →
**Run anyway**.

## Why it is a desktop app

Atlas reads your filesystem, calls `http://localhost:3000` and starts your dev
server. A website in a datacentre can do none of those things. Running on your
machine means:

- **Your source never leaves it.** There is no server to upload to.
- **No CORS.** Requests go from your machine to your backend directly.
- **No tunnel.** `localhost` means your localhost.

Results are written into `.atlas.api/` inside the project you scanned, so they
travel with the repo and show up in a diff. Environment values are gitignored
automatically.

## Supported frameworks

Detected from the code, not from configuration:

**Node** — Express · NestJS · Fastify · Koa
**Python** — FastAPI · Django REST Framework · Flask
**Other** — Go (Gin) · Java (Spring) · PHP (Laravel) · Ruby (Rails) · .NET

Request schemas are read from Zod, class-validator, Pydantic and DRF
serializers where present.

## Also does

- **Import** an OpenAPI or Swagger spec, a Postman collection, or a RAML file
- **Paste a cURL command** and get a request back
- **Export any JSON** — a whole response or just the part you selected — as a
  TypeScript interface, Zod schema, JSON Schema, Dart class, Python dataclass or
  Go struct
- **Browse your database** — Postgres, MySQL, MongoDB
- **Run your project** and watch its output without leaving the app

## Issues and feedback

This repository is for **bugs, feature requests and releases**.

- 🐛 [Report a bug](https://github.com/softtunners/atlas.api/issues/new?template=bug_report.yml)
- ✨ [Request a feature](https://github.com/softtunners/atlas.api/issues/new?template=feature_request.yml)
- 💬 [Ask a question](https://github.com/softtunners/atlas.api/discussions)

When reporting a scanning problem, the framework and a small example of the
route that was missed helps enormously — the parser is the part most likely to
be wrong on a codebase we have not seen.

## Privacy

Atlas has no analytics, no telemetry and no account requirement. It makes
network requests to exactly two places: the API **you** ask it to call, and
GitHub if you use the repository import. Nothing else leaves your machine.

---

<div align="center">
<sub>Built for people who inherited a backend nobody documented.</sub>
</div>
