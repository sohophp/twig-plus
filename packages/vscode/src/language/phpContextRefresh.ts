import { createHash } from "node:crypto";

interface PhpInteropPayload {
  hello?: { projectId?: string; snapshotVersion?: string };
}

export interface PhpContextRefreshOptions {
  isRunning(): boolean;
  roots(): string[];
  isAvailable(): Promise<boolean>;
  provide(root: string): Promise<unknown>;
  publish(payload: unknown): Promise<void>;
}

/** Serializes refreshes and discards results superseded by a later edit. */
export class PhpContextRefresh {
  private generation = 0;
  private attempts = 0;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<boolean> | undefined;
  private readonly snapshots = new Map<string, string>();
  private disposed = false;

  constructor(private readonly options: PhpContextRefreshOptions) {}

  schedule(delayMs = 150): void {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.attempts = 0;
    if (this.timer) clearTimeout(this.timer);
    this.queue(generation, delayMs);
  }

  async refreshNow(): Promise<boolean> {
    if (this.disposed) return false;
    const generation = ++this.generation;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.inFlight) await this.inFlight;
    if (generation !== this.generation || this.disposed) return false;
    return this.refresh(generation);
  }

  dispose(): void {
    this.disposed = true;
    ++this.generation;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.snapshots.clear();
  }

  private queue(generation: number, delayMs: number): void {
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.run(generation);
    }, delayMs);
  }

  private async run(generation: number): Promise<void> {
    if (this.inFlight) await this.inFlight;
    if (generation !== this.generation || this.disposed) return;
    const received = await this.refresh(generation).catch(() => false);
    if (generation !== this.generation || this.disposed) return;
    ++this.attempts;
    if ((!received || this.attempts < 2) && this.attempts < 30 && this.options.isRunning()) this.queue(generation, 2_000);
  }

  private async refresh(generation: number): Promise<boolean> {
    const task = this.collect(generation);
    this.inFlight = task;
    try { return await task; }
    finally { if (this.inFlight === task) this.inFlight = undefined; }
  }

  private async collect(generation: number): Promise<boolean> {
    if (!this.options.isRunning() || !(await this.options.isAvailable())) return false;
    let received = false;
    for (const root of this.options.roots()) {
      if (generation !== this.generation || this.disposed) return false;
      const payload = await this.options.provide(root) as PhpInteropPayload | null;
      if (generation !== this.generation || this.disposed) return false;
      if (!payload) continue;
      received = true;
      const version = payload.hello?.projectId === root ? payload.hello.snapshotVersion : undefined;
      const fingerprint = `${version ?? ""}:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
      if (this.snapshots.get(root) === fingerprint) continue;
      await this.options.publish(payload);
      this.snapshots.set(root, fingerprint);
    }
    return received;
  }
}
