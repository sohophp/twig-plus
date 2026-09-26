import { afterEach, describe, expect, it, vi } from "vitest";
import { PhpContextRefresh, type PhpContextRefreshOptions } from "../src/language/phpContextRefresh";

afterEach(() => vi.useRealTimers());

function fixture() {
  const publish = vi.fn(async (_payload: unknown) => {});
  const provide = vi.fn<PhpContextRefreshOptions["provide"]>(async (root) => ({ hello: { projectId: root, snapshotVersion: "1" } }));
  const refresh = new PhpContextRefresh({
    isRunning: () => true, roots: () => ["file:///one"], isAvailable: async () => true, provide, publish
  });
  return { refresh, provide, publish };
}

describe("PHP context refresh", () => {
  it("coalesces edits and publishes an unchanged snapshot only once", async () => {
    vi.useFakeTimers();
    const { refresh, provide, publish } = fixture();
    refresh.schedule(300);
    await vi.advanceTimersByTimeAsync(100);
    refresh.schedule(300);
    await vi.advanceTimersByTimeAsync(299);
    expect(provide).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(provide).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(provide).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);
    refresh.dispose();
  });

  it("serializes requests and discards a result superseded during provider execution", async () => {
    vi.useFakeTimers();
    const { refresh, provide, publish } = fixture();
    let resolveFirst!: (payload: unknown) => void;
    provide.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    refresh.schedule();
    await vi.advanceTimersByTimeAsync(150);
    refresh.schedule();
    await vi.advanceTimersByTimeAsync(150);
    expect(provide).toHaveBeenCalledTimes(1);
    resolveFirst({ hello: { projectId: "file:///one", snapshotVersion: "old" } });
    await vi.advanceTimersByTimeAsync(0);
    expect(provide).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]?.[0]).toMatchObject({ hello: { snapshotVersion: "1" } });
    refresh.dispose();
  });

  it("stops scheduled retries after disposal", async () => {
    vi.useFakeTimers();
    const { refresh, provide } = fixture();
    refresh.schedule();
    await vi.advanceTimersByTimeAsync(150);
    refresh.dispose();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(provide).toHaveBeenCalledTimes(1);
    expect(await refresh.refreshNow()).toBe(false);
  });

  it("tracks snapshot versions independently for each workspace root", async () => {
    const publish = vi.fn(async (_payload: unknown) => {});
    const provide = vi.fn(async (root: string) => ({ hello: { projectId: root, snapshotVersion: "1" } }));
    const refresh = new PhpContextRefresh({
      isRunning: () => true, roots: () => ["file:///one", "file:///two"], isAvailable: async () => true, provide, publish
    });
    expect(await refresh.refreshNow()).toBe(true);
    expect(await refresh.refreshNow()).toBe(true);
    expect(provide).toHaveBeenCalledTimes(4);
    expect(publish).toHaveBeenCalledTimes(2);
    refresh.dispose();
  });

  it("publishes changed content even when the provider reuses its snapshot version", async () => {
    const { refresh, provide, publish } = fixture();
    expect(await refresh.refreshNow()).toBe(true);
    provide.mockResolvedValue({ hello: { projectId: "file:///one", snapshotVersion: "1" }, contexts: [{ template: "new.twig" }] });
    expect(await refresh.refreshNow()).toBe(true);
    expect(publish).toHaveBeenCalledTimes(2);
    refresh.dispose();
  });
});
