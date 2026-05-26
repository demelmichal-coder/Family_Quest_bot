import React, { useEffect, useMemo, useState } from "react";
import { ADMIN_MESSAGES, AI_REWRITE_STYLES } from "../constants/messages";
import { ROLE_CHILD } from "../constants/roles";
import { useUser } from "../context/UserContext";
import { useGroqRewrite } from "../hooks/useGroqRewrite";
import { getErrorMessage } from "../utils/errors";

const AI_STYLE_STORAGE_KEY = "familyquest.aiRewriteStyle";

const initialTaskForm = {
  title: "",
  description: "",
  xp: 10,
  gold: 0,
  is_daily: false,
  user_id: "",
  recurrence: null,
  recurrence_days: "",
};

const initialRewardForm = {
  name: "",
  description: "",
  cost: 0,
};

const initialChildForm = {
  username: "",
  telegram_id: "",
};

const initialPlannerForm = {
  user_id: "",
  mode: "skola",
  goal: "zodpovednost",
};

function getInitialRewriteStyle() {
  if (typeof window === "undefined") {
    return AI_REWRITE_STYLES[0].id;
  }

  const savedStyle = window.localStorage.getItem(AI_STYLE_STORAGE_KEY);
  const knownStyle = AI_REWRITE_STYLES.find((style) => style.id === savedStyle);
  return knownStyle ? knownStyle.id : AI_REWRITE_STYLES[0].id;
}

function Admin({ user, tasks, rewards, weeklyStats, onApproveTask, onDataChanged }) {
  const { api } = useUser();
  const [users, setUsers] = useState([]);
  const [family, setFamily] = useState(null);
  const [taskForm, setTaskForm] = useState(initialTaskForm);
  const [taskSuggestion, setTaskSuggestion] = useState(null);
  const [rewriteStyle, setRewriteStyle] = useState(getInitialRewriteStyle);
  const [rewardForm, setRewardForm] = useState(initialRewardForm);
  const [rewardSuggestion, setRewardSuggestion] = useState(null);
  const [childForm, setChildForm] = useState(initialChildForm);
  const [plannerForm, setPlannerForm] = useState(initialPlannerForm);
  const [plannerTasks, setPlannerTasks] = useState([]);
  const [selectedPlannerTasks, setSelectedPlannerTasks] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [submittingTask, setSubmittingTask] = useState(false);
  const [submittingReward, setSubmittingReward] = useState(false);
  const [submittingChild, setSubmittingChild] = useState(false);
  const [bulkCreatingChildren, setBulkCreatingChildren] = useState(false);
  const [runningDemoSetup, setRunningDemoSetup] = useState(false);
  const [generatingPlanner, setGeneratingPlanner] = useState(false);
  const [applyingPlanner, setApplyingPlanner] = useState(false);
  const [rewritingTask, setRewritingTask] = useState(false);
  const [rewritingReward, setRewritingReward] = useState(false);
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");
  const [taskChildFilter, setTaskChildFilter] = useState("all");
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [busyRewardId, setBusyRewardId] = useState(null);
  const [busyMemberId, setBusyMemberId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const { rewriteTask, rewriteReward } = useGroqRewrite();

  const players = useMemo(() => users.filter((member) => member.role === ROLE_CHILD), [users]);
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (taskStatusFilter === "pending" && task.is_completed) {
        return false;
      }
      if (taskStatusFilter === "completed" && !task.is_completed) {
        return false;
      }
      if (taskStatusFilter === "approval" && (task.is_daily || task.approved || task.is_completed)) {
        return false;
      }
      if (taskChildFilter !== "all" && String(task.user_id) !== String(taskChildFilter)) {
        return false;
      }
      return true;
    });
  }, [tasks, taskStatusFilter, taskChildFilter]);

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const [userList, familyData] = await Promise.all([api("/users/"), api("/families/me")]);
      setUsers(userList);
      setFamily(familyData);

      setTaskForm((current) => {
        if (current.user_id) {
          return current;
        }
        const firstPlayer = userList.find((member) => member.role === ROLE_CHILD);
        return firstPlayer ? { ...current, user_id: String(firstPlayer.id) } : current;
      });
      setPlannerForm((current) => {
        if (current.user_id) {
          return current;
        }
        const firstPlayer = userList.find((member) => member.role === ROLE_CHILD);
        return firstPlayer ? { ...current, user_id: String(firstPlayer.id) } : current;
      });
    } catch (loadError) {
      setError(getErrorMessage(loadError, ADMIN_MESSAGES.loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, [api]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(AI_STYLE_STORAGE_KEY, rewriteStyle);
  }, [rewriteStyle]);

  function handleTaskChange(event) {
    const { name, value, type, checked } = event.target;
    setTaskForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleRewardChange(event) {
    const { name, value } = event.target;
    setRewardForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleChildChange(event) {
    const { name, value } = event.target;
    setChildForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handlePlannerChange(event) {
    const { name, value } = event.target;
    setPlannerForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleTogglePlannerTask(index) {
    setSelectedPlannerTasks((current) => {
      const updated = new Set(current);
      if (updated.has(index)) {
        updated.delete(index);
      } else {
        updated.add(index);
      }
      return updated;
    });
  }

  function handleToggleAllPlannerTasks(checked) {
    if (checked) {
      setSelectedPlannerTasks(new Set(plannerTasks.map((_, idx) => idx)));
    } else {
      setSelectedPlannerTasks(new Set());
    }
  }

  async function createChildProfile({ username, telegramId }) {
    const fallbackName = `Dite ${players.length + 1}`;
    const generatedTelegramId =
      telegramId?.trim() || `demo-child-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    await api("/users/", {
      method: "POST",
      body: {
        telegram_id: generatedTelegramId,
        username: username?.trim() || fallbackName,
        role: ROLE_CHILD,
        xp: 0,
        gold: 0,
      },
    });
  }

  async function handleCreateChild(event) {
    event.preventDefault();
    setSubmittingChild(true);
    setError("");
    setMessage("");

    try {
      await createChildProfile({
        username: childForm.username,
        telegramId: childForm.telegram_id,
      });

      setChildForm(initialChildForm);
      setMessage("Detsky profil byl vytvoren. Ted mu muzes hned priradit ukol.");
      await loadUsers();
      await onDataChanged();
    } catch (createError) {
      setError(getErrorMessage(createError, "Nepodarilo se vytvorit detsky profil."));
    } finally {
      setSubmittingChild(false);
    }
  }

  async function handleCreateFourChildren() {
    setBulkCreatingChildren(true);
    setError("");
    setMessage("");

    try {
      const names = ["Kuba", "Anna", "Misa", "Tereza"];
      for (let index = 0; index < names.length; index += 1) {
        await createChildProfile({
          username: names[index],
          telegramId: `demo-brawler-${Date.now()}-${index}`,
        });
      }
      setMessage("Hotovo. Vytvoril jsem 4 test deti, ted jim muzes zadat mise.");
      await loadUsers();
      await onDataChanged();
    } catch (createError) {
      setError(getErrorMessage(createError, "Nepodarilo se vytvorit 4 test deti."));
    } finally {
      setBulkCreatingChildren(false);
    }
  }

  async function handleRunDemoSetup() {
    setRunningDemoSetup(true);
    setError("");
    setMessage("");

    try {
      const defaultChildren = ["Kuba", "Anna", "Misa", "Tereza"];
      const userList = await api("/users/");
      const currentChildren = userList.filter((member) => member.role === ROLE_CHILD);

      for (let i = currentChildren.length; i < 4; i += 1) {
        await createChildProfile({
          username: defaultChildren[i] || `Dite ${i + 1}`,
          telegramId: `demo-full-${Date.now()}-${i}`,
        });
      }

      const refreshedUsers = await api("/users/");
      const childUsers = refreshedUsers.filter((member) => member.role === ROLE_CHILD).slice(0, 4);

      const demoTasks = [
        { title: "Uklid pokoj", description: "Vysat, ustelet postel a uklidit hracky.", xp: 35, gold: 20, is_daily: false },
        { title: "Ranni rutina", description: "Vyčistit zuby, obleknout se a pripravit tasku.", xp: 20, gold: 10, is_daily: true },
        { title: "Pomoc v kuchyni", description: "Pomoc s pripravenim vecere a uklidem stolu.", xp: 30, gold: 15, is_daily: false },
      ];

      for (const child of childUsers) {
        for (const demoTask of demoTasks) {
          const exists = tasks.some(
            (task) => task.user_id === child.id && task.title.toLowerCase() === demoTask.title.toLowerCase()
          );
          if (!exists) {
            await api("/tasks/", {
              method: "POST",
              body: {
                ...demoTask,
                user_id: child.id,
              },
            });
          }
        }
      }

      const demoRewards = [
        { name: "Filmovy vecer", description: "Vyber filmu a popcorn navic.", cost: 70 },
        { name: "Zmrzlina", description: "Jedna velka porce podle vlastni volby.", cost: 45 },
        { name: "Herni bonus", description: "30 minut navic na oblibenou hru.", cost: 90 },
      ];

      for (const reward of demoRewards) {
        const exists = rewards.some(
          (item) => item.name.toLowerCase() === reward.name.toLowerCase()
        );
        if (!exists) {
          await api("/rewards/", {
            method: "POST",
            body: reward,
          });
        }
      }

      setMessage("Demo setup je hotovy: deti, mise i odmeny jsou pripraveny.");
      await loadUsers();
      await onDataChanged();
    } catch (setupError) {
      setError(getErrorMessage(setupError, "Demo setup se nepodarilo dokoncit."));
    } finally {
      setRunningDemoSetup(false);
    }
  }

  async function handleGeneratePlanner() {
    if (!plannerForm.user_id) {
      setError("Nejdriv vyber dite pro AI plan.");
      return;
    }

    setGeneratingPlanner(true);
    setError("");
    setMessage("");

    try {
      const selectedChild = players.find((member) => String(member.id) === String(plannerForm.user_id));
      const response = await api("/ai/plan-weekly", {
        method: "POST",
        body: {
          child_name: selectedChild?.username || "Dite",
          mode: plannerForm.mode,
          goal: plannerForm.goal,
          style: rewriteStyle,
        },
      });
      setPlannerTasks(response.tasks || []);
      setMessage("AI plan je pripraven. Zkontroluj ho a klikni na aplikovat plan.");
    } catch (plannerError) {
      setError(getErrorMessage(plannerError, "AI plan se nepodarilo vygenerovat."));
    } finally {
      setGeneratingPlanner(false);
    }
  }

  async function handleApplyPlanner() {
    if (!plannerForm.user_id || plannerTasks.length === 0) {
      setError("Nejdriv vygeneruj AI plan.");
      return;
    }

    if (selectedPlannerTasks.size === 0) {
      setError("Vyber alespon jednu misi z AI planu.");
      return;
    }

    setApplyingPlanner(true);
    setError("");
    setMessage("");

    try {
      const selectedTasks = Array.from(selectedPlannerTasks).map((idx) => plannerTasks[idx]);
      const tasksPayload = selectedTasks.map((item) => ({
        title: item.title,
        description: item.description,
        xp: Number(item.xp || 10),
        gold: Number(item.gold || 5),
        is_daily: Boolean(item.is_daily),
        user_id: Number(plannerForm.user_id),
      }));

      await api("/tasks/bulk/create", {
        method: "POST",
        body: {
          tasks: tasksPayload,
        },
      });

      setPlannerTasks([]);
      setSelectedPlannerTasks(new Set());
      setMessage(`AI plan byl aplikovan. ${selectedTasks.length} misi je vytvorene.`);
      await loadUsers();
      await onDataChanged();
    } catch (applyError) {
      setError(getErrorMessage(applyError, "AI plan se nepodarilo aplikovat."));
    } finally {
      setApplyingPlanner(false);
    }
  }

  async function handleCreateTask(event) {
    event.preventDefault();
    setSubmittingTask(true);
    setError("");
    setMessage("");

    try {
      await api("/tasks/", {
        method: "POST",
        body: {
          title: taskForm.title.trim(),
          description: taskForm.description.trim(),
          xp: Number(taskForm.xp),
          gold: Number(taskForm.gold),
          is_daily: taskForm.is_daily,
          user_id: Number(taskForm.user_id),
        },
      });

      setTaskForm((current) => ({
        ...initialTaskForm,
        user_id: current.user_id,
      }));
      setTaskSuggestion(null);
      setMessage(ADMIN_MESSAGES.createTaskSuccess);
      await loadUsers();
      await onDataChanged();
    } catch (createError) {
      setError(getErrorMessage(createError, ADMIN_MESSAGES.createTaskError));
    } finally {
      setSubmittingTask(false);
    }
  }

  async function handleRewriteTask() {
    const description = taskForm.description.trim();
    if (!description) {
      setMessage("");
      setError(ADMIN_MESSAGES.rewriteTaskMissingDescription);
      return;
    }

    setRewritingTask(true);
    setError("");
    setMessage("");
    setTaskSuggestion(null);

    try {
      const response = await rewriteTask(description, rewriteStyle);
      if (!response) {
        return;
      }

      setTaskSuggestion({
        title: response.herni_nazev || "",
        xp: response.xp,
        style: response.style || rewriteStyle,
      });
      setMessage(ADMIN_MESSAGES.rewriteTaskSuccess);
    } finally {
      setRewritingTask(false);
    }
  }

  function applyTaskSuggestion(mode) {
    if (!taskSuggestion) {
      return;
    }

    setTaskForm((current) => ({
      ...current,
      title:
        mode === "title" || mode === "all"
          ? taskSuggestion.title || current.title
          : current.title,
      xp: mode === "xp" || mode === "all" ? taskSuggestion.xp ?? current.xp : current.xp,
    }));

    if (mode === "title") {
      setMessage(ADMIN_MESSAGES.applyAiTitleSuccess);
    } else if (mode === "xp") {
      setMessage(ADMIN_MESSAGES.applyAiXpSuccess);
    } else {
      setMessage(ADMIN_MESSAGES.applyAiAllSuccess);
    }
  }

  async function handleRewriteReward() {
    const description = rewardForm.description.trim();
    if (!description) {
      setMessage("");
      setError(ADMIN_MESSAGES.rewriteRewardMissingDescription);
      return;
    }

    setRewritingReward(true);
    setError("");
    setMessage("");
    setRewardSuggestion(null);

    try {
      const response = await rewriteReward(description, rewriteStyle);
      if (!response) {
        return;
      }

      setRewardSuggestion({
        name: response.nazev_odmeny || "",
        cost: response.cost,
        style: response.style || rewriteStyle,
      });
      setMessage(ADMIN_MESSAGES.rewriteRewardSuccess);
    } finally {
      setRewritingReward(false);
    }
  }

  function applyRewardSuggestion(mode) {
    if (!rewardSuggestion) {
      return;
    }

    setRewardForm((current) => ({
      ...current,
      name:
        mode === "name" || mode === "all" ? rewardSuggestion.name || current.name : current.name,
      cost:
        mode === "cost" || mode === "all" ? rewardSuggestion.cost ?? current.cost : current.cost,
    }));

    if (mode === "name") {
      setMessage(ADMIN_MESSAGES.applyAiRewardNameSuccess);
    } else if (mode === "cost") {
      setMessage(ADMIN_MESSAGES.applyAiRewardCostSuccess);
    } else {
      setMessage(ADMIN_MESSAGES.applyAiRewardAllSuccess);
    }
  }

  async function handleCreateReward(event) {
    event.preventDefault();
    setSubmittingReward(true);
    setError("");
    setMessage("");

    try {
      await api("/rewards/", {
        method: "POST",
        body: {
          name: rewardForm.name.trim(),
          description: rewardForm.description.trim(),
          cost: Number(rewardForm.cost),
        },
      });
      setRewardForm(initialRewardForm);
      setRewardSuggestion(null);
      setMessage(ADMIN_MESSAGES.createRewardSuccess);
      await onDataChanged();
    } catch (createError) {
      setError(getErrorMessage(createError, ADMIN_MESSAGES.createRewardError));
    } finally {
      setSubmittingReward(false);
    }
  }

  async function handleDeleteTask(taskId) {
    setBusyTaskId(taskId);
    setError("");
    setMessage("");

    try {
      await api(`/tasks/${taskId}`, { method: "DELETE" });
      setMessage(ADMIN_MESSAGES.deleteTaskSuccess);
      await loadUsers();
      await onDataChanged();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, ADMIN_MESSAGES.deleteTaskError));
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleDeleteReward(rewardId) {
    setBusyRewardId(rewardId);
    setError("");
    setMessage("");

    try {
      await api(`/rewards/${rewardId}`, { method: "DELETE" });
      setMessage(ADMIN_MESSAGES.deleteRewardSuccess);
      await onDataChanged();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, ADMIN_MESSAGES.deleteRewardError));
    } finally {
      setBusyRewardId(null);
    }
  }

  async function handleApprove(taskId) {
    setBusyTaskId(taskId);
    setError("");
    setMessage("");

    try {
      const response = await onApproveTask(taskId);
      setMessage(response.detail || ADMIN_MESSAGES.approveTaskSuccess);
    } catch (approveError) {
      setError(getErrorMessage(approveError, ADMIN_MESSAGES.approveTaskError));
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleResetDaily() {
    setError("");
    setMessage("");

    try {
      const response = await api("/game/reset-daily", { method: "POST" });
      setMessage(response.detail || ADMIN_MESSAGES.resetDailySuccess);
      await onDataChanged();
    } catch (resetError) {
      setError(getErrorMessage(resetError, ADMIN_MESSAGES.resetDailyError));
    }
  }

  async function handleDeleteMember(memberId) {
    setBusyMemberId(memberId);
    setError("");
    setMessage("");

    try {
      await api(`/users/${memberId}`, { method: "DELETE" });
      setMessage(ADMIN_MESSAGES.deleteMemberSuccess);
      await loadUsers();
      await onDataChanged();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, ADMIN_MESSAGES.deleteMemberError));
    } finally {
      setBusyMemberId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950 p-6 shadow-2xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.35em] text-cyan-300">
                Administrace rodiny
              </div>
              <h1 className="mt-2 text-3xl font-black text-white">Sprava ukolu a odmen</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Vytvarej mise pro deti, spravuj odmeny a schvaluj mimoradne ukoly.
              </p>
              {family ? (
                <div className="mt-4 inline-flex rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100">
                  Rodina {family.name} | kod {family.invite_code}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleResetDaily}
              className="rounded-2xl border border-cyan-400/50 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
            >
              Reset denni ukoly
            </button>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Deti</div>
              <div className="mt-2 text-3xl font-bold text-white">{players.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Aktivni ukoly</div>
              <div className="mt-2 text-3xl font-bold text-white">{tasks.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Denne</div>
              <div className="mt-2 text-3xl font-bold text-white">
                {tasks.filter((task) => task.is_daily).length}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Ke schvaleni</div>
              <div className="mt-2 text-3xl font-bold text-white">
                {tasks.filter((task) => !task.is_daily && !task.approved).length}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Odmeny</div>
              <div className="mt-2 text-3xl font-bold text-white">{rewards.length}</div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/70 to-slate-900 p-5 shadow-xl">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-white">Pridat dite</h2>
                <p className="mt-1 text-sm text-cyan-100/80">
                  Tady se pridavaji detske profily. Muzes vytvorit jedno dite, nebo jednim klikem 4 test deti.
                </p>
              </div>

              <form className="space-y-3" onSubmit={handleCreateChild}>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-100">Jmeno ditete</span>
                  <input
                    required
                    name="username"
                    value={childForm.username}
                    onChange={handleChildChange}
                    className="w-full rounded-2xl border border-cyan-800 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                    placeholder="Treba Eliska"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-100">
                    Telegram ID (volitelne)
                  </span>
                  <input
                    name="telegram_id"
                    value={childForm.telegram_id}
                    onChange={handleChildChange}
                    className="w-full rounded-2xl border border-cyan-800 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                    placeholder="Kdyz nechas prazdne, vytvori se test ID"
                  />
                </label>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="submit"
                    disabled={submittingChild}
                    className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submittingChild ? "Pridavam..." : "Pridat dite"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateFourChildren}
                    disabled={bulkCreatingChildren}
                    className="rounded-2xl border border-fuchsia-400/40 bg-fuchsia-400/10 px-4 py-3 text-sm font-bold text-fuchsia-100 transition hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {bulkCreatingChildren ? "Vytvarim 4 deti..." : "Vytvorit 4 test deti"}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleRunDemoSetup}
                  disabled={runningDemoSetup}
                  className="w-full rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {runningDemoSetup
                    ? "Pripravuji kompletni demo..."
                    : "Spustit kompletni demo setup (4 deti + mise + odmeny)"}
                </button>
              </form>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {players.slice(0, 4).map((member) => (
                  <div
                    key={member.id}
                    className="rounded-2xl border border-cyan-400/20 bg-slate-950/70 px-3 py-2 text-sm text-cyan-100"
                  >
                    <div className="font-bold">{member.username || "Bez jmena"}</div>
                    <div className="text-xs text-cyan-200/80">{member.xp} XP | {member.gold} gold</div>
                  </div>
                ))}
                {players.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-cyan-500/30 bg-slate-950/60 px-3 py-3 text-sm text-cyan-200/80 sm:col-span-2">
                    Zatim tu nejsou zadne deti. Vytvor je vyse a pak jim rovnou prirad ukol v sekci Novy ukol.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-white">AI planovac tydne</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Vygeneruj balicek misi na cely tyden a jednim klikem ho aplikuj diteti.
                </p>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Dite</span>
                  <select
                    name="user_id"
                    value={plannerForm.user_id}
                    onChange={handlePlannerChange}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  >
                    {players.length === 0 ? <option value="">Nejsou dostupne zadne deti</option> : null}
                    {players.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.username || member.telegram_id}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">Režim</span>
                    <select
                      name="mode"
                      value={plannerForm.mode}
                      onChange={handlePlannerChange}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                    >
                      <option value="skola">Skolni tyden</option>
                      <option value="vikend">Vikend</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">Cil</span>
                    <input
                      name="goal"
                      value={plannerForm.goal}
                      onChange={handlePlannerChange}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                      placeholder="Treba samostatnost"
                    />
                  </label>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleGeneratePlanner}
                    disabled={generatingPlanner || players.length === 0}
                    className="rounded-2xl border border-violet-400/40 bg-violet-400/10 px-4 py-3 text-sm font-bold text-violet-100 transition hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {generatingPlanner ? "Generuji AI plan..." : "Vygenerovat AI plan"}
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyPlanner}
                    disabled={applyingPlanner || plannerTasks.length === 0 || selectedPlannerTasks.size === 0}
                    className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {applyingPlanner ? "Aplikuji plan..." : `Aplikovat plan (${selectedPlannerTasks.size}/${plannerTasks.length})`}
                  </button>
                </div>

                {plannerTasks.length > 0 ? (
                  <div className="rounded-2xl border border-violet-400/30 bg-violet-400/10 p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="selectAllPlanner"
                        checked={selectedPlannerTasks.size === plannerTasks.length && plannerTasks.length > 0}
                        onChange={(e) => handleToggleAllPlannerTasks(e.target.checked)}
                        className="h-4 w-4 cursor-pointer"
                      />
                      <label htmlFor="selectAllPlanner" className="text-xs font-bold uppercase tracking-[0.2em] text-violet-200 cursor-pointer">
                        Preview AI planu – vybrat {plannerTasks.length} polozek
                      </label>
                    </div>
                    <div className="space-y-2">
                      {plannerTasks.map((item, index) => (
                        <div
                          key={`${item.title}-${index}`}
                          className="flex items-start gap-3 rounded-xl border border-violet-300/30 bg-slate-950/40 px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            id={`planner-${index}`}
                            checked={selectedPlannerTasks.has(index)}
                            onChange={() => handleTogglePlannerTask(index)}
                            className="mt-1 h-4 w-4 cursor-pointer flex-shrink-0"
                          />
                          <label htmlFor={`planner-${index}`} className="flex-1 cursor-pointer">
                            <div className="font-semibold text-violet-100">{item.title}</div>
                            <div className="text-xs text-violet-200/80">
                              {item.xp} XP • {item.gold} gold • {item.is_daily ? "denni" : "mimoradny"}
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-white">Novy ukol</h2>
                <p className="mt-1 text-sm text-slate-400">Prirad konkretni ukol vybranemu diteti.</p>
              </div>
              <form className="space-y-4" onSubmit={handleCreateTask}>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Nazev</span>
                  <input
                    required
                    name="title"
                    value={taskForm.title}
                    onChange={handleTaskChange}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                    placeholder="Treba Uklid pokoj"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Popis</span>
                  <textarea
                    name="description"
                    value={taskForm.description}
                    onChange={handleTaskChange}
                    rows="4"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                    placeholder="Co presne je potreba splnit"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleRewriteTask}
                  disabled={rewritingTask}
                  className="w-full rounded-2xl border border-violet-400/40 bg-violet-400/10 px-4 py-3 text-sm font-bold text-violet-100 transition hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {rewritingTask ? "Generuji navrh..." : "Navrhnout herni ukol pomoci AI"}
                </button>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">
                    {ADMIN_MESSAGES.aiStyleLabel}
                  </span>
                  <select
                    value={rewriteStyle}
                    onChange={(event) => setRewriteStyle(event.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-violet-400"
                  >
                    {AI_REWRITE_STYLES.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                </label>
                {taskSuggestion ? (
                  <div className="rounded-2xl border border-violet-400/30 bg-violet-400/10 p-4">
                    <div className="text-xs font-bold uppercase tracking-[0.2em] text-violet-200">
                      AI navrh
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-violet-50">
                      <div>
                        <span className="font-semibold text-violet-200">Nazev:</span>{" "}
                        {taskSuggestion.title || "Bez navrhu"}
                      </div>
                      <div>
                        <span className="font-semibold text-violet-200">XP:</span>{" "}
                        {taskSuggestion.xp ?? "Bez navrhu"}
                      </div>
                      <div>
                        <span className="font-semibold text-violet-200">Styl:</span>{" "}
                        {taskSuggestion.style}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => applyTaskSuggestion("title")}
                        className="rounded-2xl border border-violet-300/40 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-violet-100 transition hover:bg-slate-950/60"
                      >
                        Prevzit nazev
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTaskSuggestion("xp")}
                        className="rounded-2xl border border-violet-300/40 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-violet-100 transition hover:bg-slate-950/60"
                      >
                        Prevzit XP
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTaskSuggestion("all")}
                        className="rounded-2xl bg-violet-300 px-3 py-2 text-sm font-bold text-violet-950 transition hover:bg-violet-200"
                      >
                        Prevzit vse
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleRewriteTask}
                      disabled={rewritingTask}
                      className="mt-3 w-full rounded-2xl border border-violet-300/40 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-violet-100 transition hover:bg-slate-950/60 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {rewritingTask ? "Generuji navrh..." : ADMIN_MESSAGES.aiRetry}
                    </button>
                  </div>
                ) : null}
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Komu priradit</span>
                  <select
                    required
                    name="user_id"
                    value={taskForm.user_id}
                    onChange={handleTaskChange}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  >
                    {players.length === 0 ? <option value="">Nejsou dostupne zadne deti</option> : null}
                    {players.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.username || member.telegram_id}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">XP</span>
                    <input
                      min="0"
                      type="number"
                      name="xp"
                      value={taskForm.xp}
                      onChange={handleTaskChange}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">Zlato</span>
                    <input
                      min="0"
                      type="number"
                      name="gold"
                      value={taskForm.gold}
                      onChange={handleTaskChange}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                    />
                  </label>
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
                  <input
                    type="checkbox"
                    name="is_daily"
                    checked={taskForm.is_daily}
                    onChange={handleTaskChange}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-400"
                  />
                  <span className="text-sm text-slate-200">Opakovat denne</span>
                </label>
                <select
                  name="recurrence"
                  value={taskForm.recurrence || ""}
                  onChange={handleTaskChange}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none"
                >
                  <option value="">Bez opakování</option>
                  <option value="daily">Denně</option>
                  <option value="weekly">Každý pondělí</option>
                  <option value="custom">Vlastní dny</option>
                </select>
                <button
                  type="submit"
                  disabled={submittingTask || players.length === 0}
                  className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {submittingTask ? "Ukladam..." : "Vytvorit ukol"}
                </button>
              </form>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-white">Nova odmena</h2>
                <p className="mt-1 text-sm text-slate-400">Pridej novou polozku do rodinneho obchodu.</p>
              </div>
              <form className="space-y-4" onSubmit={handleCreateReward}>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Nazev</span>
                  <input
                    required
                    name="name"
                    value={rewardForm.name}
                    onChange={handleRewardChange}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                    placeholder="Treba Filmovy vecer"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Popis</span>
                  <textarea
                    name="description"
                    value={rewardForm.description}
                    onChange={handleRewardChange}
                    rows="3"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                    placeholder="Co presne dite dostane"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleRewriteReward}
                  disabled={rewritingReward}
                  className="w-full rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {rewritingReward ? "Generuji navrh..." : "Navrhnout odmenu pomoci AI"}
                </button>
                {rewardSuggestion ? (
                  <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                    <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">
                      AI navrh odmeny
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-emerald-50">
                      <div>
                        <span className="font-semibold text-emerald-200">Nazev:</span>{" "}
                        {rewardSuggestion.name || "Bez navrhu"}
                      </div>
                      <div>
                        <span className="font-semibold text-emerald-200">Cena:</span>{" "}
                        {rewardSuggestion.cost ?? "Bez navrhu"}
                      </div>
                      <div>
                        <span className="font-semibold text-emerald-200">Styl:</span>{" "}
                        {rewardSuggestion.style}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => applyRewardSuggestion("name")}
                        className="rounded-2xl border border-emerald-300/40 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-slate-950/60"
                      >
                        Prevzit nazev
                      </button>
                      <button
                        type="button"
                        onClick={() => applyRewardSuggestion("cost")}
                        className="rounded-2xl border border-emerald-300/40 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-slate-950/60"
                      >
                        Prevzit cenu
                      </button>
                      <button
                        type="button"
                        onClick={() => applyRewardSuggestion("all")}
                        className="rounded-2xl bg-emerald-300 px-3 py-2 text-sm font-bold text-emerald-950 transition hover:bg-emerald-200"
                      >
                        Prevzit vse
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleRewriteReward}
                      disabled={rewritingReward}
                      className="mt-3 w-full rounded-2xl border border-emerald-300/40 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-slate-950/60 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {rewritingReward ? "Generuji navrh..." : ADMIN_MESSAGES.aiRetry}
                    </button>
                  </div>
                ) : null}
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Cena ve zlate</span>
                  <input
                    min="0"
                    type="number"
                    name="cost"
                    value={rewardForm.cost}
                    onChange={handleRewardChange}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  />
                </label>
                <button
                  type="submit"
                  disabled={submittingReward}
                  className="w-full rounded-2xl bg-emerald-400 px-4 py-3 font-bold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {submittingReward ? "Ukladam..." : "Vytvorit odmenu"}
                </button>
              </form>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">Aktivni ukoly</h2>
                  <p className="mt-1 text-sm text-slate-400">Prehled vsech ukolu v rodine.</p>
                </div>
                <button
                  type="button"
                  onClick={onDataChanged}
                  className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-400 hover:text-white"
                >
                  Obnovit
                </button>
              </div>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Stav ukolu
                  </span>
                  <select
                    value={taskStatusFilter}
                    onChange={(event) => setTaskStatusFilter(event.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white outline-none transition focus:border-cyan-400"
                  >
                    <option value="all">Vsechny</option>
                    <option value="pending">Aktivni</option>
                    <option value="completed">Dokoncene</option>
                    <option value="approval">Cekajici na schvaleni</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Dite
                  </span>
                  <select
                    value={taskChildFilter}
                    onChange={(event) => setTaskChildFilter(event.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white outline-none transition focus:border-cyan-400"
                  >
                    <option value="all">Vsechny deti</option>
                    {players.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.username || member.telegram_id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {loading ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-8 text-center text-slate-400">
                  Nacitam administraci...
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950 px-4 py-8 text-center text-slate-400">
                  Zadny ukol neodpovida zvolenemu filtru.
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredTasks.map((task) => {
                    const assignee = users.find((member) => member.id === task.user_id);
                    const needsApproval = !task.is_daily && !task.approved && !task.is_completed;
                    return (
                      <article
                        key={task.id}
                        className="rounded-3xl border border-slate-800 bg-slate-950 p-4 transition hover:border-cyan-500/50"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-bold text-white">{task.title}</h3>
                              {task.is_daily ? (
                                <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-200">
                                  Denne
                                </span>
                              ) : null}
                              {task.is_completed ? (
                                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-200">
                                  Dokonceno
                                </span>
                              ) : null}
                              {needsApproval ? (
                                <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-xs font-semibold text-rose-200">
                                  Ceka na schvaleni
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm text-slate-400">
                              {task.description || "Bez doplneneho popisu."}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                              <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-cyan-200">
                                {task.xp} XP
                              </span>
                              <span className="rounded-full bg-yellow-300/10 px-3 py-1 text-yellow-100">
                                {task.gold} zlata
                              </span>
                              <span className="rounded-full bg-white/5 px-3 py-1 text-slate-300">
                                {assignee?.username || assignee?.telegram_id || "Bez prirazeni"}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {needsApproval ? (
                              <button
                                type="button"
                                onClick={() => handleApprove(task.id)}
                                disabled={busyTaskId === task.id}
                                className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {busyTaskId === task.id ? "Schvaluji..." : "Schvalit"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => handleDeleteTask(task.id)}
                              disabled={busyTaskId === task.id}
                              className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {busyTaskId === task.id ? "Pracuji..." : "Smazat"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-white">Odmeny v obchodu</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Polozky, ktere si deti mohou koupit za zlato.
                </p>
              </div>
              {rewards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950 px-4 py-8 text-center text-slate-400">
                  Zatim tu nejsou zadne odmeny.
                </div>
              ) : (
                <div className="grid gap-4">
                  {rewards.map((reward) => (
                    <article
                      key={reward.id}
                      className="rounded-3xl border border-slate-800 bg-slate-950 p-4 transition hover:border-emerald-500/50"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold text-white">{reward.name}</h3>
                          <p className="mt-2 text-sm text-slate-400">
                            {reward.description || "Bez doplneneho popisu."}
                          </p>
                          <div className="mt-3 inline-flex rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                            {reward.cost} zlata
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteReward(reward.id)}
                          disabled={busyRewardId === reward.id}
                          className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busyRewardId === reward.id ? "Pracuji..." : "Smazat"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-white">Clenove rodiny</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Spravuj clenstvi v rodine. Odebrani clena smaze vsechna jeho data.
                </p>
              </div>
              {users.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950 px-4 py-8 text-center text-slate-400">
                  Zatim tu nejsou zadni clenove.
                </div>
              ) : (
                <div className="grid gap-3">
                  {users.map((member) => (
                    <article
                      key={member.id}
                      className="flex items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-xl">
                          {member.avatar || "👤"}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-bold text-white">
                              {member.username || member.telegram_id}
                            </span>
                            <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-300">
                              {member.role}
                            </span>
                          </div>
                          <div className="mt-1 flex gap-3 text-xs text-slate-400">
                            <span>{member.xp} XP</span>
                            <span>{member.gold} zlata</span>
                          </div>
                        </div>
                      </div>
                      {member.id !== user?.id ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteMember(member.id)}
                          disabled={busyMemberId === member.id}
                          className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busyMemberId === member.id ? "Odebírám..." : "Odebrat"}
                        </button>
                      ) : (
                        <span className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300">
                          Ty
                        </span>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Tydni statistiky deti */}
            {weeklyStats?.children?.length > 0 && (
              <section className="overflow-hidden rounded-[28px] border border-indigo-400/30 bg-slate-900/80 p-6 shadow-xl backdrop-blur">
                <h2 className="mb-5 text-lg font-black text-indigo-200">📊 Týdenní statistiky dětí</h2>
                <div className="flex flex-col gap-5">
                  {weeklyStats.children.map((child) => {
                    const maxActivity = Math.max(...child.activity_days, 1);
                    return (
                      <div key={child.user_id} className="rounded-2xl border border-slate-700/50 bg-slate-800/60 p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white">{child.username}</span>
                          <div className="flex gap-3 text-xs font-semibold text-slate-300">
                            <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-cyan-200">{child.total_xp} XP</span>
                            <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-violet-200">{child.tasks_completed} splněno</span>
                          </div>
                        </div>
                        <div className="mt-3">
                          <div className="mb-1 text-xs text-slate-400">Aktivita za posledních 7 dní</div>
                          <div className="flex items-end gap-1 h-10">
                            {child.activity_days.map((count, idx) => {
                              const dayLabels = ["Po","Út","St","Čt","Pá","So","Ne"];
                              const dayIndex = (new Date().getDay() + 6 - (6 - idx)) % 7;
                              return (
                                <div key={idx} className="flex flex-col items-center flex-1">
                                  <div
                                    className="w-full rounded-t-sm bg-indigo-400/70 transition-all"
                                    style={{ height: `${count === 0 ? 4 : Math.round((count / maxActivity) * 32) + 4}px` }}
                                    title={`${count} úkolů`}
                                  />
                                  <span className="mt-1 text-[9px] text-slate-500">{dayLabels[dayIndex]}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Rodinne vyzvy */}
            <section className="rounded-3xl border border-amber-500/30 bg-slate-900 p-5 shadow-xl">
              <h2 className="mb-4 text-lg font-black text-amber-200">🏆 Rodinné výzvy</h2>
              <div className="space-y-3">
                <p className="text-sm text-slate-400">Aktivní výzvy se načítají...</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Admin;
