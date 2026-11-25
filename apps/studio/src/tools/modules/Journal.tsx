import { useMemo, useState } from "react";
import { LuDownload, LuFlag, LuMapPin, LuPlus, LuRotateCcw, LuSearch, LuTrash2 } from "react-icons/lu";
import {
  JournalState,
  JourneyState,
  KEYS,
  MapState,
  createEntry,
  journalMarkdown,
  purgeTrash,
  restoreEntry,
  searchEntries,
  tagCounts,
  trashEntry,
  type JournalEntry,
  type PlaceRef,
} from "@riptide/tools";
import { downloadText, usePersisted } from "../persist";
import { PageHeader, useShell } from "../ui";
import { HeaderRight } from "./common";
import { useMapData } from "../mapdata";

const journalDefault = () => JournalState.parse({});
const journeyDefault = () => JourneyState.parse({});
const mapDefault = () => MapState.parse({});
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const time = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

type Item =
  | { kind: "entry"; at: number; entry: JournalEntry }
  | { kind: "goal"; at: number; title: string; place?: PlaceRef }
  | { kind: "session"; at: number; done: number; of: number; minutes: number; notes: string };

/** Journal: your own notes and milestones, next to what you finished in Today, in one timeline. */
export function Journal() {
  const { go, toast } = useShell();
  const [j, setJ, err] = usePersisted(KEYS.journal, JournalState, journalDefault);
  const [today] = usePersisted(KEYS.journey, JourneyState, journeyDefault);
  const [m, setMap] = usePersisted(KEYS.map, MapState, mapDefault);
  const data = useMapData();
  const profileId = m.profiles.some((p) => p.id === m.activeProfile) ? m.activeProfile : m.profiles[0]!.id;
  const profile = m.profiles.find((p) => p.id === profileId)!;
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [milestone, setMilestone] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [onlyNotes, setOnlyNotes] = useState(false);

  const mine = useMemo(() => j.entries.filter((e) => e.profileId === profileId), [j.entries, profileId]);
  const found = useMemo(() => searchEntries(mine, q), [mine, q]);
  const tagsInUse = useMemo(() => tagCounts(mine).slice(0, 12), [mine]);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = found.map((e) => ({ kind: "entry", at: e.createdAt, entry: e }));
    if (!q && !onlyNotes) {
      for (const o of today.objectives) if (o.profileId === profileId && o.status === "done" && o.completedAt) list.push({ kind: "goal", at: o.completedAt, title: o.title, place: o.place });
      for (const s of today.sessions) if (s.profileId === profileId && s.endedAt) list.push({ kind: "session", at: s.endedAt, done: s.completed.length, of: s.queue.length, minutes: Math.round((s.endedAt - s.startedAt) / 60000), notes: s.notes });
    }
    return list.sort((a, b) => b.at - a.at).slice(0, 400);
  }, [found, today, profileId, q, onlyNotes]);

  const total = data.places?.records.length ?? 0;
  const goalsDone = today.objectives.filter((o) => o.profileId === profileId && o.status === "done").length;
  const goalsOpen = today.objectives.filter((o) => o.profileId === profileId && o.status !== "done").length;
  const sessions = today.sessions.filter((s) => s.profileId === profileId && s.endedAt);
  const minutes = sessions.reduce((n, s) => n + Math.round((s.endedAt! - s.startedAt) / 60000), 0);

  const add = () => {
    if (!title.trim() && !body.trim()) return;
    const t = tags.split(/[,\s]+/).map((x) => x.replace(/^#/, "").trim()).filter(Boolean).slice(0, 12);
    setJ((d) => {
      d.entries.push(createEntry({ profileId, title: title.trim(), body: body.trim(), tags: t, kind: milestone ? "milestone" : "note" }));
      purgeTrash(d);
    });
    setTitle("");
    setBody("");
    setTags("");
    setMilestone(false);
  };

  const showOnMap = (p: PlaceRef) => {
    setMap((d) => {
      d.selectedId = p.placeId;
      d.view = { x: p.x, y: p.y, z: Math.max(d.view.z, 3.2) };
    });
    go("map");
  };

  let lastDay = "";
  return (
    <div className="rt-page">
      <PageHeader crumb="Journal" title="Keep the story of your run." sub="Notes, milestones and what you finished in Today, in one timeline. Everything here is yours: RipTide only records what you write or tick." right={<HeaderRight />} />
      {err && <div className="rt-banner rt-warn" role="alert" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="rt-stats" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <div className="rt-panel rt-stat"><div className="rt-stat-label">Places found</div><div className="rt-stat-v">{profile.found.length}<small>of {total} mapped</small></div></div>
        <div className="rt-panel rt-stat"><div className="rt-stat-label">Goals done</div><div className="rt-stat-v">{goalsDone}<small>{goalsOpen} open</small></div></div>
        <div className="rt-panel rt-stat"><div className="rt-stat-label">Sessions</div><div className="rt-stat-v">{sessions.length}<small>{minutes} min</small></div></div>
        <div className="rt-panel rt-stat"><div className="rt-stat-label">Journal</div><div className="rt-stat-v">{mine.length}<small>{mine.filter((e) => e.kind === "milestone").length} milestones</small></div></div>
      </div>
      <p className="rt-hint">Places are the community-mapped list from gtadb.org for {profile.name}, not a complete list of everything in the game, so there's no 100% here.</p>

      <div className="rt-today" style={{ marginTop: 24 }}>
        <section className="rt-panel rt-pad" aria-labelledby="rt-jn-tl">
          <div className="rt-td-head" style={{ marginTop: 0 }}>
            <h2 id="rt-jn-tl">Timeline</h2>
            <label className="rt-check" style={{ minHeight: 0, fontSize: 13.5 }}><input type="checkbox" checked={onlyNotes} onChange={(e) => setOnlyNotes(e.target.checked)} />Only my notes</label>
          </div>
          <div className="rt-search">
            <LuSearch className="rt-jn-sicon" aria-hidden="true" />
            <label className="rt-sr" htmlFor="rt-jn-q">Search the journal</label>
            <input id="rt-jn-q" className="rt-input" placeholder="Search, or #tag" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {tagsInUse.length > 0 && (
            <div className="rt-pill-row" style={{ marginTop: 10 }}>
              {tagsInUse.map(([t, n]) => <button key={t} className={`rt-td-chip${q === `#${t}` ? " rt-on" : ""}`} onClick={() => setQ(q === `#${t}` ? "" : `#${t}`)}>#{t} <span className="rt-hint" style={{ margin: 0 }}>{n}</span></button>)}
            </div>
          )}
          {items.length === 0 ? (
            <div className="rt-td-empty" style={{ marginTop: 14 }}>{q ? "Nothing matches that search." : "Nothing here yet. Write a note on the right, save a place from the map, or finish a goal in Today."}</div>
          ) : (
            <ol className="rt-jn-list">
              {items.map((it, i) => {
                const d = day(it.at);
                const head = d !== lastDay ? <li key={`d${i}`} className="rt-jn-day">{d}</li> : null;
                lastDay = d;
                return [
                  head,
                  <li key={it.kind === "entry" ? it.entry.id : `${it.kind}${it.at}${i}`} className={`rt-jn-item rt-jn-${it.kind}${it.kind === "entry" && it.entry.kind === "milestone" ? " rt-jn-ms" : ""}`}>
                    <span className="rt-jn-time">{time(it.at)}</span>
                    <div className="rt-td-body">
                      {it.kind === "entry" ? (
                        <>
                          <div className="rt-td-title">{it.entry.kind === "milestone" && <LuFlag aria-label="Milestone" />}{it.entry.title || (it.entry.place ? it.entry.place.label : "Note")}</div>
                          {it.entry.body && <p className="rt-jn-body">{it.entry.body}</p>}
                          {(it.entry.tags.length > 0 || it.entry.place) && (
                            <div className="rt-pill-row" style={{ marginTop: 6 }}>
                              {it.entry.place && <button className="rt-badge rt-sea rt-jn-place" onClick={() => showOnMap(it.entry.place!)}><LuMapPin />{it.entry.place.label}</button>}
                              {it.entry.tags.map((t) => <button key={t} className="rt-badge" onClick={() => setQ(`#${t}`)}>#{t}</button>)}
                            </div>
                          )}
                        </>
                      ) : it.kind === "goal" ? (
                        <div className="rt-td-title">Finished: {it.title}</div>
                      ) : (
                        <>
                          <div className="rt-td-title">Session: {it.done} of {it.of} done in {it.minutes} min</div>
                          {it.notes && <p className="rt-jn-body">{it.notes}</p>}
                        </>
                      )}
                    </div>
                    {it.kind === "entry" && <button className="rt-iconbtn" aria-label={`Delete ${it.entry.title || "note"}`} onClick={() => { setJ((d) => trashEntry(d, it.entry.id)); toast("Moved to recently deleted"); }}><LuTrash2 /></button>}
                    {it.kind === "goal" && it.place && <button className="rt-iconbtn" aria-label={`Show ${it.title} on the map`} onClick={() => showOnMap(it.place!)}><LuMapPin /></button>}
                  </li>,
                ];
              })}
            </ol>
          )}
        </section>

        <div className="rt-today-side">
          <section className="rt-panel rt-pad" aria-labelledby="rt-jn-new">
            <h2 id="rt-jn-new">Write something</h2>
            <form onSubmit={(e) => { e.preventDefault(); add(); }} style={{ marginTop: 12 }}>
              <label className="rt-sr" htmlFor="rt-jn-title">Title</label>
              <input id="rt-jn-title" className="rt-input" maxLength={120} placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <label className="rt-sr" htmlFor="rt-jn-body">Note</label>
              <textarea id="rt-jn-body" className="rt-textarea" style={{ marginTop: 8, minHeight: 110 }} maxLength={4000} placeholder="What happened, what to try next time…" value={body} onChange={(e) => setBody(e.target.value)} />
              <label className="rt-sr" htmlFor="rt-jn-tags">Tags</label>
              <input id="rt-jn-tags" className="rt-input" style={{ marginTop: 8 }} placeholder="Tags, like heist, cars" value={tags} onChange={(e) => setTags(e.target.value)} />
              <label className="rt-check" style={{ marginTop: 6 }}><input type="checkbox" checked={milestone} onChange={(e) => setMilestone(e.target.checked)} />This is a milestone</label>
              <div className="rt-td-actions" style={{ marginTop: 8 }}>
                <button className="rt-btn rt-primary" type="submit" disabled={!title.trim() && !body.trim()}><LuPlus />Add to journal</button>
              </div>
            </form>
          </section>
          <section className="rt-panel rt-pad" aria-labelledby="rt-jn-keep">
            <h2 id="rt-jn-keep">Keep a copy</h2>
            <p className="rt-hint">Your journal is in RipTide's backups (Settings). You can also download it to read anywhere.</p>
            <div className="rt-td-actions" style={{ marginTop: 8 }}>
              <button className="rt-btn rt-sm" disabled={!mine.length} onClick={() => downloadText("riptide-journal.md", journalMarkdown(mine, `RipTide journal: ${profile.name}`), "text/markdown")}><LuDownload />Download as text</button>
              <button className="rt-btn rt-sm rt-ghost" onClick={() => setShowTrash(!showTrash)}>Recently deleted ({j.trash.length})</button>
            </div>
            {showTrash && (
              j.trash.length === 0 ? <p className="rt-hint">Nothing deleted in the last 30 days.</p> : (
                <ul className="rt-td-goals">
                  {j.trash.map((e) => (
                    <li key={e.id}>
                      <div className="rt-td-body"><div className="rt-td-title">{e.title || e.place?.label || e.body.slice(0, 60) || "Note"}</div><div className="rt-td-why">Deleted {day(e.deletedAt)}</div></div>
                      <button className="rt-btn rt-sm" onClick={() => setJ((d) => restoreEntry(d, e.id))}><LuRotateCcw />Restore</button>
                    </li>
                  ))}
                </ul>
              )
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
