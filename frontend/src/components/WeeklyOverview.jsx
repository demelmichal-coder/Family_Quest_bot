// WeeklyOverview.jsx - Týdenní přehled: aktivita dětí po dnech, žebříček a odznaky.
import React, { useEffect, useMemo, useState } from "react";
import { useUser } from "../context/UserContext";

const DAY_LABELS = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
const MEDALS = ["🥇", "🥈", "🥉"];

export function buildDayLabels(today = new Date()) {
  // activity_days: index 0 = před 6 dny, index 6 = dnes
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - index));
    return DAY_LABELS[day.getDay()];
  });
}

export function badgesFor(activityDays) {
  const days = Array.isArray(activityDays) ? activityDays : [];
  const activeDays = days.filter((count) => count > 0).length;
  const badges = [];
  if (days.length === 7 && activeDays === 7) {
    badges.push("🔥 7 dní v řadě");
  } else if (activeDays >= 5) {
    badges.push("⭐ 5 aktivních dnů");
  }
  const total = days.reduce((sum, count) => sum + count, 0);
  if (total >= 10) {
    badges.push("🏅 10 úkolů za týden");
  }
  return badges;
}

export default function WeeklyOverview() {
  const { api } = useUser();
  const [stats, setStats] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [weekly, board] = await Promise.all([api("/game/family-weekly-stats"), api("/game/leaderboard")]);
        if (cancelled) return;
        setStats(Array.isArray(weekly?.children) ? weekly.children : []);
        setRanking(Array.isArray(board) ? board.filter((entry) => entry.role === "child") : []);
      } catch {
        if (!cancelled) {
          setStats([]);
          setRanking([]);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const labels = useMemo(() => buildDayLabels(), []);
  const maxCount = useMemo(
    () => Math.max(1, ...stats.flatMap((child) => child.activity_days || [0])),
    [stats]
  );

  if (!loaded || (stats.length === 0 && ranking.length === 0)) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900/90 p-4 shadow-xl" aria-label="Týdenní přehled">
      <h2 className="text-lg font-black text-white">Týdenní přehled</h2>

      {ranking.length > 0 ? (
        <ol className="mt-3 space-y-1" aria-label="Žebříček dětí">
          {ranking.map((entry, index) => (
            <li
              key={entry.id}
              className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-sm ${
                entry.is_me ? "border-cyan-400/60 bg-cyan-500/10" : "border-slate-700 bg-slate-950/60"
              }`}
            >
              <span className="font-bold text-white">
                <span aria-hidden="true">{MEDALS[index] || `${index + 1}.`}</span>{" "}
                {entry.username || "Dítě"}
                {entry.is_me ? " (ty)" : ""}
              </span>
              <span className="text-xs text-slate-300">
                {entry.xp} XP · {entry.completed_tasks} splněno
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {stats.map((child) => {
        const days = child.activity_days || [];
        const badges = badgesFor(days);
        return (
          <div key={child.user_id} className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-white">{child.username}</div>
              <div className="flex flex-wrap gap-1">
                {badges.map((badge) => (
                  <span key={badge} className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[11px] font-bold text-amber-100">
                    {badge}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-end gap-1" role="img" aria-label={`Splněné úkoly za posledních 7 dní: ${days.join(", ")}`}>
              {days.map((count, index) => (
                <div key={index} className="flex flex-1 flex-col items-center gap-1">
                  <div className="text-[10px] font-semibold text-slate-400">{count}</div>
                  <div className="flex h-16 w-full items-end rounded-md bg-slate-800">
                    <div
                      className="w-full rounded-md bg-cyan-400"
                      style={{ height: `${count > 0 ? Math.max(12, (count / maxCount) * 100) : 0}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-400">{labels[index]}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
