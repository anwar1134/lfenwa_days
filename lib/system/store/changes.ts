/* "Something in the System changed" notifications for the UI — in this tab (a Set of
   listeners) and across tabs (BroadcastChannel where available). Carries no data:
   listeners simply re-read a snapshot. */
type Listener = () => void;
const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    channel = new BroadcastChannel("lfenwa-system");
    channel.onmessage = () => emitLocal(); // another tab changed the System: refresh, don't re-broadcast
  } catch {
    channel = null;
  }
  return channel;
}

function emitLocal(): void {
  for (const l of [...listeners]) {
    try {
      l();
    } catch (err) {
      console.error("[system] change listener failed:", err);
    }
  }
}

export function subscribeToSystemChanges(listener: Listener): () => void {
  listeners.add(listener);
  getChannel(); // start listening for other tabs as soon as anyone cares
  return () => listeners.delete(listener);
}

export function notifySystemChange(): void {
  emitLocal();
  try {
    getChannel()?.postMessage("changed");
  } catch {
    /* ignore */
  }
}
