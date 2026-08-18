import { useEffect, useState } from "react";
import type { Player } from "../../packages/shared/types";
import { api } from "../api";
import { LoadingPanel, PageHeader, Shell, fmt } from "../components";

export function WorkerPage({ id }: { id: string }) {
  const [worker, setWorker] = useState<Player | null>(null); const [error, setError] = useState("");
  useEffect(() => { void api<{ worker: Player }>(`/api/workers/${encodeURIComponent(id)}`).then((body) => setWorker(body.worker)).catch((reason: Error) => setError(reason.message)); }, [id]);
  return <Shell active="/workers">{!worker ? <LoadingPanel error={error}/> : <><PageHeader eyebrow={`WORKER FILE / ${worker.id}`} title={worker.displayName} description={worker.activeTitle}/><section className="worker-grid">
    <div className="worker-card panel"><div className="id-photo"><span>{worker.displayName.slice(0,2).toUpperCase()}</span><i>PHOTO NOT TO SCALE</i></div><div className="id-meta"><small>CURRENT ASSIGNMENT</small><b>{worker.department.toUpperCase()}</b><small>CLEARANCE</small><b>LEVEL {worker.level}</b><small>FIRST CLOCKED IN</small><b>{new Date(worker.firstSeenAt).toLocaleDateString()}</b></div></div>
    <div className="stat-card panel"><div><small>CONTRIBUTION</small><b>{fmt(worker.totalContribution)}</b></div><div><small>EXPERIENCE</small><b>{fmt(worker.xp)} XP</b></div><div><small>MOON DISTANCE</small><b>{fmt(worker.moonDistance,2)} KM</b></div><div><small>SHIFTS</small><b>{worker.shiftsParticipated}</b></div><div><small>ACTIONS</small><b>{worker.totalActions}</b></div><div><small>DISASTERS</small><b>{worker.disastersSurvived}</b></div></div>
    <RecordList title="TITLES" items={worker.titles}/><RecordList title="INJURIES / CONDITIONS" items={worker.injuries} empty="No reported dimensional irregularities."/><RecordList title="COMMENDATIONS" items={worker.commendations} empty="Personnel office is reviewing the matter."/><div className="record-list panel"><div className="section-head"><span>INVENTORY</span></div>{Object.entries(worker.inventory).length ? Object.entries(worker.inventory).map(([key,value]) => <p key={key}>{key}<b>{value}</b></p>) : <em>Locker contains only the smell of coal.</em>}</div>
  </section></>}</Shell>;
}

function RecordList({ title, items, empty = "None on file." }: { title: string; items: string[]; empty?: string }) { return <div className="record-list panel"><div className="section-head"><span>{title}</span></div>{items.length ? items.map((item) => <p key={item}>{item}</p>) : <em>{empty}</em>}</div>; }
