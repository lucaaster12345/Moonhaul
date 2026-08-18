import { useEffect, useState } from "react";
import type { Player } from "../../packages/shared/types";
import { api } from "../api";
import { LoadingPanel, PageHeader, Shell, fmt } from "../components";

export function WorkersPage() {
  const [workers, setWorkers] = useState<Player[] | null>(null);
  const [sort, setSort] = useState("contribution");
  const [error, setError] = useState("");
  useEffect(() => { void api<{ workers: Player[] }>(`/api/workers?sort=${sort}`).then((body) => setWorkers(body.workers)).catch((reason: Error) => setError(reason.message)); }, [sort]);
  return <Shell active="/workers"><PageHeader eyebrow="PERSONNEL OFFICE / PUBLIC FILE" title="Night Shift Workers" description="Every useful action follows you. So do most injuries." aside={<label className="select-wrap">SORT RECORDS<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="contribution">Contribution</option><option value="xp">Experience</option><option value="moonDistance">Moon distance</option><option value="shifts">Shifts</option><option value="disasters">Disasters</option></select></label>}/>
    {!workers ? <LoadingPanel error={error}/> : <section className="table-panel panel"><div className="leader-row leader-head"><span>RANK / WORKER</span><span>GRADE</span><span>DEPARTMENT</span><span>CONTRIBUTION</span><span>MOON DIST.</span></div>{workers.map((worker, index) => <a className="leader-row" href={`/worker/${encodeURIComponent(worker.id)}`} key={worker.id}><span><i>{String(index + 1).padStart(2, "0")}</i><b>{worker.displayName}</b><small>{worker.activeTitle}</small></span><span>LVL {worker.level}</span><span className={`dept ${worker.department}`}>{worker.department}</span><strong>{fmt(worker.totalContribution)}</strong><span>{fmt(worker.moonDistance, 2)} KM</span></a>)}</section>}
  </Shell>;
}
