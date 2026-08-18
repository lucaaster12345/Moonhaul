import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Dashboard } from "./pages/Dashboard";
import { StreamPage } from "./pages/Stream";
import { WorkersPage } from "./pages/Workers";
import { WorkerPage } from "./pages/Worker";
import { HistoryPage } from "./pages/History";
import { AboutPage } from "./pages/About";
import { AdminPage } from "./pages/Admin";

function Router() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/stream") return <StreamPage/>;
  if (path === "/workers") return <WorkersPage/>;
  if (path.startsWith("/worker/")) return <WorkerPage id={decodeURIComponent(path.slice(8))}/>;
  if (path === "/history") return <HistoryPage/>;
  if (path === "/about") return <AboutPage/>;
  if (path === "/admin") return <AdminPage/>;
  return <Dashboard/>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Router/></StrictMode>);
