import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { StreamPage } from "./pages/Stream";
import { AdminPage } from "./pages/Admin";

function Router() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/stream") return <StreamPage/>;
  if (path === "/admin") return <AdminPage/>;
  if (path !== "/stream") window.history.replaceState({}, "", "/stream");
  return <StreamPage/>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Router/></StrictMode>);
