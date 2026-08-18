import { useEffect, useState } from "react";
import { LoadingPanel, MachineVisual, Meter, fmt } from "../components";
import { useLiveState } from "../hooks";

function PausedStream({ data }: { data: NonNullable<ReturnType<typeof useLiveState>["data"]> }) {
  const { state } = data;
  const velocityDirection = state.moon.velocity < 0 ? "▼" : state.moon.velocity > 0 ? "▲" : "■";
  const pausedAt = state.pausedAt
    ? new Date(state.pausedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "RECENTLY";
  const stats = [
    ["LUNAR ALTITUDE", `${fmt(state.moon.altitude, 2)} KM`],
    ["LAST VELOCITY", `${velocityDirection} ${Math.abs(state.moon.velocity).toFixed(3)} M/S`],
    ["TARGET ALTITUDE", `${fmt(state.moon.targetAltitude, 1)} KM`],
    ["TOTAL HAUL PROGRESS", `${fmt(state.moon.haulProgress, 2)} KM`],
    ["INSTABILITY", `${fmt(state.moon.instability, 1)}%`],
    ["ANOMALY LEVEL", `${fmt(state.moon.anomalyLevel, 1)} / 10`],
  ];

  return <main className="stream-root paused-stream-root">
    <div className="paused-backdrop" aria-hidden="true" />
    <header><div className="brand">MOONHAUL <small>CELESTIAL INFRASTRUCTURE DIVISION</small></div><div className="paused-header-state"><i /> ADMINISTRATIVE HOLD</div></header>
    <section className="paused-stage">
      <div className="paused-copy">
        <span className="paused-kicker">NIGHT OPERATIONS BULLETIN / SHIFT {state.world.currentShift}</span>
        <h1>NIGHT SHIFT<br/>PAUSED</h1>
        <p>All lunar movement and worker commands are temporarily suspended. The Moon remains secured at its last recorded position.</p>
        <div className="paused-time"><span>HOLD ISSUED</span><b>{pausedAt}</b></div>
      </div>
      <div className="paused-telemetry">
        <div className="paused-telemetry-head"><span>CURRENT MOON STATUS</span><small>FROZEN LIVE TELEMETRY</small></div>
        <div className="paused-stat-grid">{stats.map(([label, value]) => <div className="paused-stat" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
        <div className="paused-condition"><span>MASS CONDITION</span><b>{state.moon.massModifier > 1.2 ? "ABOVE MUNICIPAL TOLERANCE" : "NOMINAL-ISH"}</b></div>
      </div>
    </section>
    <footer><span className="paused-footer-status"><i/> NIGHT SHIFT PAUSED</span><div className="ticker">CHAT WORK COMMANDS HELD · TELEMETRY REMAINS AVAILABLE · AWAIT SUPERVISOR CLEARANCE</div><span>{data.playerCount} WORKERS OFF CLOCK</span></footer>
  </main>;
}

export function StreamPage() {
  const { data, error } = useLiveState();
  const [, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  if (!data) return <div className="stream-loading"><LoadingPanel error={error}/></div>;
  const { state, activeEvent } = data;
  if (state.paused) return <PausedStream data={data}/>;
  const remaining = state.activeEvent ? Math.max(0, Math.ceil((new Date(state.activeEvent.endsAt).getTime() - Date.now()) / 1000)) : 0;
  const mainCommand = activeEvent?.choices[0]?.command ?? "haul";
  return <main className={`stream-root ${state.currentAlert ? "stream-alert" : ""}`}>
    <header><div className="brand">MOONHAUL <small>CELESTIAL INFRASTRUCTURE DIVISION</small></div><div className="stream-shift">SHIFT {state.world.currentShift} <b>•</b> ALT {fmt(state.moon.altitude, 1)} KM</div></header>
    <section className="stream-stage"><MachineVisual state={state} minimal/><div className="stream-readout"><span>LUNAR VELOCITY</span><b className={state.moon.velocity < 0 ? "danger" : ""}>{state.moon.velocity < 0 ? "▼" : "▲"} {Math.abs(state.moon.velocity).toFixed(3)} M/S</b></div></section>
    <section className="stream-order">
      <div className="stream-order-copy"><small>{activeEvent ? `${activeEvent.rarity.toUpperCase()} ORDER` : "STANDING ORDER"}</small><h1>{activeEvent?.name ?? "HAUL THE MOON"}</h1><p>{activeEvent?.description ?? "Winch III is accepting authorized labor."}</p></div>
      <div className="stream-command"><small>TYPE IN CHAT</small><strong>!{mainCommand.toUpperCase()}</strong><span>{activeEvent ? `${remaining} SECONDS` : "PULL THE MOON UPWARD"}</span></div>
      <div className="stream-meters"><Meter label="HEAT" value={state.machine.heat}/><Meter label="PRESSURE" value={state.machine.pressure}/><Meter label="POWER" value={state.machine.power} tone={state.machine.power < 30 ? "red" : "green"}/><Meter label="TENSION" value={state.machine.cableTension}/></div>
    </section>
    <footer><span className="stream-live"><i/> {data.playerCount} WORKERS REGISTERED</span><div className="ticker">{state.recentActions.slice(0, 3).map((item) => item.text).join("  •  ")}</div><span>INCIDENTS: {state.world.disastersSurvived}</span></footer>
  </main>;
}
