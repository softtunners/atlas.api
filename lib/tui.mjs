/**
 * What the agent looks like while it runs.
 *
 * This is the only interface most people will ever see it through, and it is
 * running in the terminal they are already working in — so it earns its space
 * or it gets in the way. Everything here is either state you need (is it
 * connected, what did it just do) or an action you would otherwise have to
 * leave the terminal for.
 *
 * Colour is used only where it carries meaning, and only when a person is
 * watching. Piped output stays plain so a log file is readable.
 */

import { spawn } from "node:child_process";
import { platform } from "node:os";

const tty = process.stdout.isTTY;

const paint = (code) => (text) => (tty ? `[${code}m${text}[0m` : text);

export const dim = paint("2");
export const bold = paint("1");
export const green = paint("32");
export const red = paint("31");
export const yellow = paint("33");
export const cyan = paint("36");
export const grey = paint("90");

/**
 * The wordmark, in the same lowercase block form as the app.
 *
 * Drawn rather than pulled from a figlet dependency: it is eleven characters
 * that will never change, and a dependency for that would be absurd in a
 * package whose whole argument is that you can read it.
 */
const WORDMARK = [
  "  ▄▀█ ▀█▀ █░░ ▄▀█ █▀     ▄▀█ █▀█ █",
  "  █▀█ ░█░ █▄▄ █▀█ ▄█     █▀█ █▀▀ █",
];

export function banner(version, port) {
  if (!tty) {
    console.log(`atlas.api agent ${version} · 127.0.0.1:${port}`);
    return;
  }

  console.log("");
  for (const line of WORDMARK) console.log(cyan(line));
  console.log(`${dim("  ─────────────────────────────────")}`);
  console.log(`  ${dim(`agent ${version}  ·  127.0.0.1:${port}`)}\n`);
}

/**
 * Puts the connect URL on the clipboard.
 *
 * The alternative is selecting a 60-character line containing a random token
 * by hand, which is exactly the kind of small misery that makes a tool feel
 * unfinished. Failure is silent and non-fatal — the URL is printed either way,
 * and a headless box with no clipboard is a normal place to run this.
 */
export function copyToClipboard(text) {
  const commands = {
    darwin: ["pbcopy", []],
    win32: ["clip", []],
    linux: ["xclip", ["-selection", "clipboard"]],
  };

  const entry = commands[platform()];
  if (!entry) return Promise.resolve(false);

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(entry[0], entry[1], { stdio: ["pipe", "ignore", "ignore"] });
    } catch {
      resolve(false);
      return;
    }

    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
    child.stdin.on("error", () => resolve(false));
    child.stdin.end(text);
  });
}

/** The connect URL, with the token dimmed so the shape is readable at a glance. */
export function connectBlock(url, copied) {
  const [base, token] = url.split("?token=");
  console.log(`  ${dim("Paste this into Atlas")} ${dim("(it asks on the first local request)")}\n`);
  console.log(`    ${green(base)}${dim("?token=")}${grey(token)}\n`);
  console.log(
    copied
      ? `  ${green("✓")} ${dim("copied to your clipboard")}`
      : `  ${dim("select the line above to copy it")}`,
  );
}

/** The keys that do something while it is running. */
export function keyHelp() {
  console.log(
    `  ${dim("keys")}  ${bold("c")} ${dim("copy url")}   ${bold("r")} ${dim("new token")}   ` +
      `${bold("s")} ${dim("status")}   ${bold("q")} ${dim("quit")}\n`,
  );
}

/** Colours a status code by class, because that is the thing being scanned for. */
export function statusColour(status) {
  if (status === 0) return red(String(status || "—"));
  if (status >= 500) return red(String(status));
  if (status >= 400) return yellow(String(status));
  if (status >= 300) return cyan(String(status));
  return green(String(status));
}

/** Method column, padded so paths line up down the page. */
export function methodLabel(method) {
  const text = String(method ?? "GET").toUpperCase().padEnd(6);
  if (/^(POST|PUT|PATCH)/.test(text)) return yellow(text);
  if (/^DELETE/.test(text)) return red(text);
  return cyan(text);
}

/** Trims a long URL from the middle, keeping the host and the path end. */
export function shorten(url, width = 58) {
  if (url.length <= width) return url;
  const keepEnd = Math.floor(width / 2) - 2;
  return `${url.slice(0, width - keepEnd - 1)}…${url.slice(-keepEnd)}`;
}

/** A duration, in the unit that makes it readable. */
export function duration(ms) {
  if (ms == null) return "";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
