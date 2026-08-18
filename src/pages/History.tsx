import { useEffect, useState } from "react";
import type { WorldScar } from "../../packages/shared/types";
import { api } from "../api";
import { LoadingPanel, PageHeader, Shell } from "../components";

interface HistoryItem { id: number; event_id: string; event_name: string; outcome: string; severity: string; occurred_at: string; details: Record<string, unknown> }
export function HistoryPage() {
  const [data, setData] = useState<{ history: HistoryItem[]; scars: WorldScar[] } | null>(null); const [error, setError] = useState("");
  useEffect(() => { void api<{ history: HistoryItem[]; scars: WorldScar[] }>("/api/history").then(setData).catch((reason: Error) => setError(reason.message)); }, []);
  return <Shell active="/history"><PageHeader eyebrow="MUNICIPAL ARCHIVE / PARTIALLY REDACTED" title="Incident History" description="Failures are retained for training, billing, and future recurrence."/>{!data ? <LoadingPanel error={error}/> : <section className="history-grid"><div className="timeline panel"><div className="section-head"><span>OPERATIONS ARCHIVE</span><small>{data.history.length} ENTRIES</small></div>{data.history.length ? data.history.map((item) => <article className={`history-item ${item.severity}`} key={item.id}><time>{new Date(item.occurred_at).toLocaleString()}</time><div><small>{item.severity} / {item.event_id}</small><h2>{item.event_name}</h2><p>Resolution: <b>{item.outcome}</b></p></div></article>) : <div className="empty-record">No major incidents have been filed. This is suspicious.</div>}</div><aside className="scars-panel panel"><div className="section-head"><span>WORLD SCARS</span></div>{data.scars.length ? data.scars.map((scar) => <article key={scar.id}><small>ACQUIRED {new Date(scar.acquiredAt).toLocaleDateString()}</small><h3>{scar.name}</h3><p>{scar.description}</p></article>) : <div className="empty-record">The world remains mostly as issued.</div>}</aside></section>}</Shell>;
}
