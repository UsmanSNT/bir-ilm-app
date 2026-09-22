"use client";

import { useState } from "react";
import { ArrowLeft, Camera, CameraOff, Hand, LogOut, MessageCircle, Mic, MicOff, MonitorUp, Radio, Send, Users, X } from "lucide-react";

type View = "video" | "screen" | "audio";
const names = ["Madina", "Aziz", "Nilufar", "Sardor", "Sevinch", "Jahongir", "Zarifa", "Temur", "Dilshoda"];
const photos = [0, 1, 3, 4, 6, 7, 8, 5, 2];
function Portrait({ index }: { index: number }) {
  const photo = photos[index];
  return <span className="live-portrait" style={{ backgroundPosition: `${(photo % 3) * 50}% ${Math.floor(photo / 3) * 50}%` }} />;
}

export default function LiveSession({ name, date }: { name: string; date: number; onComments: () => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("video");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [handRaised, setHandRaised] = useState(false);
  const [draft, setDraft] = useState("");
  const [comments, setComments] = useState([
    { name: "Samandar", text: "Kichik odatlar katta natija beradi.", index: 7, time: "18:40" },
    { name: "Nilufar", text: "Men ham shu usulni sinab ko‘rdim.", index: 2, time: "18:41" },
    { name: "Aziz", text: "Bu bobni yana muhokama qilamizmi?", index: 1, time: "18:42" },
    { name: "Madina", text: "Albatta, savollaringizni yozing.", index: 0, time: "18:42" },
  ]);
  function sendComment() {
    if (!draft.trim()) return;
    setComments([...comments, { name, text: draft.trim(), index: 8, time: new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" }) }]);
    setDraft("");
  }
  const controls = [
    { label: "Mikrofon", icon: micOn ? Mic : MicOff, active: micOn, action: () => setMicOn(!micOn) },
    { label: "Kamera", icon: cameraOn ? Camera : CameraOff, active: cameraOn, action: () => setCameraOn(!cameraOn) },
    { label: "Ekran ulashish", icon: MonitorUp, active: view === "screen", action: () => setView(view === "screen" ? "video" : "screen") },
    { label: "Qo‘l ko‘tarish", icon: Hand, active: handRaised, action: () => setHandRaised(!handRaised) },
    { label: "Izohlar", icon: MessageCircle, active: commentsOpen, action: () => setCommentsOpen(!commentsOpen) },
  ];
  return <>
    <section className="live-card">
      <div className="live-heading"><span className="live-icon"><Radio size={24} /></span><div><span className="eyebrow">HAFTALIK ONLAYN MUHOKAMA</span><h3>Atom odatlar — birga tahlil qilamiz</h3></div></div>
      <p className="session-date">{date ? new Date(date).toLocaleDateString("uz-UZ", { weekday: "long", day: "numeric", month: "long" }) : "Yakshanba"} · 18:00</p>
      <p className="session-status">Kitob haqida jonli fikr almashing.</p>
      <button className="button" onClick={() => setOpen(true)}>Suhbatga qo‘shilish</button>
    </section>
    {open && <div className="live-overlay" role="dialog" aria-modal="true" aria-label="Atom odatlar jonli suhbat">
      <div className="live-window">
        <header className="live-topbar"><button className="live-plain-btn" aria-label="Suhbat oynasini yopish" onClick={() => setOpen(false)}><ArrowLeft size={22} /></button><div className="live-room-title"><strong>Atom odatlar</strong><span>Kitob muhokamasi</span></div><span className="live-indicator"><i /> LIVE</span><span className="live-count"><Users size={14} /> 24</span><time>18:42</time></header>
        <div className="live-main">
          {view === "video" && <div className="live-video-view"><div className="live-video-grid">{names.slice(0, 4).map((person, index) => <div className={`live-video-tile ${index === 0 ? "speaking" : ""}`} key={person}><Portrait index={index} /><div className="live-video-label"><strong>{person}</strong>{index === 0 ? <span className="live-level">▂▅▃</span> : <MicOff size={15} />}</div></div>)}</div><div className="live-avatar-strip">{names.slice(4).map((person, index) => <Portrait key={person} index={index + 4} />)}<span className="live-more">+20</span></div></div>}
          {view === "screen" && <div className="live-screen-view"><div className="live-share-banner"><MonitorUp size={17} /><Portrait index={0} /> Madina ekranini ulashmoqda</div><div className="live-shared-slide"><div className="live-slide-heading">ATOM ODATLAR <small>Kichik o‘zgarishlar, katta natijalar</small></div><div className="live-slide-body"><div className="live-book-cover"><strong>ATOM<br />ODATLAR</strong><small>Kichik o‘zgarishlar,<br />katta natijalar</small><span>JAMES CLEAR</span></div><ol><li><strong>Aniq qiling</strong><small>Maqsadni ravshan qiling.</small></li><li><strong>Jozibali qiling</strong><small>Uni jozibador qiling.</small></li><li><strong>Oson qiling</strong><small>Boshlashni osonlashtiring.</small></li><li><strong>Qoniqarli qiling</strong><small>Natijani his qiling.</small></li></ol></div></div><div className="live-speaker-strip">{names.slice(0, 4).map((person, index) => <div key={person}><Portrait index={index} /><span>{person}</span></div>)}</div></div>}
          {view === "audio" && <div className="live-audio-view"><h3>Gapirayotganlar (2)</h3><div className="live-speakers">{[0, 3].map(index => <div key={index}><Portrait index={index} /><strong>{names[index]}</strong>{index === 0 && <small>Boshlovchi</small>}</div>)}</div><h3>Tinglovchilar (7)</h3><div className="live-listeners">{[1, 2, 4, 5, 6, 7, 8].map(index => <div key={index}><Portrait index={index} /><strong>{names[index]}</strong><MicOff size={13} /></div>)}</div><span className="live-queue"><Hand size={16} /> {handRaised ? "Navbatdasiz" : "Qo‘l ko‘tarib navbatga turing"}</span></div>}
          {commentsOpen && <aside className="live-comments"><div className="live-comments-head"><strong>Jonli izohlar</strong><button className="live-plain-btn" aria-label="Izohlarni yopish" onClick={() => setCommentsOpen(false)}><X size={20} /></button></div><div className="live-comment-list">{comments.map((comment, index) => <div className="live-comment" key={index}><Portrait index={comment.index} /><div><strong>{comment.name}</strong><time>{comment.time}</time><p>{comment.text}</p></div></div>)}</div><form className="live-comment-form" onSubmit={event => { event.preventDefault(); sendComment(); }}><input aria-label="Izoh yozing" placeholder="Izoh yozing..." value={draft} onChange={event => setDraft(event.target.value)} /><button aria-label="Izoh yuborish" disabled={!draft.trim()}><Send size={18} /></button></form></aside>}
        </div>
        <footer className="live-controls"><div className="live-view-switch" role="group" aria-label="Suhbat ko‘rinishi"><button className={view === "video" ? "selected" : ""} onClick={() => setView("video")}>Video</button><button className={view === "audio" ? "selected" : ""} onClick={() => setView("audio")}>Ovozli</button></div><div className="live-control-actions">{controls.map(({ label, icon: Icon, active, action }) => <button className={active ? "active" : ""} key={label} onClick={action} aria-label={label} title={label}><span><Icon size={20} /></span><small>{label}</small></button>)}<button className="live-hangup" onClick={() => setOpen(false)} aria-label="Suhbatdan chiqish" title="Suhbatdan chiqish"><span><LogOut size={20} /></span><small>Chiqish</small></button></div></footer>
        <p className="live-demo-note">Ko‘rinish sinovi: ovoz va video uzatilmaydi.</p>
      </div>
    </div>}
  </>;
}
