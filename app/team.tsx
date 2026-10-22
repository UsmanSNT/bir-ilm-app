"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { team, type TeamMember } from "./team-data";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase()).join("");
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
              {member.links?.length ? (
                <div className="team-links">
                  {member.links.map(link => (
                    <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
                      {link.label}<ArrowUpRight size={14} />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
