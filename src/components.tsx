import type { ReactNode } from "react";
import type { WorldState } from "../packages/shared/types";

export const fmt = (value: number, digits = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);

export function Shell({ children, active, compact = false }: { children: ReactNode; active: string; compact?: boolean }) {
  return <main className={`site-shell ${compact ? "compact-shell" : ""}`}>
    <header className="topbar">
      <a className="brand" href="/stream">MOONHAUL <small>CELESTIAL INFRASTRUCTURE DIVISION</small></a>
      <nav aria-label="Primary navigation">
        {[["/stream", "TWITCH OVERLAY"], ["/admin", "ADMIN"]].map(([href, label]) => <a className={active === href || (href === "/admin" && active === "admin") ? "active" : ""} href={href} key={href}>{label}</a>)}
      </nav>
      <div className="status-pill"><i /> TWITCH GAME ONLINE</div>
    </header>
    {children}
  </main>;
}

export function Meter({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const automaticTone = value > 92 ? "red" : value > 72 ? "amber" : "green";
  return <div className="meter-row"><span>{label}</span><div className="meter-track" aria-label={`${label} ${Math.round(value)}%`}><div className={`meter-fill ${tone ?? automaticTone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div><strong>{fmt(value)}%</strong></div>;
}

export function MachineVisual({ state, minimal = false }: { state: WorldState; minimal?: boolean }) {
  const top = 38 + (100 - Math.min(100, state.moon.altitude)) * (minimal ? 1.15 : 1.75);
  const cableTop = top + (minimal ? 84 : 116);
  return <div className={`sky-scene ${state.currentAlert ? "is-alert" : ""}`}>
    <div className="stars" />
    {!minimal && <div className="altitude-scale"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>}
    <div className="live-moon-wrap" style={{ top, transform: `translateX(-50%) scale(${state.moon.temporaryScale})` }}>
      <div className="moon"><i /><i /><i /></div>
      {state.moon.secondMoon && <div className="moon second"><i/><i/></div>}
      {!minimal && <div className="moon-readout">ALT. {fmt(state.moon.altitude, 1)} KM<br/><em>{state.moon.velocity < 0 ? "▼" : "▲"} {Math.abs(state.moon.velocity).toFixed(3)} M/S</em></div>}
    </div>
    <div className="cable" style={{ top: cableTop, height: Math.max(70, (minimal ? 470 : 410) - cableTop) }}><span /></div>
    <div className={`machine ${minimal ? "stream-machine" : ""}`}><div className="machine-stack"/><div className="machine-body"><b>WINCH III</b><span>MH–03–A</span><i/></div><div className="machine-base"/></div>
  </div>;
}

export function LoadingPanel({ error }: { error?: string }) {
  return <div className="loading-panel"><div className="spinner"/><b>CONTACTING NIGHT SHIFT</b><span>{error || "The machine is completing its forms."}</span></div>;
}

export function PageHeader({ eyebrow, title, description, aside }: { eyebrow: string; title: string; description: string; aside?: ReactNode }) {
  return <section className="page-heading"><div><small>{eyebrow}</small><h1>{title}</h1><p>{description}</p></div>{aside}</section>;
}
