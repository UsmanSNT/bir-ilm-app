"use client";
/* eslint-disable @next/next/no-img-element -- admin yuklagan data URL suratlar */

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import type { TeamMember } from "@/lib/team";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join("");
}

function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

function Portrait({ member }: { member: TeamMember }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="team-photo">
      {member.photo && !failed ? (
        <img src={member.photo} alt={member.name} width={320} height={320} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initials(member.name)}</span>
      )}
    </div>
  );
}

// Foydalanuvchi nomi serverda tekshirilgan; bu yerda havola faqat qat'iy domenlarga yasaladi.
function Socials({ member }: { member: TeamMember }) {
  if (!member.telegram && !member.instagram) return null;
  return (
    <div className="team-links">
      {member.telegram && (
        <a className="team-link telegram" href={`https://t.me/${encodeURIComponent(member.telegram)}`} target="_blank" rel="noopener noreferrer" aria-label={`${member.name} — Telegram`}>
          <Send size={16} /><span>Telegram</span>
        </a>
      )}
      {member.instagram && (
        <a className="team-link instagram" href={`https://instagram.com/${encodeURIComponent(member.instagram)}`} target="_blank" rel="noopener noreferrer" aria-label={`${member.name} — Instagram`}>
          <InstagramIcon /><span>Instagram</span>
        </a>
      )}
    </div>
  );
}

export default function Team() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/team", { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ members: TeamMember[] }>) : Promise.reject(new Error())))
      .then((payload) => setMembers(payload.members))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true);
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="team" aria-labelledby="team-title">
      <div className="team-intro">
        <p className="discovery-kicker">JAMOA</p>
        <h2 id="team-title">Bir Ilm ortida turgan odamlar</h2>
        <p>Loyihani birgalikda yuritayotgan jamoa a&apos;zolari bilan tanishing.</p>
      </div>
      {error ? (
        <p className="team-status" role="alert">Jamoa yuklanmadi. Keyinroq urinib ko&apos;ring.</p>
      ) : members === null ? (
        <p className="team-status">Yuklanmoqda…</p>
      ) : members.length === 0 ? (
        <p className="team-status">Jamoa ma&apos;lumotlari tez orada qo&apos;shiladi.</p>
      ) : (
        <ul className="team-grid">
          {members.map((member) => (
            <li className="team-card" key={member.id}>
              <Portrait member={member} />
              <div className="team-body">
                <h3>{member.name}</h3>
                {member.role && <span className="team-role">{member.role}</span>}
                {member.bio && <p>{member.bio}</p>}
                <Socials member={member} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
