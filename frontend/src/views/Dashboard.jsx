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
import InstallAppButton from "../components/InstallAppButton";
import PushSubscribeButton from "../components/PushSubscribeButton";
import TaskCard from "../components/TaskCard";
import Shop from "./Shop";
import { getErrorMessage } from "../utils/errors";

const LEAGUE_STYLES = {
  bronze: {
    name: "Bronzová liga",
    heroBadge: "border-yellow-300/90 bg-yellow-700/75 text-yellow-50 shadow-lg shadow-yellow-500/50",
    rankBadge: "border-yellow-400/60 bg-yellow-400 text-slate-950",
    rankCard: "border-yellow-400/60 bg-slate-800/80",
    heroGlow: "from-yellow-500/40 via-orange-500/20 to-slate-950/90",
  },
  silver: {
    name: "Stříbrná liga",
    heroBadge: "border-slate-200/90 bg-slate-700/75 text-slate-50 shadow-lg shadow-slate-400/40",
    rankBadge: "border-slate-300/60 bg-slate-300 text-slate-950",
    rankCard: "border-slate-400/60 bg-slate-800/80",
    heroGlow: "from-slate-400/40 via-cyan-500/20 to-slate-950/90",
  },
  gold: {
    name: "Zlatá liga",
    heroBadge: "border-yellow-300/90 bg-amber-700/75 text-yellow-50 shadow-lg shadow-yellow-500/60",
    rankBadge: "border-yellow-300/70 bg-yellow-300 text-slate-950 font-black",
    rankCard: "border-yellow-400/60 bg-slate-800/80",
    heroGlow: "from-yellow-400/45 via-amber-500/25 to-slate-950/90",
  },
  diamond: {
    name: "Diamantová liga",
    heroBadge: "border-cyan-300/90 bg-cyan-800/75 text-cyan-50 shadow-lg shadow-cyan-500/50",
    rankBadge: "border-cyan-300/70 bg-cyan-300 text-slate-950 font-black",
    rankCard: "border-cyan-400/60 bg-slate-800/80",
    heroGlow: "from-cyan-400/45 via-blue-500/25 to-slate-950/90",
  },
  mythic: {
    name: "Mytická liga",
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

function StatCard({ label, value, tone = "yellow" }) {
  const tones = {
    yellow: "border-yellow-400/85 bg-yellow-900/70 text-yellow-50 shadow-lg shadow-yellow-500/40",
    cyan: "border-cyan-400/85 bg-cyan-900/70 text-cyan-50 shadow-lg shadow-cyan-500/40",
    emerald: "border-lime-400/85 bg-lime-900/70 text-lime-50 shadow-lg shadow-lime-500/40",
    amber: "border-orange-400/85 bg-orange-900/70 text-orange-50 shadow-lg shadow-orange-500/40",
    violet: "border-fuchsia-400/85 bg-fuchsia-900/70 text-fuchsia-50 shadow-lg shadow-fuchsia-500/40",
  };

  return (
    <div className={`rounded-2xl border p-3 font-black uppercase tracking-wider ${tones[tone]}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
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
  const [proofDraft, setProofDraft] = useState({
    taskId: null,
    title: "",
    text: "",
    mediaDataUrl: "",
    fileName: "",
  });
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const proofFileInputRef = useRef(null);
  const [avatar, setAvatar] = useState({
    image: user?.avatar || ":)",
    name: user?.username || "Hráč",
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

  function openProofComposer(task) {
    setProofDraft({
      taskId: task.id,
      title: task.title || "Úkol",
      text: "",
      mediaDataUrl: "",
      fileName: "",
    });
  }

  function closeProofComposer() {
    setProofDraft({
      taskId: null,
      title: "",
      text: "",
      mediaDataUrl: "",
      fileName: "",
    });
    setProofSubmitting(false);
  }

  function handlePickProofPhoto() {
    proofFileInputRef.current?.click();
  }

  function handleProofFileChange(event) {
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
      setProofDraft((current) => ({
        ...current,
        mediaDataUrl: String(nextImage),
        fileName: file.name || "dukaz.jpg",
      }));
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function executeTaskCompletion(taskId) {
    const response = await onCompleteTask(taskId);
    setMessage(response.detail);

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch {
      // Ignore audio errors on unsupported browsers.
    }

    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }

    if (response?.task?.approved) {
      setShowConfetti(true);
      window.setTimeout(() => setShowConfetti(false), 1800);
    }
  }

  async function submitProofAndComplete(taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      setError("Úkol se nepodařilo najít.");
      return;
    }

    const normalizedProofText = proofDraft.text.trim() || (proofDraft.mediaDataUrl ? `Fotodukaz k ukolu: ${task.title}` : "");
    if (!normalizedProofText) {
      setError("U tohoto úkolu vyplň alespoň krátký popis nebo přidej fotku důkazu.");
      return;
    }

    setProofSubmitting(true);
    setActiveTaskId(taskId);
    setError("");
    setMessage("");

    try {
      await api(`/game/submit-proof/${taskId}`, {
        method: "POST",
        body: {
          proof_text: normalizedProofText,
          proof_media_url: proofDraft.mediaDataUrl || null,
        },
      });
      closeProofComposer();
      await executeTaskCompletion(taskId);
    } catch (proofError) {
      setError(getErrorMessage(proofError, DASHBOARD_MESSAGES.completeTaskError));
    } finally {
      setProofSubmitting(false);
      setActiveTaskId(null);
    }
  }

  async function handleCompleteTask(taskId) {
    setActiveTaskId(taskId);
    setMessage("");
    setError("");

    try {
      const task = tasks.find((item) => item.id === taskId);

      if (task?.requires_proof && !task?.proof_submitted_at) {
        openProofComposer(task);
        return;
      }

      await executeTaskCompletion(taskId);
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
    <div className="brawl-shell relative min-h-screen overflow-hidden px-4 pb-28 pt-20">
      <ConfettiReward show={showConfetti} />
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-end gap-2">
          <InstallAppButton variant="dark" />
          <PushSubscribeButton />
        </div>
        {proofDraft.taskId ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-3xl border border-cyan-300/60 bg-slate-900 p-5 shadow-2xl">
              <h2 className="text-xl font-black text-cyan-100">Důkaz splnění ukolu</h2>
              <p className="mt-1 text-sm text-slate-300">Mise: {proofDraft.title}</p>

              <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                Co jsi splnil/a
                <textarea
                  value={proofDraft.text}
                  onChange={(event) =>
                    setProofDraft((current) => ({ ...current, text: event.target.value }))
                  }
                  placeholder="Napiš krátce, co jsi dnes udělal/a..."
                  className="mt-2 min-h-24 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                />
              </label>

              <input
                ref={proofFileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleProofFileChange}
              />

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handlePickProofPhoto}
                  className="rounded-2xl border border-emerald-400/50 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
                >
                  Otevřít fotoaparát a vyfotit důkaz
                </button>
              </div>

              {proofDraft.mediaDataUrl ? (
                <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/70 p-3">
                  <div className="text-xs font-semibold text-slate-300">
                    Přiložená fotka: {proofDraft.fileName || "dukaz.jpg"}
                  </div>
                  <img
                    src={proofDraft.mediaDataUrl}
                    alt="Důkaz splnění"
                    className="mt-2 max-h-64 w-full rounded-xl object-contain"
                  />
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => submitProofAndComplete(proofDraft.taskId)}
                  disabled={proofSubmitting}
                  className="rounded-2xl border border-cyan-400/50 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {proofSubmitting ? "Odesílám důkaz..." : "Odeslat důkaz a dokončit úkol"}
                </button>
                <button
                  type="button"
                  onClick={closeProofComposer}
                  disabled={proofSubmitting}
                  className="rounded-2xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Zrušit
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-4 text-slate-100 shadow-xl backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAvatarPicker((value) => !value)}
              aria-label="Změnit avatar"
              className="shrink-0 rounded-full transition hover:scale-105"
            >
              <Avatar name={avatar.name} image={avatar.image} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-black text-white">{avatar.name}</div>
              <div className="text-xs font-semibold text-cyan-200">
                {myLeague.name} · Level {level}
              </div>
            </div>
            <div className="shrink-0 rounded-xl border border-yellow-400/50 bg-yellow-400/15 px-3 py-1.5 text-sm font-black text-yellow-200">
              <strong className="text-white">{user?.gold || 0}</strong> zlata
            </div>
          </div>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-200">
              <span>{currentLevelXp}/100 XP</span>
              <span><strong className="text-white">{user?.current_streak || 0}</strong> dní v řadě</span>
            </div>
            <ProgressBar value={currentLevelXp} max={100} />
            <div className="mt-2 flex items-center gap-4 text-xs font-semibold text-slate-200">
              <span>Hotové mise <strong className="text-white">{completedTasks.length}</strong></span>
              <span>Celkem XP <strong className="text-white">{user?.xp || 0}</strong></span>
            </div>
            {daysToGoal > 0 ? (
              <div className="mt-2 text-[11px] font-semibold text-orange-200/80">
                Do dalšího bonusu chybí {daysToGoal} d
              </div>
            ) : null}
          </div>
          {showAvatarPicker ? (
            <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl border border-cyan-400/40 bg-slate-900 p-3">
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
                Nebo vlastní obrázek
                <input type="file" accept="image/*" className="mt-1 block" onChange={handleAvatarChange} />
              </label>
              <button
                type="button"
                className="mt-2 text-xs text-cyan-300 underline"
                onClick={() => setShowAvatarPicker(false)}
              >
                Zavřít
              </button>
            </div>
          ) : null}
        </section>

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
              <div className="grid grid-cols-3 gap-2 md:gap-4">
                <StatCard label="Čeká na schválení" value={waitingApprovalTasks.length} tone="amber" />
                <StatCard label="Dnešní úkoly" value={todayDailyTasks.length} tone="emerald" />
                <StatCard label="Mimořádné úkoly" value={extraTasks.length} tone="cyan" />
              </div>

              <section className="space-y-4">
                <div className="mt-6 flex items-center justify-between">
                  <h2 className="text-2xl font-black text-yellow-100">Dnešní úkoly</h2>
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
                    🌤️ Na dnešek nemáš žádný denní úkol. Užij si volno!
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <div className="mt-6 flex items-center justify-between">
                  <h2 className="text-2xl font-black text-yellow-100">Mimořádné úkoly</h2>
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
              <div className="brawl-accent-card rounded-2xl border-cyan-300/60 bg-cyan-900/70 px-4 py-3">
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
                Přehled misí, které už byly rodičem potvrzené.
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
                    🏁 Zatím nic dokončeného. Splň první misi a objeví se tady!
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
                Souhrn členů, úkolů a odměn v aktuální rodině.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <StatCard label="Členové" value={familyStats?.members || 0} tone="cyan" />
                <StatCard label="Děti" value={familyStats?.children || 0} tone="cyan" />
                <StatCard label="Celkem XP" value={familyStats?.total_xp || 0} tone="cyan" />
                <StatCard
                  label="Dokončené úkoly"
                  value={familyStats?.completed_tasks || 0}
                  tone="cyan"
                />
                <StatCard
                  label="Čeká na schválení"
                  value={familyStats?.pending_approval || 0}
                  tone="cyan"
                />
                <StatCard label="Odměny v obchodě" value={familyStats?.rewards || 0} tone="cyan" />
              </div>
            </aside>

            <div className="rounded-[32px] border border-cyan-300 bg-white/85 p-5 shadow-xl">
              <div className="rounded-3xl border border-fuchsia-300 bg-fuchsia-50/70 p-4">
                <h3 className="text-xl font-black text-fuchsia-950">Achievementy</h3>
                <p className="mt-1 text-sm text-fuchsia-900/70">
                  Dlouhodobé cíle, které odemykáš plněním misí.
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
                            {item.unlocked ? "odemčeno" : "v procesu"}
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
                      Achievementy zatím nejsou dostupné.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur">
      <div className="mx-auto grid max-w-3xl grid-cols-3 gap-1">
        {DASHBOARD_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-label={`Záložka ${item.label}`}
            aria-current={tab === item.id ? "page" : undefined}
            className={`flex min-h-[56px] flex-col items-center justify-center rounded-2xl text-xs font-bold transition ${
              tab === item.id ? "bg-cyan-500/20 text-cyan-100" : "text-slate-400 hover:bg-slate-900"
            }`}
          >
            <span className="text-xl leading-none" aria-hidden="true">
              {item.id === DASHBOARD_TAB_MISSIONS ? "🎯" : item.id === DASHBOARD_TAB_SHOP ? "🎁" : "🛡️"}
            </span>
            <span className="mt-1">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  </div>
  );
}

export default Dashboard;
