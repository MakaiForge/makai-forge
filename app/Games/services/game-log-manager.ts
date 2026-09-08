const MAX_LINES = 50000;
const BATCH_INTERVAL_MS = 100;

type LogCallback = (lines: string[]) => void;

let _sendToRenderer: ((shop: string, objectId: string, lines: string[]) => void) | null = null;

export function setGameLogRendererSend(
  send: (shop: string, objectId: string, lines: string[]) => void
): void {
  _sendToRenderer = send;
}

const batchQueue = new Map<string, string[]>();
let batchTimer: ReturnType<typeof setInterval> | null = null;

function startBatchTimer(): void {
  if (batchTimer) return;
  batchTimer = setInterval(() => {
    if (!_sendToRenderer) return;
    for (const [key, lines] of batchQueue) {
      if (lines.length === 0) continue;
      const [shop, objectId] = key.split("|");
      const batch = lines.splice(0);
      _sendToRenderer(shop, objectId, batch);
    }
  }, BATCH_INTERVAL_MS);
}

function queueLine(shop: string, objectId: string, line: string): void {
  const key = `${shop}|${objectId}`;
  let lines = batchQueue.get(key);
  if (!lines) {
    lines = [];
    batchQueue.set(key, lines);
  }
  lines.push(line);
}

class GameLogBuffer {
  private lines: string[] = [];

  get all(): string[] {
    return this.lines;
  }

  append(line: string): void {
    this.lines.push(line);
    if (this.lines.length > MAX_LINES) {
      this.lines.splice(0, this.lines.length - MAX_LINES);
    }
  }

  appendLines(newLines: string[]): void {
    if (newLines.length === 0) return;
    for (const nl of newLines) {
      this.lines.push(nl);
      if (this.lines.length > MAX_LINES) {
        this.lines.splice(0, this.lines.length - MAX_LINES);
      }
    }
  }

  clear(): void {
    this.lines = [];
  }

  subscribe(cb: LogCallback): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  private subscribers = new Set<LogCallback>();
}

const buffers = new Map<string, GameLogBuffer>();

function getGameId(shop: string, objectId: string): string {
  return `${shop}:${objectId}`;
}

function ensureBuffer(shop: string, objectId: string): GameLogBuffer {
  const id = getGameId(shop, objectId);
  let buf = buffers.get(id);
  if (!buf) {
    buf = new GameLogBuffer();
    buffers.set(id, buf);
  }
  return buf;
}

export const GameLogManager = {
  append(shop: string, objectId: string, line: string): void {
    ensureBuffer(shop, objectId).append(line);
    queueLine(shop, objectId, line);
    startBatchTimer();
  },

  appendLines(shop: string, objectId: string, lines: string[]): void {
    ensureBuffer(shop, objectId).appendLines(lines);
    for (const line of lines) {
      queueLine(shop, objectId, line);
    }
    startBatchTimer();
  },

  getLines(shop: string, objectId: string): string[] {
    return ensureBuffer(shop, objectId).all;
  },

  clear(shop: string, objectId: string): void {
    const id = getGameId(shop, objectId);
    const buf = buffers.get(id);
    if (buf) buf.clear();
  },

  subscribe(
    shop: string,
    objectId: string,
    cb: LogCallback
  ): () => void {
    return ensureBuffer(shop, objectId).subscribe(cb);
  },
};
