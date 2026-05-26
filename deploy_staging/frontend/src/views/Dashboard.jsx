import React, { useMemo, useState } from "react";
import { DASHBOARD_MESSAGES } from "../constants/messages";
import {
  DASHBOARD_TAB_FAMILY,
  DASHBOARD_TAB_MISSIONS,
  DASHBOARD_TAB_SHOP,
  DASHBOARD_TABS,
} from "../constants/ui";
import { useUser } from "../context/UserContext";
import Avatar from "../components/Avatar";
import ConfettiReward from "../components/ConfettiReward";
import ProgressBar from "../components/ProgressBar";
import TaskCard from "../components/TaskCard";
import Shop from "./Shop";
import { getErrorMessage } from "../utils/errors";

const LEAGUE_STYLES = {
  bronze: {
    name: "Bronze liga",
    badge: "border-amber-600/40 bg-amber-500/20 text-amber-100",
    rankCard: "border-amber-300 bg-amber-50",
    heroGlow: "from-amber-500/25 via-orange-500/10 to-slate-900/80",
  },
  silver: {
    name: "Silver liga",
    badge: "border-slate-300/60 bg-slate-200/15 text-slate-100",
    rankCard: "border-slate-300 bg-slate-50",
    heroGlow: "from-slate-400/30 via-cyan-400/10 to-slate-900/80",
  },
  gold: {
    name: "Gold liga",
    badge: "border-yellow-300/70 bg-yellow-300/20 text-yellow-100",
    rankCard: "border-yellow-300 bg-yellow-50",
    heroGlow: "from-yellow-300/30 via-amber-400/10 to-slate-900/80",
  },
  diamond: {
    name: "Diamond liga",
    badge: "border-cyan-300/70 bg-cyan-300/20 text-cyan-100",
    rankCard: "border-cyan-300 bg-cyan-50",
    heroGlow: "from-cyan-300/30 via-blue-400/10 to-slate-900/80",
  },
  mythic: {
    name: "Mythic liga",
    badge: "border-fuchsia-300/70 bg-fuchsia-300/20 text-fuchsia-100",
    rankCard: "border-fuchsia-300 bg-fuchsia-50",
    heroGlow: "from-fuchsia-400/30 via-violet-400/10 to-slate-900/80",
  },
};

const AVATAR_RARITY_STYLES = {
  common: {
    name: "Common",
    badge: "border-slate-300/60 bg-slate-200/20 text-slate-100",
  },
  rare: {
    name: "Rare",
    badge: "border-cyan-300/70 bg-cyan-300/20 text-cyan-100",
  },
  epic: {
    name: "Epic",
    badge: "border-violet-300/70 bg-violet-300/20 text-violet-100",
  },
  legendary: {
    name: "Legendary",
    badge: "border-yellow-300/80 bg-yellow-300/20 text-yellow-100",
  },
};

function getLeagueByXp(xp = 0) {
  if (xp >= 800) return "mythic";
  if (xp >= 500) return "diamond";
  if (xp >= 250) return "gold";
  if (xp >= 100) return "silver";
  return "bronze";
}

function getAvatarRarity(avatarValue) {
  if (!avatarValue) return "common";
  if (typeof avatarValue === "string" && avatarValue.startsWith("data:image")) {
    return "legendary";
  }
  if (["🤖", "🦁", "🐼"].includes(avatarValue)) return "epic";
  if (["😎", "🦊", "🐱"].includes(avatarValue)) return "rare";
  return "common";
}

function getRankDecoration(rank) {
  if (rank === 1) return "🏆";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "🎯";
}

function StatCard({ label, value, tone = "yellow" }) {
  const tones = {
    yellow: "border-yellow-300 bg-yellow-50 text-yellow-950",
    cyan: "border-cyan-300 bg-cyan-50 text-cyan-950",
    emerald: "border-emerald-300 bg-emerald-50 text-emerald-950",
    amber: "border-amber-300 bg-amber-50 text-amber-950",
    violet: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-950",
  };

  return (
    <div className={`rounded-3xl border p-5 shadow-xl ${tones[tone]}`}>
      <div className="text-xs font-bold uppercase tracking-[0.2em] opacity-70">{label}</div>
      <div className="mt-3 text-3xl font-black">{value}</div>
    </div>
  );
}

function Dashboard({
  user,
  tasks,
  rewards,
  purchases,
  leaderboard = [],
  familyStats = null,
  achievements = [],
  seasonProgress = null,
  onCompleteTask,
  onBuyReward,
}) {
  const { api, setUser } = useUser();
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [tab, setTab] = useState(DASHBOARD_TAB_MISSIONS);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [avatar, setAvatar] = useState({
    image: user?.avatar || ":)",
    name: user?.username || "Hrac",
  });

  const level = Math.floor((user?.xp || 0) / 100) + 1;
  const currentLevelXp = (user?.xp || 0) % 100;
  const pendingTasks = useMemo(() => tasks.filter((task) => !task.is_completed), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((task) => task.is_completed), [tasks]);
  const waitingApprovalTasks = useMemo(
    () => tasks.filter((task) => !task.is_daily && !task.approved && !task.is_completed),
    [tasks]
  );
  const dailyTasks = useMemo(() => tasks.filter((task) => task.is_daily), [tasks]);
  const topPerformers = useMemo(() => leaderboard.slice(0, 3), [leaderboard]);
  const myLeagueKey = getLeagueByXp(user?.xp || 0);
  const myLeague = LEAGUE_STYLES[myLeagueKey];
  const myRarityKey = getAvatarRarity(avatar.image);
  const myRarity = AVATAR_RARITY_STYLES[myRarityKey];

  async function handleCompleteTask(taskId) {
    setActiveTaskId(taskId);
    setMessage("");
    setError("");

    try {
      const response = await onCompleteTask(taskId);
      setMessage(response.detail);
      setShowConfetti(true);
      window.setTimeout(() => setShowConfetti(false), 1800);
    } catch (completeError) {
      setError(getErrorMessage(completeError, DASHBOARD_MESSAGES.completeTaskError));
    } finally {
      setActiveTaskId(null);
    }
  }

  async function updateAvatarOnBackend(newAvatar) {
    try {
      setError("");
      const updated = await api(`/users/${user.id}`, {
        method: "PUT",
        body: { avatar: newAvatar },
      });
      setUser(updated);
      setMessage(DASHBOARD_MESSAGES.saveAvatarSuccess);
    } catch (avatarError) {
      setError(getErrorMessage(avatarError, DASHBOARD_MESSAGES.saveAvatarError));
    }
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const nextImage = loadEvent.target?.result;
      if (!nextImage) {
        return;
      }
      setAvatar((prev) => ({ ...prev, image: nextImage }));
      updateAvatarOnBackend(nextImage);
      setShowAvatarPicker(false);
    };
    reader.readAsDataURL(file);
  }

  function handleEmojiPick(emoji) {
    setAvatar((prev) => ({ ...prev, image: emoji }));
    updateAvatarOnBackend(emoji);
    setShowAvatarPicker(false);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,#38bdf8,transparent_30%),radial-gradient(circle_at_85%_0%,#f0abfc,transparent_32%),linear-gradient(180deg,#082f49_0%,#0f172a_35%,#111827_100%)] px-4 py-6">
      <ConfettiReward show={showConfetti} />
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="overflow-hidden rounded-[32px] border border-cyan-400/40 bg-slate-900/80 p-6 shadow-2xl backdrop-blur">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-end">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-bold uppercase tracking-[0.35em] text-cyan-300">
                  Family Quest
                </div>
                <h1 className="mt-3 text-4xl font-black text-white">Brawler profil</h1>
                <p className="mt-3 max-w-2xl text-sm text-slate-200/80">
                  Dokoncuj ukoly, sbirej XP a utracej zlato v rodinnem obchode.
                </p>
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold text-cyan-100">
                    <span>Level {level}</span>
                    <span>{currentLevelXp}/100 XP</span>
                  </div>
                  <ProgressBar value={currentLevelXp} max={100} />
                </div>
              </div>

              <div
                className={`rounded-3xl border border-fuchsia-400/40 bg-gradient-to-br ${myLeague.heroGlow} p-4`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] ${myLeague.badge}`}
                  >
                    {myLeague.name}
                  </div>
                  <div className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-200">
                    {user?.gold || 0} Gold
                  </div>
                </div>
                <div className="mt-3 flex flex-col items-center gap-2">
                  <Avatar name={avatar.name} image={avatar.image} />
                  <div
                    className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${myRarity.badge}`}
                  >
                    Avatar {myRarity.name}
                  </div>
                </div>
                <button
                  type="button"
                  className="mt-3 w-full rounded-full bg-fuchsia-300 px-3 py-2 text-xs font-bold text-fuchsia-950 shadow transition hover:bg-fuchsia-200"
                  onClick={() => setShowAvatarPicker((value) => !value)}
                >
                  Zmenit avatar
                </button>
                {showAvatarPicker ? (
                  <div className="mt-2 flex flex-col items-center gap-2 rounded-xl border border-cyan-400/40 bg-slate-900 p-3 shadow-xl">
                    <div className="flex flex-wrap justify-center gap-2">
                      {["😀", "😎", "🤖", "🐶", "🐱", "🦊", "🐼", "🦁"].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="text-2xl transition hover:scale-125"
                          onClick={() => handleEmojiPick(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <label className="mt-2 block text-xs font-semibold text-cyan-100">
                      Nebo vlastni obrazek
                      <input
                        type="file"
                        accept="image/*"
                        className="mt-1 block"
                        onChange={handleAvatarChange}
                      />
                    </label>
                    <button
                      type="button"
                      className="mt-2 text-xs text-cyan-300 underline"
                      onClick={() => setShowAvatarPicker(false)}
                    >
                      Zavrit
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3">
              <StatCard label="Celkem XP" value={user?.xp || 0} tone="cyan" />
              <StatCard label="Zlato" value={user?.gold || 0} tone="amber" />
              <StatCard label="Hotove mise" value={completedTasks.length} tone="violet" />
              <div className="rounded-2xl border border-orange-400/40 bg-orange-950/40 p-3 text-center">
                <div className="text-2xl">🔥</div>
                <div className="mt-1 text-xl font-black text-orange-300">{user?.current_streak || 0}</div>
                <div className="text-xs font-semibold text-orange-200/70">den v řadě</div>
                {user?.current_streak >= 3 && (
                  <div className="mt-1 rounded-full bg-orange-400/20 px-2 py-0.5 text-xs font-bold text-orange-200">
                    {user.current_streak >= 30 ? "+100 XP" : user.current_streak >= 14 ? "+50 XP" : user.current_streak >= 7 ? "+25 XP" : "+10 XP"} bonus!
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="flex gap-3">
          {DASHBOARD_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
                tab === item.id
                  ? `${item.active} shadow-lg scale-105 ring-2 ring-cyan-300/50`
                  : `${item.idle} shadow`
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {message ? (
          <div className="rounded-2xl border border-yellow-400/60 bg-yellow-100/80 px-4 py-3 text-sm font-semibold text-yellow-950">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-rose-400/40 bg-rose-100/80 px-4 py-3 text-sm font-semibold text-rose-900">
            {error}
          </div>
        ) : null}

        {tab === DASHBOARD_TAB_MISSIONS ? (
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <StatCard label="Ceka na schvaleni" value={waitingApprovalTasks.length} tone="amber" />
                <StatCard label="Aktivni mise" value={pendingTasks.length} tone="cyan" />
                <StatCard label="Denne mise" value={dailyTasks.length} tone="emerald" />
              </div>

              <div className="mt-6 flex items-center justify-between">
                <h2 className="text-2xl font-black text-yellow-950">Aktivni ukoly</h2>
                <div className="rounded-full bg-yellow-950 px-3 py-1 text-sm font-bold text-yellow-100">
                  {pendingTasks.length}
                </div>
              </div>

              {pendingTasks.length > 0 ? (
                pendingTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    title={task.title}
                    description={task.description}
                    xp={task.xp}
                    gold={task.gold}
                    isDaily={task.is_daily}
                    isCompleted={task.is_completed}
                    approved={task.approved}
                    feedback={task.feedback}
                    busy={activeTaskId === task.id}
                    onComplete={() => handleCompleteTask(task.id)}
                  />
                ))
              ) : (
                <div className="rounded-[28px] border border-dashed border-yellow-400 bg-yellow-50/70 p-8 text-center text-yellow-900/70">
                  Zadna aktivni mise. Rodic ti asi pripravi dalsi.
                </div>
              )}

              {waitingApprovalTasks.length > 0 ? (
                <div className="rounded-[28px] border border-amber-300 bg-amber-50/80 p-5 shadow-lg">
                  <h3 className="text-lg font-black text-amber-950">Mise cekajici na potvrzeni</h3>
                  <div className="mt-4 space-y-3">
                    {waitingApprovalTasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-2xl border border-amber-200 bg-white/70 px-4 py-3"
                      >
                        <div className="font-bold text-amber-950">{task.title}</div>
                        <div className="mt-1 text-sm text-amber-900/75">
                          Rodic musi potvrdit odmenu {task.xp} XP a {task.gold} zlata.
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <aside className="rounded-[32px] border border-yellow-300 bg-yellow-50/85 p-5 shadow-xl">
              <div className="rounded-2xl border border-fuchsia-300 bg-fuchsia-50/80 px-4 py-3">
                <h3 className="text-lg font-black text-fuchsia-950">Hall of fame</h3>
                {topPerformers.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {topPerformers.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2"
                      >
                        <div className="font-bold text-fuchsia-950">
                          {getRankDecoration(entry.rank)} #{entry.rank} {entry.is_me ? "Ty" : entry.username}
                        </div>
                        <div className="text-xs font-semibold text-fuchsia-800">
                          {entry.xp} XP | {entry.gold} G
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-fuchsia-800/70">Zatim bez poradi.</div>
                )}
              </div>

              <h2 className="text-xl font-black text-yellow-950">Hotovo dnes</h2>
              <p className="mt-1 text-sm text-yellow-900/70">
                Prehled misi, ktere uz mas splnene.
              </p>
              <div className="mt-4 space-y-3">
                {completedTasks.length > 0 ? (
                  completedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3"
                    >
                      <div className="font-bold text-emerald-950">{task.title}</div>
                      <div className="mt-1 text-sm text-emerald-800">
                        +{task.xp} XP a +{task.gold} zlata
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-yellow-300 px-4 py-6 text-sm text-yellow-900/70">
                    Zatim nic dokonceneho.
                  </div>
                )}
              </div>

              <div className="mt-5 rounded-2xl border border-cyan-300 bg-cyan-50/90 p-4">
                <h3 className="text-lg font-black text-cyan-950">Season Pass</h3>
                {seasonProgress ? (
                  <>
                    <div className="mt-2 text-sm font-semibold text-cyan-900">
                      {seasonProgress.season_label} • den {seasonProgress.season_day}/{seasonProgress.season_length_days}
                    </div>
                    <div className="mt-2 text-sm text-cyan-900/80">
                      Level {seasonProgress.pass_level} • {seasonProgress.pass_level_progress_xp}/{seasonProgress.pass_level_target_xp} XP
                    </div>
                    <div className="mt-2">
                      <ProgressBar
                        value={seasonProgress.pass_level_progress_xp}
                        max={seasonProgress.pass_level_target_xp}
                      />
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-sm text-cyan-900/70">Season Pass zatim neni dostupny.</div>
                )}
              </div>
            </aside>
          </section>
        ) : null}

        {tab === DASHBOARD_TAB_SHOP ? (
          <Shop
            user={user}
            rewards={rewards}
            purchases={purchases}
            onBuyReward={onBuyReward}
          />
        ) : null}

        {tab === DASHBOARD_TAB_FAMILY ? (
          <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="rounded-[32px] border border-cyan-300 bg-cyan-50/85 p-5 shadow-xl">
              <h2 className="text-xl font-black text-cyan-950">Rodinne statistiky</h2>
              <p className="mt-1 text-sm text-cyan-900/70">
                Souhrn clenu, ukolu a odmen v aktualni rodine.
              </p>
              <div className="mt-5 grid gap-3">
                <StatCard label="Clenove" value={familyStats?.members || 0} tone="cyan" />
                <StatCard label="Deti" value={familyStats?.children || 0} tone="cyan" />
                <StatCard label="Celkem XP" value={familyStats?.total_xp || 0} tone="cyan" />
                <StatCard
                  label="Dokoncene ukoly"
                  value={familyStats?.completed_tasks || 0}
                  tone="cyan"
                />
                <StatCard
                  label="Ceka na schvaleni"
                  value={familyStats?.pending_approval || 0}
                  tone="cyan"
                />
                <StatCard label="Odmeny v obchode" value={familyStats?.rewards || 0} tone="cyan" />
              </div>
            </aside>

            <div className="rounded-[32px] border border-cyan-300 bg-white/85 p-5 shadow-xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-cyan-950">Rodinny zebricek</h2>
                  <p className="mt-1 text-sm text-cyan-900/70">
                    Poradi podle XP, pri shode rozhoduje zlato.
                  </p>
                </div>
                <div className="rounded-full bg-cyan-950 px-3 py-1 text-sm font-bold text-cyan-100">
                  {leaderboard.length} hracu
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {leaderboard.length > 0 ? (
                  leaderboard.map((entry) => (
                    (() => {
                      const leagueKey = getLeagueByXp(entry.xp);
                      const league = LEAGUE_STYLES[leagueKey];
                      const rarity = AVATAR_RARITY_STYLES[getAvatarRarity(entry.avatar)];
                      return (
                    <article
                      key={entry.id}
                      className={`flex items-center gap-4 rounded-3xl border px-4 py-4 shadow-sm ${
                        entry.is_me
                          ? "border-cyan-500 bg-cyan-50"
                          : `${league.rankCard}`
                      }`}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-950 text-lg font-black text-cyan-100">
                        {getRankDecoration(entry.rank)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-lg font-black text-slate-950">
                            {entry.is_me ? "Ty" : entry.username}
                          </div>
                          <span className="rounded-full bg-slate-900/5 px-2 py-1 text-xs font-bold uppercase tracking-[0.2em] text-slate-600">
                            {entry.role}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-1 text-xs font-bold uppercase tracking-[0.2em] ${league.badge}`}
                          >
                            {league.name}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-1 text-xs font-bold uppercase tracking-[0.2em] ${rarity.badge}`}
                          >
                            {rarity.name}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                          <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-cyan-800">
                            {entry.xp} XP
                          </span>
                          <span className="rounded-full bg-amber-400/15 px-3 py-1 text-amber-900">
                            {entry.gold} zlata
                          </span>
                          <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-emerald-900">
                            {entry.completed_tasks} dokonceno
                          </span>
                        </div>
                      </div>
                    </article>
                      );
                    })()
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-cyan-300 px-4 py-8 text-center text-cyan-900/70">
                    Zebricek bude dostupny, jakmile bude v rodine vic dat.
                  </div>
                )}
              </div>

              <div className="mt-6 rounded-3xl border border-fuchsia-300 bg-fuchsia-50/70 p-4">
                <h3 className="text-xl font-black text-fuchsia-950">Achievementy</h3>
                <p className="mt-1 text-sm text-fuchsia-900/70">
                  Dlouhodobe cile, ktere odemykas plnenim misi.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {achievements.length > 0 ? (
                    achievements.map((item) => (
                      <article
                        key={item.id}
                        className={`rounded-2xl border px-4 py-3 ${
                          item.unlocked
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-fuchsia-200 bg-white/80"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-bold text-slate-950">{item.title}</div>
                          <div
                            className={`rounded-full px-2 py-1 text-xs font-bold ${
                              item.unlocked ? "bg-emerald-200 text-emerald-900" : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {item.unlocked ? "odemceno" : "v procesu"}
                          </div>
                        </div>
                        <div className="mt-1 text-sm text-slate-700">{item.description}</div>
                        <div className="mt-2 text-xs font-semibold text-slate-600">
                          {item.progress}/{item.target}
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-fuchsia-300 px-4 py-6 text-sm text-fuchsia-900/70 md:col-span-2">
                      Achievementy zatim nejsou dostupne.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

export default Dashboard;
