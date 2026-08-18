import { useEffect, useState } from "react";
import { LoadingPanel, MachineVisual, Meter, Shell, fmt } from "../components";
import { useLiveState } from "../hooks";

function Countdown({ end }: { end?: string }) {
  const [, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const remaining = end ? Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 1000)) : 0;
  return <>{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</>;
}

export function Dashboard() {
  const { data, connected, error } = useLiveState();
  if (!data) return <Shell active="/"><LoadingPanel error={error}/></Shell>;
  const { state, activeEvent } = data;
  const choices = activeEvent?.choices ?? [
    { command: "haul", label: "Pull the Moon upward" }, { command: "stoke", label: "Feed the boiler" }, { command: "cool", label: "Reduce machine heat" }, { command: "tune", label: "Improve efficiency" },
  ];
  const primary = choices[0];
  const activeVotes = state.activeEvent ? Object.values(state.activeEvent.votes).reduce((total, vote) => total + vote.users.length, 0) : 0;
  return <Shell active="/">
    <section className="notice-strip"><span>⚠ MUNICIPAL LUNAR ADVISORY</span>THE MOON IS FALLING. CHAT IS OPERATING THE MACHINE.<b>SHIFT {state.world.currentShift} · {connected ? "LIVE LINK" : "RECONNECTING"}</b></section>
    <section className="dashboard-grid">
      <div className="sky-panel panel">
        <div className="panel-label">LUNAR TRACTION ARRAY / CAMERA 01</div>
        <MachineVisual state={state}/>
        <div className="sky-stats"><div><small>TOTAL HAULED</small><strong>{fmt(state.world.totalDistanceHauled, 1)} KM</strong></div><div><small>LUNAR MASS</small><strong>{state.moon.massModifier > 1.2 ? "UNHELPFUL" : "NOMINAL-ISH"}</strong></div><div><small>SHIFTS SURVIVED</small><strong>{fmt(state.world.totalShiftsSurvived)}</strong></div></div>
      </div>
      <aside className={`orders-panel panel ${activeEvent ? "has-event" : ""}`}>
        <div className="order-head"><span>{activeEvent ? "ACTIVE ORDER" : "STANDING ORDER"}</span><b>{activeEvent && <Countdown end={state.activeEvent?.endsAt}/>}</b></div>
        <div className="alert-code">{activeEvent ? `${activeEvent.rarity.toUpperCase()} / ${activeEvent.id.toUpperCase()}` : "PRIORITY 04 / GENERAL"}</div>
        <h1>{activeEvent?.name ?? "KEEP THE MOON MOVING"}</h1>
        <p>{activeEvent?.description ?? "The night is long, the cable is older than language, and your shift has only just begun."}</p>
        {primary && <div className="command-card"><small>CHAT: ISSUE COMMAND</small><strong>!{primary.command.toUpperCase()}</strong><span>{primary.label}</span></div>}
        <div className="response-row"><span>RESPONSE</span><b>{activeEvent ? `${activeVotes} WORKERS` : `${data.playerCount} REGISTERED`}</b></div>
        <div className="segmented">{Array.from({ length: 10 }, (_, index) => <i key={index} className={index < Math.min(10, Math.ceil(activeVotes / 2)) ? "" : "off"}/>)}</div>
        <div className="order-options">{choices.slice(1).map((choice) => <span key={choice.command}><code>!{choice.command}</code>{choice.label}</span>)}</div>
      </aside>
      <section className="systems-panel panel">
        <div className="section-head"><span>MACHINE SYSTEMS</span><small>AUTO REFRESH / 1S</small></div>
        <Meter label="INTEGRITY" value={state.machine.integrity}/><Meter label="HEAT" value={state.machine.heat}/><Meter label="PRESSURE" value={state.machine.pressure}/><Meter label="POWER" value={state.machine.power} tone={state.machine.power < 35 ? "red" : "green"}/><Meter label="TENSION" value={state.machine.cableTension}/>
        <div className="system-note">AUTOPILOT: <b>{state.moon.altitude < 24 ? "ENGAGED" : "STANDING BY"}</b> · THE SKELETON CREW IS {state.moon.altitude < 24 ? "WORKING" : "AVAILABLE"}</div>
      </section>
      <section className="resources-panel panel"><div className="section-head"><span>SHIFT INVENTORY</span><small>AUTHORIZED USE ONLY</small></div><div className="resource-grid">
        <div><small>FUEL</small><strong>{fmt(state.resources.fuel)}</strong><em>KG</em></div><div><small>COOLANT</small><strong>{fmt(state.resources.coolant)}</strong><em>L</em></div><div><small>SCRAP</small><strong>{fmt(state.resources.scrap)}</strong><em>PCS</em></div><div><small>MOONLIGHT</small><strong>{fmt(state.resources.moonlight)}</strong><em>VIALS</em></div>
      </div></section>
      <section className="feed-panel panel"><div className="section-head"><span>OPERATIONS LOG</span><a href="/history">VIEW ALL INCIDENTS →</a></div>{state.recentActions.slice(0, 4).map((item) => <div className={`feed-line ${item.kind.includes("catastrophe") || item.kind.includes("failure") ? "alert" : ""}`} key={`${item.at}-${item.text}`}><time>{new Date(item.at).toLocaleTimeString([], { hour12:false, hour:"2-digit", minute:"2-digit", second:"2-digit" })}</time><span>{item.text}</span></div>)}</section>
    </section>
    <footer><span><i/> {data.playerCount} REGISTERED WORKERS</span><p>MAINTENANCE TIP 071: DO NOT ACKNOWLEDGE A SECOND FOREMAN.</p><a href="/stream">OPEN STREAM VIEW ↗</a></footer>
  </Shell>;
}
