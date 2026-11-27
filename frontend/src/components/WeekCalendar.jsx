// WeekCalendar.jsx - Úkoly po dnech v týdnu + export do kalendáře (.ics).
import React, { useMemo, useState } from "react";
import { buildIcs, buildWeekDays, dateKey, downloadTextFile, startOfWeek } from "../utils/calendar";

function formatShort(date) {
  return `${date.getDate()}. ${date.getMonth() + 1}.`;
}

export default function WeekCalendar({ tasks }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date());
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + weekOffset * 7);
  }, [weekOffset]);

  const days = useMemo(() => buildWeekDays(weekStart, tasks), [weekStart, tasks]);
  const todayKey = dateKey(new Date());
  const weekEnd = days[6].date;
  const hasAnything = days.some((day) => day.items.length > 0);

  function handleExport() {
    downloadTextFile("family-quest-ukoly.ics", buildIcs(tasks), "text/calendar;charset=utf-8");
  }

  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900/90 p-4 shadow-xl" aria-label="Kalendář týdne">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black text-white">Kalendář týdne</h2>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-full border border-cyan-400/60 px-3 py-1 text-xs font-bold text-cyan-100 hover:bg-cyan-500/10"
        >
          Do kalendáře (.ics)
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between text-sm text-slate-300">
        <button
          type="button"
          onClick={() => setWeekOffset((value) => value - 1)}
          aria-label="Předchozí týden"
          className="rounded-full border border-slate-600 px-3 py-1 text-xs font-bold hover:bg-slate-800"
        >
          ‹
        </button>
        <span className="font-semibold">
          {formatShort(weekStart)} – {formatShort(weekEnd)}
        </span>
        <button
          type="button"
          onClick={() => setWeekOffset((value) => value + 1)}
          aria-label="Další týden"
          className="rounded-full border border-slate-600 px-3 py-1 text-xs font-bold hover:bg-slate-800"
        >
          ›
        </button>
      </div>

      {!hasAnything ? <p className="mt-3 text-sm text-slate-400">Tenhle týden nejsou žádné úkoly s termínem.</p> : null}

      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((day) => (
          <li
            key={day.key}
            className={`rounded-2xl border p-2 ${
              day.key === todayKey ? "border-cyan-400/70 bg-cyan-500/10" : "border-slate-700 bg-slate-950/60"
            }`}
          >
            <div className="text-xs font-bold text-slate-200">
              {day.label} <span className="font-normal text-slate-400">{formatShort(day.date)}</span>
            </div>
            {day.items.length === 0 ? (
              <div className="mt-1 text-[11px] text-slate-500">—</div>
            ) : (
              <ul className="mt-1 space-y-1">
                {day.items.map((item) => (
                  <li
                    key={item.id}
                    className={`text-xs ${item.completed ? "text-slate-500 line-through" : "text-slate-100"}`}
                  >
                    {item.recurring ? <span aria-label="opakuje se">🔁 </span> : null}
                    {item.time ? <span className="text-slate-400">{item.time} </span> : null}
                    {item.title}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
