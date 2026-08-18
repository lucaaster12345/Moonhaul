import { useEffect, useState } from "react";
import { api } from "./api";
import type { EventDefinition } from "../packages/game-engine/events";
import type { WorldScar, WorldState } from "../packages/shared/types";

export interface PublicSnapshot {
  state: WorldState;
  activeEvent: EventDefinition | null;
  scars: WorldScar[];
  playerCount: number;
  chat: { provider: string; connected: boolean; detail: string };
  uptimeSeconds: number;
  mockBots: number;
}

export function useLiveState(): { data: PublicSnapshot | null; connected: boolean; error: string } {
  const [data, setData] = useState<PublicSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void api<PublicSnapshot>("/api/state")
        .then((value) => { if (alive) { setData(value); setError(""); } })
        .catch((reason: Error) => alive && setError(reason.message));
    };
    refresh();
    // SSE is the fast path; this low-frequency snapshot keeps an OBS/browser
    // source current if a burst of chat updates causes its event stream to
    // reconnect or fall behind.
    const poll = window.setInterval(refresh, 5000);
    const source = new EventSource("/api/live");
    source.addEventListener("state", (event) => { setData(JSON.parse((event as MessageEvent).data) as PublicSnapshot); setConnected(true); setError(""); });
    source.onerror = () => { setConnected(false); setError("Live link reconnecting"); };
    return () => { alive = false; window.clearInterval(poll); source.close(); };
  }, []);
  return { data, connected, error };
}
