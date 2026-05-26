import React, { useEffect, useMemo, useRef, useState } from "react";
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
    heroBadge: "border-yellow-300/90 bg-yellow-700/75 text-yellow-50 shadow-lg shadow-yellow-500/50",
    rankBadge: "border-yellow-400/60 bg-yellow-400 text-slate-950",
    rankCard: "border-yellow-400/60 bg-slate-800/80",
    heroGlow: "from-yellow-500/40 via-orange-500/20 to-slate-950/90",
  },
  silver: {
    name: "Silver liga",
    heroBadge: "border-slate-200/90 bg-slate-700/75 text-slate-50 shadow-lg shadow-slate-400/40",
    rankBadge: "border-slate-300/60 bg-slate-300 text-slate-950",
    rankCard: "border-slate-400/60 bg-slate-800/80",
    heroGlow: "from-slate-400/40 via-cyan-500/20 to-slate-950/90",
  },
  gold: {
    name: "Gold liga",
    heroBadge: "border-yellow-300/90 bg-amber-700/75 text-yellow-50 shadow-lg shadow-yellow-500/60",
    rankBadge: "border-yellow-300/70 bg-yellow-300 text-slate-950 font-black",
    rankCard: "border-yellow-400/60 bg-slate-800/80",
    heroGlow: "from-yellow-400/45 via-amber-500/25 to-slate-950/90",
  },
  diamond: {
    name: "Diamond liga",
    heroBadge: "border-cyan-300/90 bg-cyan-800/75 text-cyan-50 shadow-lg shadow-cyan-500/50",
    rankBadge: "border-cyan-300/70 bg-cyan-300 text-slate-950 font-black",
    rankCard: "border-cyan-400/60 bg-slate-800/80",
    heroGlow: "from-cyan-400/45 via-blue-500/25 to-slate-950/90",
  },
  mythic: {
    name: "Mythic liga",
    heroBadge: "border-fuchsia-300/90 bg-fuchsia-800/75 text-fuchsia-50 shadow-lg shadow-fuchsia-500/60",
    rankBadge: "border-fuchsia-300/70 bg-fuchsia-300 text-slate-950 font-black",
    rankCard: "border-fuchsia-400/60 bg-slate-800/80",
    heroGlow: "from-fuchsia-500/45 via-violet-600/30 to-slate-950/90",
  },
};

const AVATAR_RARITY_STYLES = {
  common: {
    name: "Common",
    heroBadge: "border-slate-300/80 bg-slate-700/75 text-slate-50",
    rankBadge: "border-slate-400/50 bg-slate-100 text-slate-900",
  },
  rare: {
    name: "Rare",
    heroBadge: "border-cyan-300/80 bg-cyan-800/75 text-cyan-50",
    rankBadge: "border-cyan-400/60 bg-cyan-100 text-cyan-900",
  },
  epic: {
    name: "Epic",
    heroBadge: "border-violet-300/80 bg-violet-800/75 text-violet-50",
    rankBadge: "border-violet-400/60 bg-violet-100 text-violet-900",
  },
  legendary: {
    name: "Legendary",
    heroBadge: "border-yellow-300/80 bg-amber-700/75 text-yellow-50",
    rankBadge: "border-yellow-400/60 bg-yellow-100 text-yellow-900",
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
    yellow: "border-yellow-400/85 bg-yellow-900/70 text-yellow-50 shadow-lg shadow-yellow-500/40 -skew-x-2",
    cyan: "border-cyan-400/85 bg-cyan-900/70 text-cyan-50 shadow-lg shadow-cyan-500/40 -skew-x-2",
    emerald: "border-lime-400/85 bg-lime-900/70 text-lime-50 shadow-lg shadow-lime-500/40 -skew-x-2",
    amber: "border-orange-400/85 bg-orange-900/70 text-orange-50 shadow-lg shadow-orange-500/40 -skew-x-2",
    violet: "border-fuchsia-400/85 bg-fuchsia-900/70 text-fuchsia-50 shadow-lg shadow-fuchsia-500/40 -skew-x-2",
  };

  return (
    <div className={`rounded-2xl border p-5 font-black uppercase tracking-wider transform transition-transform hover:scale-105 ${tones[tone]}`}>
      <div className="text-xs font-bold uppercase tracking-[0.2em] opacity-70">{label}</div>
      <div className="mt-2 text-4xl font-black">{value}</div>
    </div>
  );
}

function QuestChip({ icon, label, value, accent = "bg-white/70 text-slate-900" }) {
  return (
    <div className={`rounded-2xl border border-white/60 px-3 py-2 shadow-sm ${accent}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-70">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-sm font-black">
        <span>{icon}</span>
        <span>{value}</span>
      </div>
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
  challenges = [],
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
  const [showLevelUpBanner, setShowLevelUpBanner] = useState(false);
  const [avatar, setAvatar] = useState({
    image: user?.avatar || ":)",
    name: user?.username || "Hrac",
  });

  const level = Math.floor((user?.xp || 0) / 100) + 1;
  const previousLevelRef = useRef(level);
  const currentLevelXp = (user?.xp || 0) % 100;
  const todayDailyTasks = useMemo(
    () => tasks.filter((task) => task.is_daily && !task.is_completed),
    [tasks]
  );
  const extraTasks = useMemo(
    () => tasks.filter((task) => !task.is_daily && !task.is_completed),
    [tasks]
  );
  const waitingApprovalTasks = useMemo(
    () => tasks.filter((task) => task.is_completed && !task.approved),
    [tasks]
  );
  const completedTasks = useMemo(() => tasks.filter((task) => task.approved), [tasks]);
  const topPerformers = useMemo(() => leaderboard.slice(0, 3), [leaderboard]);
  const myLeagueKey = getLeagueByXp(user?.xp || 0);
  const myLeague = LEAGUE_STYLES[myLeagueKey];
  const myRarityKey = getAvatarRarity(avatar.image);
  const myRarity = AVATAR_RARITY_STYLES[myRarityKey];
  const totalOpenTasks = todayDailyTasks.length + extraTasks.length;
  const totalTaskPool = totalOpenTasks + completedTasks.length;
  const completionPercent = totalTaskPool > 0 ? Math.round((completedTasks.length / totalTaskPool) * 100) : 0;
  const nextStreakGoal = user?.current_streak >= 14 ? 30 : user?.current_streak >= 7 ? 14 : user?.current_streak >= 3 ? 7 : 3;
  const daysToGoal = Math.max(0, nextStreakGoal - (user?.current_streak || 0));
  const bossTask = useMemo(() => {
    const candidates = [...todayDailyTasks, ...extraTasks];
    if (candidates.length === 0) return null;

    return candidates
      .slice()
      .sort((a, b) => {
        const scoreA = (a.xp || 0) * 2 + (a.gold || 0) * 3 + (a.requires_proof ? 8 : 0);
        const scoreB = (b.xp || 0) * 2 + (b.gold || 0) * 3 + (b.requires_proof ? 8 : 0);
        return scoreB - scoreA;
      })[0];
  }, [todayDailyTasks, extraTasks]);

  useEffect(() => {
    if (level > previousLevelRef.current) {
      setShowLevelUpBanner(true);
      const timer = window.setTimeout(() => setShowLevelUpBanner(false), 2600);
      previousLevelRef.current = level;
      return () => window.clearTimeout(timer);
    }

    previousLevelRef.current = level;
    return undefined;
  }, [level]);

  async function handleCompleteTask(taskId) {
    setActiveTaskId(taskId);
    setMessage("");
    setError("");

    try {
      const task = tasks.find((item) => item.id === taskId);

      if (task?.requires_proof && !task?.proof_submitted_at) {
        const proofText = window.prompt("Popis co jsi splnil/a (dukaz):", "");
        if (!proofText || !proofText.trim()) {
          setError("U tohoto ukolu je potreba vyplnit dukaz splneni.");
          return;
        }
        const proofMediaUrl = window.prompt("Odkaz na foto/video dukaz (volitelne):", "");
        await api(`/game/submit-proof/${taskId}`, {
          method: "POST",
          body: {
            proof_text: proofText.trim(),
            proof_media_url: (proofMediaUrl || "").trim() || null,
          },
        });
      }

      const response = await onCompleteTask(taskId);
      setMessage(response.detail);
      
      // Play success sound and vibrate
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
      } catch (err) {
        // Ignore audio errors on unsupported browsers
      }
      
      // Vibrate pattern: 100ms, 50ms pause, 100ms
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      
      if (response?.task?.approved) {
        setShowConfetti(true);
        window.setTimeout(() => setShowConfetti(false), 1800);
      }
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
    <div className="brawl-shell relative min-h-screen overflow-hidden px-4 py-6">
      <div className="pointer-events-none absolute -left-12 top-12 hidden text-6xl blur-3xl opacity-20 md:block">
        ⚡
      </div>
      <div className="pointer-events-none absolute right-0 top-64 hidden text-7xl blur-3xl opacity-20 md:block">
        💥
      </div>
      <div className="pointer-events-none absolute bottom-32 left-10 hidden text-6xl blur-3xl opacity-15 md:block">
        🎮
      </div>
      <ConfettiReward show={showConfetti} />
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-6">
        <section className="brawl-panel overflow-hidden bg-gradient-to-br from-blue-700/90 via-indigo-700/90 to-purple-800/90 p-6 backdrop-blur -skew-x-1" style={{ clipPath: "polygon(0 0, 100% 2%, 98% 100%, 0 98%)" }}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-end">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="brawl-subtitle text-sm font-black uppercase tracking-[0.35em] text-cyan-200 animate-pulse">
                  Family Quest
                </div>
                <h1 className="brawl-title mt-3 text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-yellow-300 to-pink-300">MISSION CONTROL</h1>
                <p className="mt-3 max-w-2xl text-sm text-slate-200/80">
                  Jed kazdou misi naplno, sbirej XP, navyšuj streak a odemykej lepsi odmeny.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <QuestChip icon="🎯" label="Aktivni mise" value={`${totalOpenTasks}`} accent="border-cyan-300/80 bg-cyan-900/70 text-cyan-50 shadow-lg shadow-cyan-500/40 -skew-x-1" />
                  <QuestChip icon="🔥" label="Combo" value={`${user?.current_streak || 0} dnu`} accent="border-orange-300/80 bg-orange-900/70 text-orange-50 shadow-lg shadow-orange-500/40 -skew-x-1" />
                  <QuestChip icon="🚀" label="Progress" value={`${completionPercent}%`} accent="border-lime-300/80 bg-lime-900/70 text-lime-50 shadow-lg shadow-lime-500/40 -skew-x-1" />
                </div>
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold text-cyan-100">
                    <span>Level {level}</span>
                    <span>{currentLevelXp}/100 XP</span>
                  </div>
                  <ProgressBar value={currentLevelXp} max={100} />
                </div>
              </div>

              <div className={`brawl-accent-card rounded-3xl bg-gradient-to-br ${myLeague.heroGlow} p-4`}>
                <div className="flex items-center justify-between gap-3 -skew-x-1">
                  <div
                    className={`rounded-lg border px-3 py-1 text-xs font-black uppercase tracking-wider ${myLeague.heroBadge}`}
                  >
                    {myLeague.name}
                  </div>
                  <div className="rounded-lg bg-yellow-500/30 border border-yellow-400/60 px-3 py-1 text-xs font-black text-yellow-200 shadow-lg shadow-yellow-500/30">
                    {user?.gold || 0} Gold
                  </div>
                </div>
                <div className="mt-3 flex flex-col items-center gap-2">
                  <Avatar name={avatar.name} image={avatar.image} />
                  <div
                    className={`rounded-lg border px-3 py-1 text-[11px] font-black uppercase tracking-wider ${myRarity.heroBadge}`}
                  >
                    Avatar {myRarity.name}
                  </div>
                </div>
                <button
                  type="button"
                  className="mt-3 w-full rounded-lg border-2 border-slate-950 bg-gradient-to-b from-yellow-300 to-yellow-500 px-3 py-2 text-xs font-black text-slate-950 shadow-[0_4px_0_#020617] transition hover:scale-105 -skew-x-1"
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
                <div className="text-xs font-semibold text-orange-200/70">combo dni v rade</div>
                {daysToGoal > 0 ? (
                  <div className="mt-1 text-[11px] font-semibold text-orange-100/80">
                    Do dalsiho bonusu chybi {daysToGoal} d
                  </div>
                ) : null}
                {user?.current_streak >= 3 && (
                  <div className="mt-1 rounded-full bg-orange-400/20 px-2 py-0.5 text-xs font-bold text-orange-200">
                    {user.current_streak >= 30 ? "+100 XP" : user.current_streak >= 14 ? "+50 XP" : user.current_streak >= 7 ? "+25 XP" : "+10 XP"} bonus!
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {DASHBOARD_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`brawl-tab shrink-0 rounded-lg px-4 py-3 text-sm font-black uppercase tracking-wider transition -skew-x-1 ${
                tab === item.id
                  ? `${item.active} shadow-lg scale-105 ring-2 ring-cyan-300/50`
                  : `${item.idle} shadow hover:scale-[1.02]`
              }`}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden="true">
                  {item.id === DASHBOARD_TAB_MISSIONS ? "🎯" : item.id === DASHBOARD_TAB_SHOP ? "🎁" : "🛡️"}
                </span>
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {message ? (
          <div className="rounded-2xl border border-yellow-400/60 bg-yellow-100/80 px-4 py-3 text-sm font-semibold text-yellow-950">
            {message}
          </div>
        ) : null}
        {showLevelUpBanner ? (
          <div className="animate-pulse rounded-2xl border border-cyan-300/70 bg-cyan-100 px-4 py-3 text-sm font-black text-cyan-950 shadow-lg">
            LEVEL UP! Jsi na levelu {level}. Pokracuj v tempu.
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
                <StatCard label="Dnesni ukoly" value={todayDailyTasks.length} tone="emerald" />
                <StatCard label="Mimoradne ukoly" value={extraTasks.length} tone="cyan" />
              </div>

              <section className="space-y-4">
                <div className="mt-6 flex items-center justify-between">
                  <h2 className="text-2xl font-black text-yellow-100">Dnesni ukoly</h2>
                  <div className="rounded-full bg-yellow-950 px-3 py-1 text-sm font-bold text-yellow-100">
                    {todayDailyTasks.length}
                  </div>
                </div>

                {todayDailyTasks.length > 0 ? (
                  todayDailyTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      title={task.title}
                      description={task.description}
                      xp={task.xp}
                      gold={task.gold}
                      isDaily={task.is_daily}
                      isCompleted={task.is_completed}
                      approved={task.approved}
                      dueTime={task.due_time}
                      feedback={task.feedback}
                      requiresProof={task.requires_proof}
                      proofSubmittedAt={task.proof_submitted_at}
                      aiFlagged={task.ai_flagged}
                      aiReviewNote={task.ai_review_note}
                      busy={activeTaskId === task.id}
                      onComplete={() => handleCompleteTask(task.id)}
                    />
                  ))
                ) : (
                  <div className="rounded-[28px] border border-dashed border-emerald-300 bg-emerald-50/80 p-8 text-center text-emerald-950/70">
                    Na dnesek nemas zadny denni ukol.
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <div className="mt-6 flex items-center justify-between">
                  <h2 className="text-2xl font-black text-yellow-100">Mimoradne ukoly</h2>
                  <div className="rounded-full bg-yellow-950 px-3 py-1 text-sm font-bold text-yellow-100">
                    {extraTasks.length}
                  </div>
                </div>

                {extraTasks.length > 0 ? (
                  extraTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      title={task.title}
                      description={task.description}
                      xp={task.xp}
                      gold={task.gold}
                      isDaily={task.is_daily}
                      isCompleted={task.is_completed}
                      approved={task.approved}
                      dueTime={task.due_time}
                      feedback={task.feedback}
                      requiresProof={task.requires_proof}
                      proofSubmittedAt={task.proof_submitted_at}
                      aiFlagged={task.ai_flagged}
                      aiReviewNote={task.ai_review_note}
                      busy={activeTaskId === task.id}
                      onComplete={() => handleCompleteTask(task.id)}
                    />
                  ))
                ) : (
                  <div className="rounded-[28px] border border-dashed border-yellow-400 bg-yellow-50/70 p-8 text-center text-yellow-900/70">
                    Zadny mimoradny ukol. Rodic ti asi pripravi dalsi.
                  </div>
                )}
              </section>

              {waitingApprovalTasks.length > 0 ? (
                <div className="rounded-[28px] border border-amber-300 bg-amber-50/80 p-5 shadow-lg">
                  <h3 className="text-lg font-black text-amber-950">Odeslano rodici ke schvaleni</h3>
                  <div className="mt-4 space-y-3">
                    {waitingApprovalTasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-2xl border border-amber-200 bg-white/70 px-4 py-3"
                      >
                        <div className="font-bold text-amber-950">{task.title}</div>
                        <div className="mt-1 text-sm text-amber-900/75">
                          Rodic ted potvrzuje odmenu {task.xp} XP a {task.gold} zlata.
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <aside className="brawl-panel rounded-[32px] border-yellow-300/60 bg-gradient-to-b from-violet-800/90 to-indigo-900/95 p-5 shadow-xl">
              <div className="brawl-accent-card rounded-2xl border-fuchsia-300/60 bg-fuchsia-900/70 px-4 py-3">
                <h3 className="brawl-subtitle text-lg font-black text-fuchsia-100">Hall of fame</h3>
                {topPerformers.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {topPerformers.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between rounded-xl border-2 border-slate-900 bg-indigo-950/75 px-3 py-2">
                        <div className="font-bold text-fuchsia-100">
                          {getRankDecoration(entry.rank)} #{entry.rank} {entry.is_me ? "Ty" : entry.username}
                        </div>
                        <div className="text-xs font-semibold text-fuchsia-200">
                          {entry.xp} XP | {entry.gold} G
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-fuchsia-200/85">Zatim bez poradi.</div>
                )}
              </div>

              <div className="brawl-accent-card mt-4 rounded-2xl border-cyan-300/60 bg-cyan-900/70 px-4 py-3">
                <h3 className="brawl-subtitle text-lg font-black text-cyan-100">Boss tydne</h3>
                <p className="mt-1 text-xs font-semibold text-cyan-200/90">Nejtezsi mise s nejlepsim lootem.</p>
                {bossTask ? (
                  <div className="mt-3 rounded-xl border-2 border-slate-900 bg-cyan-950/80 px-3 py-3">
                    <div className="text-sm font-black text-cyan-100">{bossTask.title}</div>
                    {bossTask.description ? (
                      <div className="mt-1 text-xs text-cyan-200/85">{bossTask.description}</div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                      <span className="rounded-full border border-slate-900 bg-cyan-300 px-2 py-1 text-cyan-950">+{bossTask.xp} XP</span>
                      <span className="rounded-full border border-slate-900 bg-amber-300 px-2 py-1 text-amber-950">+{bossTask.gold} Gold</span>
                      {bossTask.requires_proof ? (
                        <span className="rounded-full border border-slate-900 bg-fuchsia-300 px-2 py-1 text-fuchsia-950">proof</span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-cyan-200/85">Boss mise se objevi, jakmile bude aktivni ukol.</div>
                )}
              </div>

              {challenges && challenges.length > 0 && (
                <div className="brawl-accent-card mt-4 rounded-2xl border-fuchsia-300/60 bg-fuchsia-900/70 px-4 py-3">
                  <h3 className="brawl-subtitle text-lg font-black text-fuchsia-100">🏆 Weekly Challenge</h3>
                  <p className="mt-1 text-xs font-semibold text-fuchsia-200/90">Spolecna rodinne vyzva - ziskejte skupinovy bonus!</p>
                  {challenges[0] ? (
                    <div className="mt-3 rounded-xl border-2 border-slate-900 bg-fuchsia-950/80 px-3 py-3">
                      <div className="text-sm font-black text-fuchsia-100">{challenges[0].title}</div>
                      <div className="mt-2 text-xs text-fuchsia-200/85">
                        Cil: {challenges[0].current_progress || 0} / {challenges[0].target} ukolu
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-fuchsia-950 border border-slate-900">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500"
                          style={{ width: `${Math.min(100, ((challenges[0].current_progress || 0) / challenges[0].target) * 100)}%` }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                        <span className="rounded-full border border-slate-900 bg-fuchsia-300 px-2 py-1 text-fuchsia-950">+{challenges[0].bonus_xp} XP</span>
                        {challenges[0].bonus_gold > 0 && (
                          <span className="rounded-full border border-slate-900 bg-amber-300 px-2 py-1 text-amber-950">+{challenges[0].bonus_gold} Gold</span>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              <h2 className="brawl-subtitle text-xl font-black text-yellow-100">Hotovo dnes</h2>
              <p className="mt-1 text-sm text-yellow-200/85">
                Prehled misi, ktere uz byly rodicem potvrzene.
              </p>
              <div className="mt-4 space-y-3">
                {completedTasks.length > 0 ? (
                  completedTasks.map((task) => (
                    <div key={task.id} className="rounded-2xl border-2 border-slate-900 bg-emerald-900/75 px-4 py-3">
                      <div className="font-bold text-emerald-100">{task.title}</div>
                      <div className="mt-1 text-sm text-emerald-200">
                        +{task.xp} XP a +{task.gold} zlata
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-yellow-300/80 px-4 py-6 text-sm text-yellow-200/85">
                    Zatim nic dokonceneho.
                  </div>
                )}
              </div>

              <div className="brawl-accent-card mt-5 rounded-2xl border-cyan-300/70 bg-gradient-to-r from-cyan-800/85 to-blue-900/85 p-4">
                <h3 className="brawl-subtitle text-lg font-black text-cyan-100">Season Pass</h3>
                {seasonProgress ? (
                  <>
                    <div className="mt-2 text-sm font-semibold text-cyan-100">
                      {seasonProgress.season_label} • den {seasonProgress.season_day}/{seasonProgress.season_length_days}
                    </div>
                    <div className="mt-2 text-sm text-cyan-200/90">
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
                  <div className="mt-2 text-sm text-cyan-200/85">Season Pass zatim neni dostupny.</div>
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
              <div className="flex flex-wrap items-center justify-between gap-4">
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
                      className={`flex items-start gap-4 rounded-3xl border px-4 py-4 shadow-sm sm:items-center ${
                        entry.is_me
                          ? "border-cyan-500 bg-cyan-50 text-slate-950"
                          : `${league.rankCard} text-slate-100`
                      }`}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-950 text-lg font-black text-cyan-100">
                        {getRankDecoration(entry.rank)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className={`truncate text-lg font-black ${entry.is_me ? "text-slate-950" : "text-slate-100"}`}>
                            {entry.is_me ? "Ty" : entry.username}
                          </div>
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-bold uppercase tracking-[0.2em] ${
                              entry.is_me
                                ? "bg-slate-900/5 text-slate-600"
                                : "bg-slate-800 text-slate-100"
                            }`}
                          >
                            {entry.role}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-1 text-xs font-bold uppercase tracking-[0.2em] ${league.rankBadge}`}
                          >
                            {league.name}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-1 text-xs font-bold uppercase tracking-[0.2em] ${rarity.rankBadge}`}
                          >
                            {rarity.name}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                          <span className={`rounded-full px-3 py-1 ${entry.is_me ? "bg-cyan-400/10 text-cyan-800" : "bg-cyan-500/25 text-cyan-100"}`}>
                            {entry.xp} XP
                          </span>
                          <span className={`rounded-full px-3 py-1 ${entry.is_me ? "bg-amber-400/15 text-amber-900" : "bg-amber-500/25 text-amber-100"}`}>
                            {entry.gold} zlata
                          </span>
                          <span className={`rounded-full px-3 py-1 ${entry.is_me ? "bg-emerald-400/15 text-emerald-900" : "bg-emerald-500/25 text-emerald-100"}`}>
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
                        className={`rounded-2xl border px-4 py-3 transition ${
                          item.unlocked
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-fuchsia-200 bg-white/80 opacity-75"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            {item.icon ? (
                              <span className="text-2xl leading-none">{item.icon}</span>
                            ) : null}
                            <div className="font-bold text-slate-950">{item.title}</div>
                          </div>
                          <div
                            className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
                              item.unlocked ? "bg-emerald-200 text-emerald-900" : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {item.unlocked ? "odemceno" : "v procesu"}
                          </div>
                        </div>
                        <div className="mt-1 text-sm text-slate-700">{item.description}</div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                item.unlocked ? "bg-emerald-400" : "bg-fuchsia-400"
                              }`}
                              style={{ width: `${Math.min(100, Math.round((item.progress / item.target) * 100))}%` }}
                            />
                          </div>
                          <div className="shrink-0 text-xs font-semibold text-slate-600">
                            {item.progress}/{item.target}
                          </div>
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
