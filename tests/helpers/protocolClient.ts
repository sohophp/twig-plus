import type { ChildProcessWithoutNullStreams } from "node:child_process";

export class ProtocolClient {
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (message: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private readonly notificationWaiters = new Map<string, Array<{ resolve: (message: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>>();
  constructor(private readonly process: ChildProcessWithoutNullStreams) {
    process.stdout.on("data", (chunk) => { this.buffer = Buffer.concat([this.buffer, chunk]); this.drain(); });
    let stderr = "";
    process.stderr.on("data", (chunk) => { stderr += String(chunk); });
    process.on("error", (error) => this.rejectAll(error));
    // `close` fires after stdio closes, so the failure includes all stderr.
    process.on("close", (code, signal) => this.rejectAll(new Error(
      `Bundled language server exited before completing pending requests (code=${String(code)}, signal=${String(signal)}).${stderr ? `\n${stderr}` : ""}`
    )));
  }
  request(method: string, params: unknown): Promise<any> {
    const id = this.nextId++;
    this.send({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out.`)); }, 5000);
      this.pending.set(id, { resolve, reject, timer });
    });
  }
  notify(method: string, params: unknown): void { this.send({ jsonrpc: "2.0", method, params }); }
  waitForNotification(method: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} notification timed out.`)), 5000);
      const waiters = this.notificationWaiters.get(method) ?? [];
      waiters.push({ resolve, reject, timer }); this.notificationWaiters.set(method, waiters);
    });
  }
  private send(message: unknown): void {
    const body = JSON.stringify(message);
    this.process.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }
  private drain(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n"); if (headerEnd < 0) return;
      const length = Number(this.buffer.slice(0, headerEnd).toString().match(/Content-Length:\s*(\d+)/i)?.[1]);
      const start = headerEnd + 4; if (this.buffer.length < start + length) return;
      const message = JSON.parse(this.buffer.slice(start, start + length).toString());
      this.buffer = this.buffer.slice(start + length);
      if (typeof message.id !== "number") {
        const waiter = this.notificationWaiters.get(message.method)?.shift();
        if (waiter) { clearTimeout(waiter.timer); waiter.resolve(message); }
        continue;
      }
      const pending = this.pending.get(message.id); if (!pending) continue;
      clearTimeout(pending.timer); this.pending.delete(message.id); pending.resolve(message);
    }
  }
  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    for (const waiters of this.notificationWaiters.values()) for (const waiter of waiters) { clearTimeout(waiter.timer); waiter.reject(error); }
    this.notificationWaiters.clear();
  }
}
