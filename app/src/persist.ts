// Saves a store to localStorage after a short pause instead of on every change.
// A big library rewrote megabytes of JSON for each star or heart click; now rapid changes share one write,
// and anything pending is written when the window is hidden or closed.
export function makePersist(key: string, read: () => unknown, delayMs = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer); timer = undefined;
    try { localStorage.setItem(key, JSON.stringify(read())); } catch { /* storage full or blocked */ }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  }
  return () => { if (timer === undefined) timer = setTimeout(flush, delayMs); };
}
