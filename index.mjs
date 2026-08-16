#!/usr/bin/env node

/**
 * The Atlas local agent.
 *
 *   npx @atlas.api/agent
 *
 * A browser tab cannot open a connection to `http://localhost:3000` when the
 * page itself came from `https://` — and even where it can, it cannot reach a
 * container or a box on your VPN. This process can, because it runs where you
 * do. The app sends it a request, it makes the call, it sends back what came
 * back. Nothing else.
 *
 * ── Why the token matters ───────────────────────────────────────────────────
 * A socket listening on localhost is reachable by *every page you have open*,
 * not just ours. Without a check, any site you visit could use this to probe
 * your internal network from inside it. So:
 *
 *   1. It binds 127.0.0.1 — never 0.0.0.0, never a LAN address.
 *   2. It checks the `Origin` header against a short allowlist.
 *   3. It requires a token, generated fresh each run, that only appears in
 *      this terminal and in the URL it prints.
 *
 * All three, not any one of them.
 */

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { accept } from "./lib/ws.mjs";
import { proxy } from "./lib/proxy.mjs";
import { scan, list } from "./lib/scan.mjs";

const DEFAULT_PORT = 4400;

/**
 * Where the app may legitimately be served from.
 *
 * This is defence in depth rather than the lock. The token is the lock: 24
 * random bytes printed only in this terminal, which no other page can guess.
 * The origin check is here so that a page which somehow learned the token
 * still has to be Atlas.
 *
 * Deployment previews get their own hostnames, so the Vercel pattern allows
 * the project's previews as well as production. Anything else needs `--allow`.
 */
const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/api-observer\.vercel\.app$/,
  /^https:\/\/api-observer-[a-z0-9-]+\.vercel\.app$/,
  /^https:\/\/([a-z0-9-]+\.)*atlas\.api$/,
  /^https:\/\/([a-z0-9-]+\.)*atlasapi\.dev$/,
];

function parseArgs(argv) {
  const args = { port: DEFAULT_PORT, open: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port" || arg === "-p") args.port = Number(argv[++i]) || DEFAULT_PORT;
    else if (arg === "--no-open") args.open = false;
    else if (arg === "--allow") ALLOWED_ORIGINS.push(new RegExp(`^${argv[++i]}$`));
    else if (arg === "--help" || arg === "-h") args.help = true;
  }
  return args;
}

/**
 * Every browser sends `Origin` on a WebSocket handshake, without exception —
 * so a missing one means the caller is not a page, and being lenient about it
 * only widens the door for nothing. The token is the other lock; neither is a
 * substitute for the other.
 */
const allowed = (origin) =>
  typeof origin === "string" && ALLOWED_ORIGINS.some((rule) => rule.test(origin));

/* Colour only when a person is watching; piped output stays plain. */
const tty = process.stdout.isTTY;
const dim = (text) => (tty ? `[2m${text}[0m` : text);
const bold = (text) => (tty ? `[1m${text}[0m` : text);
const green = (text) => (tty ? `[32m${text}[0m` : text);

function help() {
  console.log(`
${bold("atlas-agent")} — lets the Atlas web app send requests from this machine

  ${dim("npx @atlas.api/agent")}

Options
  -p, --port <n>    Port to listen on            ${dim(`(default ${DEFAULT_PORT})`)}
      --allow <re>  Additionally allow an origin ${dim("(regex)")}
      --no-open     Do not print the connect URL
  -h, --help        This

It listens on 127.0.0.1 only, requires a token printed below, and checks the
page's origin. It reads the project folder you choose and forwards requests to
local addresses. Your source is analysed here and never uploaded.
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    help();
    return;
  }

  const token = randomBytes(24).toString("base64url");
  let connections = 0;

  const server = createServer((request, response) => {
    /* A tiny health endpoint so the app can find the agent before committing
       to a socket. It deliberately reveals nothing but "something is here". */
    if (request.url?.startsWith("/health")) {
      const origin = allowed(request.headers.origin) ? request.headers.origin : null;

      if (!origin) {
        response.writeHead(403).end();
        return;
      }

      const cors = {
        "access-control-allow-origin": origin,
        /* A page on the public internet reaching a local address is a request
           into the private network, which browsers preflight separately from
           ordinary CORS. Without this header the check is refused before the
           handler ever runs. */
        "access-control-allow-private-network": "true",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-max-age": "600",
      };

      if (request.method === "OPTIONS") {
        response.writeHead(204, cors).end();
        return;
      }

      response.writeHead(200, { ...cors, "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, agent: "atlas", version: 1 }));
      return;
    }

    response.writeHead(404).end();
  });

  server.on("upgrade", (request, socket) => {
    const origin = request.headers.origin;
    const url = new URL(request.url ?? "/", "http://localhost");

    if (!allowed(origin)) {
      console.log(
        `  ${dim("refused a connection from")} ${origin ?? "(no origin)"}\n` +
          `  ${dim(`if that is your Atlas, restart with:  --allow '${(origin ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") || "https://your-host"}'`)}`,
      );
      socket.destroy();
      return;
    }

    if (url.searchParams.get("token") !== token) {
      console.log(`  ${dim("refused a connection with a bad token")}`);
      socket.destroy();
      return;
    }

    connections += 1;
    console.log(`  ${green("connected")} ${dim(origin ?? "unknown origin")}`);

    accept(request, socket, {
      onMessage: async (message, { send }) => {
        /* One message type for now. `id` is echoed so the app can match a
           reply to the request that asked for it. */
        if (message?.type === "proxy") {
          const result = await proxy(message.payload ?? {});
          send({ id: message.id, type: "proxy:result", result });
          const { method = "GET", url: target = "" } = message.payload ?? {};
          console.log(
            `  ${dim("→")} ${method} ${target} ${dim(`${result.status} · ${result.durationMs ?? 0}ms`)}`,
          );
          return;
        }

        if (message?.type === "scan") {
          const target = message.payload?.path ?? "";
          console.log(`  ${dim("scanning")} ${target}`);
          const result = await scan(message.payload ?? {});
          send({ id: message.id, type: "scan:result", result });
          console.log(
            result.ok
              ? `  ${green("scanned")} ${result.project?.stats?.routes ?? 0} routes ${dim(`${result.durationMs}ms`)}`
              : `  ${dim("scan failed —")} ${result.error}`,
          );
          return;
        }

        if (message?.type === "list") {
          send({ id: message.id, type: "list:result", result: await list(message.payload ?? {}) });
          return;
        }

        if (message?.type === "ping") {
          send({ id: message.id, type: "pong" });
          return;
        }

        send({ id: message?.id, type: "error", error: `Unknown message: ${message?.type}` });
      },
      onClose: () => {
        connections -= 1;
        console.log(`  ${dim("disconnected")}`);
      },
    });
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`\n  Port ${args.port} is busy. Try: atlas-agent --port ${args.port + 1}\n`);
      process.exit(1);
    }
    throw error;
  });

  server.listen(args.port, "127.0.0.1", () => {
    const connect = `ws://127.0.0.1:${args.port}?token=${token}`;
    console.log(`
  ${bold("Atlas agent")} ${dim(`· 127.0.0.1:${args.port}`)}

  Paste this into Atlas ${dim("(it asks on the first local request)")}:

    ${green(connect)}

  ${dim("Only this terminal has the token. Ctrl+C to stop.")}
`);
  });

  const stop = () => {
    console.log(`\n  ${dim(`stopped${connections > 0 ? ` (${connections} open)` : ""}`)}`);
    server.close(() => process.exit(0));
    /* Do not hang forever on a socket that will not close. */
    setTimeout(() => process.exit(0), 500).unref();
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main();
