import { useEffect, useState } from "react";
import api from "../api/axios";
import { Outlet, useLocation } from "react-router-dom";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

// Header, footer and scroll reset for every page except the entry gate and the phone simulator.
export default function SiteLayout() {
  const { pathname } = useLocation();
  const [training, setTraining] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  // The backend says whether this is the training environment; every screen then carries a banner.
  useEffect(() => { api.get("/health").then(({ data }) => setTraining(data.mode === "training")).catch(() => {}); }, []);
  return (
    <>
      {training && <div role="note" className="training-banner">Training environment: practice data only. Nothing done here affects a real election.</div>}
      <SiteHeader />
      <main id="main-content" className="site-main" tabIndex={-1}>
        <Outlet />
      </main>
      <SiteFooter />
    </>
  );
}
