"use client";

import { useState } from "react";
import Image from "next/image";
import { Send } from "lucide-react";
import { team, type TeamMember } from "./team-data";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase()).join("");
}

const handlePattern = /^[A-Za-z0-9._]{1,32}$/;

function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

function Socials({ member }: { member: TeamMember }) {
  const items = [
    member.telegram && handlePattern.test(member.telegram)
      ? { key: "telegram", label: "Telegram", href: `https://t.me/${member.telegram}`, icon: <Send size={16} /> }
      : null,
    member.instagram && handlePattern.test(member.instagram)
      ? { key: "instagram", label: "Instagram", href: `https://instagram.com/${member.instagram}`, icon: <InstagramIcon /> }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  if (!items.length) return null;
  return (
    <div className="team-links">
      {items.map(item => (
        <a key={item.key} href={item.href} target="_blank" rel="noopener noreferrer" aria-label={`${member.name} — ${item.label}`} className={`team-link ${item.key}`}>
          {item.icon}<span>{item.label}</span>
        </a>
      ))}
    </div>
  );
}

function Portrait({ member }: { member: TeamMember }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="team-photo">
      {member.photo && !failed ? (
        <Image src={member.photo} alt={member.name} width={320} height={320} onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initials(member.name)}</span>
      )}
    </div>
  );
}

export default function Team() {
  return (
    <section className="team" aria-labelledby="team-title">
      <div className="team-intro">
        <p className="discovery-kicker">JAMOA</p>
        <h2 id="team-title">Bir Ilm ortida turgan odamlar</h2>
        <p>Loyihani birgalikda yuritayotgan jamoa a&apos;zolari bilan tanishing.</p>
      </div>
      <ul className="team-grid">
        {team.map(member => (
          <li className="team-card" key={member.id}>
            <Portrait member={member} />
            <div className="team-body">
              <h3>{member.name}</h3>
              <span className="team-role">{member.role}</span>
              <p>{member.bio}</p>
              <Socials member={member} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
