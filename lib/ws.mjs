/**
 * Just enough of RFC 6455 to carry JSON both ways.
 *
 * Written rather than pulled from npm because this process listens on a port
 * and forwards network requests on the user's behalf. Every dependency it has
 * is a dependency they are trusting with that, and "zero" is the only number
 * that needs no explanation.
 *
 * Deliberately partial: text frames, close, ping. No compression, no binary,
 * no extensions. Messages here are small JSON objects, so continuation frames
 * are handled but never expected.
 */

import { createHash } from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const OPCODE = {
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xa,
};

/** A frame this process is sending. Server frames are never masked. */
function encode(opcode, payload) {
  const body = Buffer.from(payload ?? "", "utf8");
  const length = body.length;

  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  header[0] = 0x80 | opcode; // FIN set — we never fragment.
  return Buffer.concat([header, body]);
}

/**
 * Pulls whole frames out of a rolling buffer.
 *
 * Returns the frames it could complete and whatever bytes are left over, so
 * the caller can hand them back with the next chunk. TCP does not respect
 * message boundaries; assuming one chunk is one frame is the classic way to
 * get a parser that works locally and fails under load.
 */
function decode(buffer) {
  const frames = [];

  while (buffer.length >= 2) {
    const fin = (buffer[0] & 0x80) !== 0;
    const opcode = buffer[0] & 0x0f;
    const masked = (buffer[1] & 0x80) !== 0;
    let length = buffer[1] & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (buffer.length < offset + 2) break;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (buffer.length < offset + 8) break;
      const big = buffer.readBigUInt64BE(offset);
      /* A 4GB frame is not a message, it is an attack. */
      if (big > 8_000_000n) return { frames, rest: buffer, overflow: true };
      length = Number(big);
      offset += 8;
    }

    let mask;
    if (masked) {
      if (buffer.length < offset + 4) break;
      mask = buffer.subarray(offset, offset + 4);
      offset += 4;
    }

    if (buffer.length < offset + length) break;

    const payload = Buffer.from(buffer.subarray(offset, offset + length));
    /* Every client-to-server frame is masked; unmasking is mandatory. */
    if (mask) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    }

    frames.push({ fin, opcode, payload });
    buffer = buffer.subarray(offset + length);
  }

  return { frames, rest: buffer, overflow: false };
}

/**
 * Completes the upgrade and returns a small connection object.
 *
 * `onMessage` receives parsed JSON. Anything that is not JSON is dropped
 * rather than thrown — a malformed frame from an unknown sender should cost
 * one message, not the process.
 */
export function accept(request, socket, { onMessage, onClose }) {
  const key = request.headers["sec-websocket-key"];
  const digest = createHash("sha1")
    .update(key + GUID)
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${digest}\r\n\r\n`,
  );

  socket.setNoDelay(true);

  let buffer = Buffer.alloc(0);
  let pending = "";
  let closed = false;

  const send = (value) => {
    if (closed || socket.destroyed) return;
    socket.write(encode(OPCODE.TEXT, JSON.stringify(value)));
  };

  const close = (code = 1000) => {
    if (closed) return;
    closed = true;
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code);
    try {
      socket.write(Buffer.concat([Buffer.from([0x88, 0x02]), payload]));
    } catch {
      /* Already gone. */
    }
    socket.end();
  };

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const { frames, rest, overflow } = decode(buffer);
    buffer = rest;

    if (overflow) {
      close(1009); // Message too big.
      return;
    }

    for (const frame of frames) {
      if (frame.opcode === OPCODE.CLOSE) {
        close();
        return;
      }
      if (frame.opcode === OPCODE.PING) {
        socket.write(encode(OPCODE.PONG, frame.payload.toString("utf8")));
        continue;
      }
      if (frame.opcode === OPCODE.PONG) continue;

      if (frame.opcode === OPCODE.TEXT || frame.opcode === OPCODE.CONTINUATION) {
        pending += frame.payload.toString("utf8");
        if (!frame.fin) continue;

        const text = pending;
        pending = "";
        try {
          onMessage(JSON.parse(text), { send, close });
        } catch {
          /* Not JSON, or the handler threw. Neither is worth dying over. */
        }
      }
    }
  });

  const finish = () => {
    if (!closed) {
      closed = true;
      onClose?.();
    }
  };

  socket.on("close", finish);
  socket.on("error", finish);

  return { send, close };
}
