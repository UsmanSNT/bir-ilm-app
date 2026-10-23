"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- saytga to'liq sahifa yuklanishi bilan qaytamiz */

import { useState } from "react";
import { Toaster } from "sonner";
import AboutPanel from "./about-panel";
import TeamPanel from "./team-panel";

const sections = [
  ["team", "Jamoa"],
  ["about", "Biz haqimizda"],
] as const;

type Section = (typeof sections)[number][0];

export default function AdminDashboard({ email }: { email: string }) {
  const [section, setSection] = useState<Section>("team");

  return (
    <main className="admin">
      <Toaster position="top-center" richColors />
      <header className="admin-head">
        <div>
          <p className="discovery-kicker">ADMIN PANEL</p>
          <h1>Bir Ilm boshqaruvi</h1>
          <small>{email}</small>
        </div>
        <a href="/" className="admin-link">Saytga qaytish</a>
      </header>

      <div className="admin-tabs" role="tablist" aria-label="Bo'limlar">
        {sections.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            id={`admin-tab-${id}`}
            aria-selected={section === id}
            aria-controls={`admin-panel-${id}`}
            className={section === id ? "is-active" : undefined}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`admin-panel-${section}`} aria-labelledby={`admin-tab-${section}`}>
        {section === "team" ? <TeamPanel /> : <AboutPanel />}
      </div>
    </main>
  );
}
