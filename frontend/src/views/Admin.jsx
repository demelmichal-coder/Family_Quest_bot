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
  requires_proof: false,
  due_date: "",
  due_time: "",
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

const initialChallengeForm = {
  title: "",
  description: "",
  target: 30,
  bonus_xp: 80,
  bonus_gold: 20,
  days: 14,
};

function getTodayDateKey() {
  return toDateKey(new Date());
}

function createInitialFamilyPlannerForm() {
  return {
    goal: "zodpovednost",
    tasks_per_child: 3,
    start_date: getTodayDateKey(),
    repeat_same_tasks_all_week: false,
  };
}

function getInitialRewriteStyle() {
  if (typeof window === "undefined") {
    return AI_REWRITE_STYLES[0].id;
  }

  const savedStyle = window.localStorage.getItem(AI_STYLE_STORAGE_KEY);
  const knownStyle = AI_REWRITE_STYLES.find((style) => style.id === savedStyle);
  return knownStyle ? knownStyle.id : AI_REWRITE_STYLES[0].id;
}

function toDateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekdayLabel(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString("cs-CZ", { weekday: "short" });
}

function getPlanningWeek(dateKey) {
  const baseDate = new Date(`${dateKey}T12:00:00`);
  return Array.from({ length: 7 }, (_, idx) => {
    const nextDate = new Date(baseDate);
    nextDate.setDate(baseDate.getDate() + idx);
    const key = toDateKey(nextDate);
    return {
      key,
      label: getWeekdayLabel(key),
      day: key.slice(8, 10),
    };
  });
}

function Admin({
  user,
  tasks,
  rewards,
  weeklyStats,
  dailyActivity,
  engagementSummary,
  onApproveTask,
  onDataChanged,
}) {
  const { api } = useUser();
  const [users, setUsers] = useState([]);
  const [family, setFamily] = useState(null);
  const [taskForm, setTaskForm] = useState(initialTaskForm);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [taskSuggestion, setTaskSuggestion] = useState(null);
  const [rewriteStyle, setRewriteStyle] = useState(getInitialRewriteStyle);
  const [rewardForm, setRewardForm] = useState(initialRewardForm);
  const [rewardSuggestion, setRewardSuggestion] = useState(null);
  const [childForm, setChildForm] = useState(initialChildForm);
  const [plannerForm, setPlannerForm] = useState(initialPlannerForm);
  const [plannerTasks, setPlannerTasks] = useState([]);
  const [selectedPlannerTasks, setSelectedPlannerTasks] = useState(new Set());
  const [familyPlannerForm, setFamilyPlannerForm] = useState(createInitialFamilyPlannerForm);
  const [familyPlannerChildren, setFamilyPlannerChildren] = useState([]);
  const [selectedFamilyPlannerTasks, setSelectedFamilyPlannerTasks] = useState(new Set());
  const [familyPlannerSchedule, setFamilyPlannerSchedule] = useState({});
  const [generatingFamilyPlanner, setGeneratingFamilyPlanner] = useState(false);
  const [applyingFamilyPlanner, setApplyingFamilyPlanner] = useState(false);
  const [challenges, setChallenges] = useState([]);
  const [challengeForm, setChallengeForm] = useState(initialChallengeForm);
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [creatingSeasonalChallenge, setCreatingSeasonalChallenge] = useState(false);
  const [deletingChallengeId, setDeletingChallengeId] = useState(null);
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
  const [taskDateFilter, setTaskDateFilter] = useState("all");
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [busyRewardId, setBusyRewardId] = useState(null);
  const [busyMemberId, setBusyMemberId] = useState(null);
  const [penaltyBusyUserId, setPenaltyBusyUserId] = useState(null);
  const [penaltyByUser, setPenaltyByUser] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const { rewriteTask, rewriteReward } = useGroqRewrite();

  const weekCalendar = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(start);
      d.setDate(start.getDate() + idx);
      const key = toDateKey(d);
      return {
        key,
        label: getWeekdayLabel(key),
        day: key.slice(8, 10),
      };
    });
  }, []);

  const planningWeek = useMemo(
    () => getPlanningWeek(familyPlannerForm.start_date || getTodayDateKey()),
    [familyPlannerForm.start_date]
  );

  const players = useMemo(() => users.filter((member) => member.role === ROLE_CHILD), [users]);
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (taskStatusFilter === "pending" && task.is_completed) {
        return false;
      }
      if (taskStatusFilter === "completed" && !task.approved) {
        return false;
      }
      if (taskStatusFilter === "approval" && (!task.is_completed || task.approved)) {
        return false;
      }
      if (taskChildFilter !== "all" && String(task.user_id) !== String(taskChildFilter)) {
        return false;
      }
      if (taskDateFilter !== "all") {
        if (!task.due_date || task.due_date !== taskDateFilter) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, taskStatusFilter, taskChildFilter, taskDateFilter]);

  async function loadChallenges() {
    try {
      const challengeList = await api("/challenges/all");
      setChallenges(challengeList || []);
    } catch {
      setChallenges([]);
    }
  }

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const [userList, familyData, challengeList] = await Promise.all([
        api("/users/"),
        api("/families/me"),
        api("/challenges/all"),
      ]);
      setUsers(userList);
      setFamily(familyData);
      setChallenges(challengeList || []);

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

  function resetTaskEditor(preferredUserId) {
    const fallbackUserId = preferredUserId || (players[0] ? String(players[0].id) : "");
    setEditingTaskId(null);
    setTaskSuggestion(null);
    setTaskForm({
      ...initialTaskForm,
      user_id: fallbackUserId,
    });
  }

  function handleStartTaskEdit(task) {
    setEditingTaskId(task.id);
    setTaskSuggestion(null);
    setTaskForm({
      title: task.title || "",
      description: task.description || "",
      xp: Number(task.xp ?? 10),
      gold: Number(task.gold ?? 0),
      is_daily: Boolean(task.is_daily),
      requires_proof: Boolean(task.requires_proof),
      due_date: task.due_date || "",
      due_time: task.due_time || "",
      user_id: task.user_id ? String(task.user_id) : "",
      recurrence: task.recurrence || "",
      recurrence_days: task.recurrence_days || "",
    });
    document.getElementById("task-create")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function handleCancelTaskEdit() {
    resetTaskEditor(taskForm.user_id);
    setMessage("Rezim upravy ukolu byl zrusen.");
    setError("");
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

  function handleFamilyPlannerChange(event) {
    const { name, value, type, checked } = event.target;
    setFamilyPlannerForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleFamilyPlannerScheduleChange(key, value) {
    setFamilyPlannerSchedule((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleChallengeChange(event) {
    const { name, value } = event.target;
    setChallengeForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleToggleFamilyPlannerTask(key) {
    setSelectedFamilyPlannerTasks((current) => {
      const updated = new Set(current);
      if (updated.has(key)) {
        updated.delete(key);
      } else {
        updated.add(key);
      }
      return updated;
    });
  }

  function handleToggleAllFamilyPlannerTasks(checked) {
    if (!checked) {
      setSelectedFamilyPlannerTasks(new Set());
      return;
    }
    const allKeys = [];
    familyPlannerChildren.forEach((child) => {
      (child.tasks || []).forEach((_, idx) => {
        allKeys.push(`${child.user_id}:${idx}`);
      });
    });
    setSelectedFamilyPlannerTasks(new Set(allKeys));
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
        requires_proof: Boolean(item.requires_proof),
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
      await loadChallenges();
    } catch (applyError) {
      setError(getErrorMessage(applyError, "AI plan se nepodarilo aplikovat."));
    } finally {
      setApplyingPlanner(false);
    }
  }

  async function handleGenerateFamilyPlanner() {
    setGeneratingFamilyPlanner(true);
    setError("");
    setMessage("");

    try {
      const response = await api("/ai/plan-family-daily", {
        method: "POST",
        body: {
          goal: familyPlannerForm.goal,
          style: rewriteStyle,
          tasks_per_child: Number(familyPlannerForm.tasks_per_child || 3),
        },
      });
      const children = response.children || [];
      setFamilyPlannerChildren(children);
      const preselect = [];
      const nextSchedule = {};
      children.forEach((child) => {
        (child.tasks || []).forEach((_, idx) => {
          const key = `${child.user_id}:${idx}`;
          preselect.push(key);
          nextSchedule[key] = familyPlannerForm.start_date || getTodayDateKey();
        });
      });
      setFamilyPlannerSchedule(nextSchedule);
      setSelectedFamilyPlannerTasks(new Set(preselect));
      setMessage("AI denni plan pro celou rodinu je pripraven.");
    } catch (plannerError) {
      setError(getErrorMessage(plannerError, "AI denni plan se nepodarilo vygenerovat."));
    } finally {
      setGeneratingFamilyPlanner(false);
    }
  }

  async function handleApplyFamilyPlanner() {
    if (familyPlannerChildren.length === 0) {
      setError("Nejdriv vygeneruj rodinny AI plan.");
      return;
    }
    if (selectedFamilyPlannerTasks.size === 0) {
      setError("Vyber alespon jeden ukol z rodinneho planu.");
      return;
    }

    setApplyingFamilyPlanner(true);
    setError("");
    setMessage("");

    try {
      const payload = [];
      familyPlannerChildren.forEach((child) => {
        (child.tasks || []).forEach((task, idx) => {
          const key = `${child.user_id}:${idx}`;
          if (!selectedFamilyPlannerTasks.has(key)) {
            return;
          }
          const scheduledDates = familyPlannerForm.repeat_same_tasks_all_week
            ? planningWeek.map((entry) => entry.key)
            : [familyPlannerSchedule[key] || familyPlannerForm.start_date || getTodayDateKey()];

          scheduledDates.forEach((dueDate) => {
            payload.push({
              title: task.title,
              description: task.description,
              xp: Number(task.xp || 10),
              gold: Number(task.gold || 0),
              is_daily: false,
              requires_proof: Boolean(task.requires_proof),
              user_id: Number(child.user_id),
              due_date: dueDate,
            });
          });
        });
      });

      await api("/tasks/bulk/create", {
        method: "POST",
        body: { tasks: payload },
      });

      setMessage(`Rodinny AI plan aplikovan. Vytvoreno ${payload.length} ukolu.`);
      setFamilyPlannerChildren([]);
      setSelectedFamilyPlannerTasks(new Set());
      setFamilyPlannerSchedule({});
      await loadUsers();
      await onDataChanged();
      await loadChallenges();
    } catch (applyError) {
      setError(getErrorMessage(applyError, "Rodinny AI plan se nepodarilo aplikovat."));
    } finally {
      setApplyingFamilyPlanner(false);
    }
  }

  async function handleCreateChallenge(event) {
    event.preventDefault();
    setCreatingChallenge(true);
    setError("");
    setMessage("");

    try {
      await api("/challenges/", {
        method: "POST",
        body: {
          title: challengeForm.title.trim(),
          description: challengeForm.description.trim(),
          target: Number(challengeForm.target),
          bonus_xp: Number(challengeForm.bonus_xp),
          bonus_gold: Number(challengeForm.bonus_gold),
          days: Number(challengeForm.days),
        },
      });
      setChallengeForm(initialChallengeForm);
      await loadChallenges();
      setMessage("Rodinna vyzva byla vytvorena.");
    } catch (challengeError) {
      setError(getErrorMessage(challengeError, "Rodinnou vyzvu se nepodarilo vytvorit."));
    } finally {
      setCreatingChallenge(false);
    }
  }

  async function handleCreateSeasonalChallenge(season) {
    setCreatingSeasonalChallenge(true);
    setError("");
    setMessage("");

    try {
      await api("/challenges/seasonal", {
        method: "POST",
        body: {
          season,
          target: 60,
          bonus_xp: 120,
          bonus_gold: 40,
          days: 14,
        },
      });
      await loadChallenges();
      setMessage("Sezonni event byl vytvoren.");
    } catch (seasonError) {
      setError(getErrorMessage(seasonError, "Sezonni event se nepodarilo vytvorit."));
    } finally {
      setCreatingSeasonalChallenge(false);
    }
  }

  async function handleDeleteChallenge(challengeId) {
    setDeletingChallengeId(challengeId);
    setError("");
    setMessage("");

    try {
      await api(`/challenges/${challengeId}`, { method: "DELETE" });
      await loadChallenges();
      setMessage("Vyzva byla smazana.");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Vyzvu se nepodarilo smazat."));
    } finally {
      setDeletingChallengeId(null);
    }
  }

  async function handleCreateTask(event) {
    event.preventDefault();
    setSubmittingTask(true);
    setError("");
    setMessage("");

    try {
      const body = {
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        xp: Number(taskForm.xp),
        gold: Number(taskForm.gold),
        is_daily: taskForm.is_daily,
        requires_proof: Boolean(taskForm.requires_proof),
        due_date: taskForm.due_date || null,
        due_time: taskForm.due_time.trim() || null,
        recurrence: taskForm.recurrence || null,
        recurrence_days: taskForm.recurrence_days || null,
        user_id: Number(taskForm.user_id),
      };

      if (editingTaskId) {
        await api(`/tasks/${editingTaskId}`, {
          method: "PUT",
          body,
        });
        setMessage(ADMIN_MESSAGES.updateTaskSuccess);
      } else {
        await api("/tasks/", {
          method: "POST",
          body,
        });
        setMessage(ADMIN_MESSAGES.createTaskSuccess);
      }

      resetTaskEditor(taskForm.user_id);
      if (!editingTaskId) {
        await loadUsers();
      }
      await onDataChanged();
    } catch (createError) {
      setError(
        getErrorMessage(
          createError,
          editingTaskId ? ADMIN_MESSAGES.updateTaskError : ADMIN_MESSAGES.createTaskError
        )
      );
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

  async function handleReviewProof(taskId, approved) {
    setBusyTaskId(taskId);
    setError("");
    setMessage("");

    try {
      const response = await api(`/game/review-proof/${taskId}`, {
        method: "POST",
        body: {
          approved,
          note: approved ? "Rodic schvalil dukaz." : "Rodic pozaduje presvedcivejsi dukaz.",
        },
      });
      setMessage(
        approved
          ? "Dukaz byl rodicem schvalen."
          : "Dukaz byl vratcen k doplneni."
      );
      await onDataChanged();
      return response;
    } catch (reviewError) {
      setError(getErrorMessage(reviewError, "Hodnoceni dukazu se nepodarilo ulozit."));
      return null;
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

  function handlePenaltyChange(userId, field, value) {
    setPenaltyByUser((current) => ({
      ...current,
      [userId]: {
        xp: current[userId]?.xp ?? "",
        gold: current[userId]?.gold ?? "",
        reason: current[userId]?.reason ?? "",
        [field]: value,
      },
    }));
  }

  async function handlePenalizeChild(userId) {
    const row = penaltyByUser[userId] || {};
    const xp = Number(row.xp || 0);
    const gold = Number(row.gold || 0);
    const reason = String(row.reason || "").trim();

    if (xp <= 0 && gold <= 0) {
      setError("Zadej aspon XP nebo gold k odebrani.");
      setMessage("");
      return;
    }

    setPenaltyBusyUserId(userId);
    setError("");
    setMessage("");

    try {
      const updated = await api(`/users/${userId}/penalize`, {
        method: "POST",
        body: {
          xp: Math.max(0, xp),
          gold: Math.max(0, gold),
          reason,
        },
      });

      setPenaltyByUser((current) => ({
        ...current,
        [userId]: { xp: "", gold: "", reason: "" },
      }));
      setMessage(
        `Odebrano: ${updated.username || "Dite"} ma nyni ${updated.xp} XP a ${updated.gold} gold.`
      );
      await loadUsers();
      await onDataChanged();
    } catch (penaltyError) {
      setError(getErrorMessage(penaltyError, "Odebrani XP/gold se nepodarilo."));
    } finally {
      setPenaltyBusyUserId(null);
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

        <nav className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg backdrop-blur">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Rychly presun v menu
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="#daily-activity" className="rounded-full border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-violet-400/20">
              Dnes v rodine
            </a>
            <a href="#children-block" className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20">
              Pridat dite
            </a>
            <a href="#family-planner" className="rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-4 py-2 text-sm font-semibold text-fuchsia-100 transition hover:bg-fuchsia-400/20">
              AI denni plan
            </a>
            <a href="#task-create" className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20">
              Formular ukolu
            </a>
            <a href="#task-list" className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-400 hover:text-white">
              Aktivni ukoly
            </a>
            <a href="#reward-create" className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20">
              Formular odmen
            </a>
            <a href="#reward-list" className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-sm font-semibold text-yellow-100 transition hover:bg-yellow-400/20">
              Odmeny v obchodu
            </a>
          </div>
        </nav>

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

        {dailyActivity && dailyActivity.children && dailyActivity.children.length > 0 ? (
          <section id="daily-activity" className="scroll-mt-6 rounded-3xl border border-violet-500/30 bg-gradient-to-br from-violet-950/60 to-slate-900 p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-violet-300">Dnes v rodine</div>
                <h2 className="mt-1 text-xl font-bold text-white">Co rodina dnes splnila</h2>
              </div>
              {dailyActivity.total_pending_approval > 0 ? (
                <a
                  href="#task-list"
                  className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/20"
                >
                  {dailyActivity.total_pending_approval} ceka na schvaleni
                </a>
              ) : (
                <a
                  href="#task-list"
                  className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
                >
                  Vse schvaleno
                </a>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {dailyActivity.children.map((child) => (
                <div
                  key={child.user_id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="mb-3 flex items-center gap-3">
                    {typeof child.avatar === "string" && child.avatar.startsWith("data:image") ? (
                      <img
                        src={child.avatar}
                        alt={child.username || "avatar"}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : child.avatar ? (
                      <span className="text-2xl">{child.avatar}</span>
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-400/20 text-lg font-bold text-violet-200">
                        {(child.username || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-white">{child.username}</div>
                      {child.streak > 0 ? (
                        <div className="text-xs text-orange-300">🔥 {child.streak} denu</div>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-white/5 py-2">
                      <div className="text-lg font-bold text-white">{child.tasks_done_today}</div>
                      <div className="text-xs text-slate-400">misi</div>
                    </div>
                    <div className="rounded-xl bg-white/5 py-2">
                      <div className="text-lg font-bold text-cyan-300">{child.xp_earned_today}</div>
                      <div className="text-xs text-slate-400">XP</div>
                    </div>
                    <div className="rounded-xl bg-white/5 py-2">
                      <div className="text-lg font-bold text-yellow-300">{child.gold_earned_today}</div>
                      <div className="text-xs text-slate-400">zlata</div>
                    </div>
                  </div>
                  {child.pending_approval > 0 ? (
                    <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-center text-xs text-amber-200">
                      {child.pending_approval} ceka na schvaleni
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {engagementSummary ? (
          <section className="rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/60 to-slate-900 p-5 shadow-xl">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-widest text-cyan-300">Engagement report</div>
                <h2 className="mt-1 text-xl font-bold text-white">Poslednich {engagementSummary.period_days} dni</h2>
                <p className="mt-1 text-xs text-cyan-100/80">
                  Obdobi {engagementSummary.period_start} az {engagementSummary.period_end}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-200">
                Dokonceni: {engagementSummary.completion_rate_7d}%
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Deti aktivni</div>
                <div className="mt-1 text-2xl font-bold text-white">
                  {engagementSummary.active_children_7d}/{engagementSummary.children_total}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Pridelene ukoly</div>
                <div className="mt-1 text-2xl font-bold text-white">{engagementSummary.assigned_tasks_7d}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Dokoncene ukoly</div>
                <div className="mt-1 text-2xl font-bold text-cyan-300">{engagementSummary.completed_tasks_7d}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Nakupy odmen</div>
                <div className="mt-1 text-2xl font-bold text-amber-300">{engagementSummary.purchases_7d}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Prumer dokoncenosti</div>
                <div className="mt-1 text-2xl font-bold text-emerald-300">{engagementSummary.completion_rate_7d}%</div>
              </div>
            </div>

            {engagementSummary.children?.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs uppercase tracking-[0.2em] text-slate-400">
                      <th className="py-2 pr-3">Dite</th>
                      <th className="py-2 pr-3">Pridelene</th>
                      <th className="py-2 pr-3">Dokoncene</th>
                      <th className="py-2 pr-3">Dokonceni</th>
                      <th className="py-2 pr-3">Ceka schvaleni</th>
                      <th className="py-2 pr-0">Streak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {engagementSummary.children.map((child) => (
                      <tr key={child.user_id} className="border-b border-white/5 text-slate-200 last:border-b-0">
                        <td className="py-2 pr-3 font-semibold text-white">{child.username}</td>
                        <td className="py-2 pr-3">{child.assigned_tasks_7d}</td>
                        <td className="py-2 pr-3">{child.completed_tasks_7d}</td>
                        <td className="py-2 pr-3">{child.completion_rate_7d}%</td>
                        <td className="py-2 pr-3">{child.pending_approval}</td>
                        <td className="py-2 pr-0">{child.streak}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-6">
            <section id="children-block" className="scroll-mt-6 rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/70 to-slate-900 p-5 shadow-xl">
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
                    className="rounded-2xl border border-cyan-400/20 bg-slate-950/70 px-3 py-3 text-sm text-cyan-100"
                  >
                    <div className="font-bold">{member.username || "Bez jmena"}</div>
                    <div className="text-xs text-cyan-200/80">{member.xp} XP | {member.gold} gold</div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min="0"
                        value={penaltyByUser[member.id]?.xp ?? ""}
                        onChange={(event) =>
                          handlePenaltyChange(member.id, "xp", event.target.value)
                        }
                        className="w-full rounded-xl border border-cyan-800 bg-slate-950 px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-400"
                        placeholder="-XP"
                      />
                      <input
                        type="number"
                        min="0"
                        value={penaltyByUser[member.id]?.gold ?? ""}
                        onChange={(event) =>
                          handlePenaltyChange(member.id, "gold", event.target.value)
                        }
                        className="w-full rounded-xl border border-cyan-800 bg-slate-950 px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-400"
                        placeholder="-gold"
                      />
                    </div>
                    <input
                      type="text"
                      value={penaltyByUser[member.id]?.reason ?? ""}
                      onChange={(event) =>
                        handlePenaltyChange(member.id, "reason", event.target.value)
                      }
                      className="mt-2 w-full rounded-xl border border-cyan-800 bg-slate-950 px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-400"
                      placeholder="Duvod (volitelne)"
                    />
                    <button
                      type="button"
                      onClick={() => handlePenalizeChild(member.id)}
                      disabled={penaltyBusyUserId === member.id}
                      className="mt-2 w-full rounded-xl border border-rose-400/40 bg-rose-400/10 px-2 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {penaltyBusyUserId === member.id ? "Odebiram..." : "Odebrat XP/gold"}
                    </button>
                  </div>
                ))}
                {players.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-cyan-500/30 bg-slate-950/60 px-3 py-3 text-sm text-cyan-200/80 sm:col-span-2">
                    Zatim tu nejsou zadne deti. Vytvor je vyse a pak jim rovnou prirad ukol v sekci Novy ukol.
                  </div>
                ) : null}
              </div>
            </section>

            <section id="family-planner" className="scroll-mt-6 rounded-3xl border border-fuchsia-500/30 bg-slate-900 p-5 shadow-xl">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-white">AI denni plan pro celou rodinu</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Vygeneruje ukoly napric detmi podle historie plneni a dovoli je naplanovat na konkretni den, nebo stejne rozlozit na cely tyden.
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">Spolecny cil</span>
                    <input
                      name="goal"
                      value={familyPlannerForm.goal}
                      onChange={handleFamilyPlannerChange}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-fuchsia-400"
                      placeholder="Treba samostatnost"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">Ukolu na dite</span>
                    <input
                      name="tasks_per_child"
                      type="number"
                      min="1"
                      max="5"
                      value={familyPlannerForm.tasks_per_child}
                      onChange={handleFamilyPlannerChange}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-fuchsia-400"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">Den planu</span>
                    <input
                      name="start_date"
                      type="date"
                      value={familyPlannerForm.start_date}
                      onChange={handleFamilyPlannerChange}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-fuchsia-400"
                    />
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/5 px-4 py-3 lg:col-span-2">
                    <input
                      name="repeat_same_tasks_all_week"
                      type="checkbox"
                      checked={familyPlannerForm.repeat_same_tasks_all_week}
                      onChange={handleFamilyPlannerChange}
                      className="h-4 w-4"
                    />
                    <span className="text-sm font-medium text-fuchsia-100">
                      Stejne ukoly kazdy den cely tyden
                    </span>
                  </label>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleGenerateFamilyPlanner}
                    disabled={generatingFamilyPlanner || players.length === 0}
                    className="rounded-2xl border border-fuchsia-400/40 bg-fuchsia-400/10 px-4 py-3 text-sm font-bold text-fuchsia-100 transition hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {generatingFamilyPlanner ? "Generuji rodinny plan..." : "Vygenerovat rodinny plan"}
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyFamilyPlanner}
                    disabled={applyingFamilyPlanner || selectedFamilyPlannerTasks.size === 0}
                    className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {applyingFamilyPlanner
                      ? "Aplikuji plan..."
                      : `Aplikovat plan (${selectedFamilyPlannerTasks.size})`}
                  </button>
                </div>

                {familyPlannerChildren.length > 0 ? (
                  <div className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-400/10 p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="selectAllFamilyPlanner"
                        checked={
                          selectedFamilyPlannerTasks.size > 0 &&
                          familyPlannerChildren.every((child) =>
                            (child.tasks || []).every((_, idx) =>
                              selectedFamilyPlannerTasks.has(`${child.user_id}:${idx}`)
                            )
                          )
                        }
                        onChange={(e) => handleToggleAllFamilyPlannerTasks(e.target.checked)}
                        className="h-4 w-4 cursor-pointer"
                      />
                      <label htmlFor="selectAllFamilyPlanner" className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-200 cursor-pointer">
                        Vybrat vsechny navrzene ukoly
                      </label>
                    </div>

                    <div className="space-y-3">
                      {familyPlannerChildren.map((child) => (
                        <div key={child.user_id} className="rounded-xl border border-fuchsia-300/20 bg-slate-950/40 p-3">
                          <div className="mb-2 text-sm font-bold text-fuchsia-100">
                            {child.child_name} • vekovy hint {child.age_hint} • 14d splneno {child.history?.completed_last_14_days ?? 0}
                          </div>
                          <div className="space-y-2">
                            {(child.tasks || []).map((taskItem, idx) => {
                              const key = `${child.user_id}:${idx}`;
                              return (
                                <div key={key} className="rounded-lg border border-fuchsia-300/20 bg-slate-950/50 px-3 py-2">
                                  <label className="flex cursor-pointer items-start gap-3">
                                    <input
                                      type="checkbox"
                                      checked={selectedFamilyPlannerTasks.has(key)}
                                      onChange={() => handleToggleFamilyPlannerTask(key)}
                                      className="mt-1 h-4 w-4"
                                    />
                                    <span className="text-sm text-fuchsia-50">
                                      <span className="font-semibold">{taskItem.title}</span>
                                      <span className="ml-2 text-xs text-fuchsia-200/80">
                                        {taskItem.xp} XP • {taskItem.gold} gold • {taskItem.requires_proof ? "dukaz" : "bez dukazu"}
                                      </span>
                                    </span>
                                  </label>
                                  <div className="mt-3 flex items-center justify-between gap-3 pl-7">
                                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-200/70">
                                      Den ukolu
                                    </span>
                                    <select
                                      value={familyPlannerSchedule[key] || familyPlannerForm.start_date}
                                      disabled={familyPlannerForm.repeat_same_tasks_all_week}
                                      onChange={(event) => handleFamilyPlannerScheduleChange(key, event.target.value)}
                                      className="rounded-xl border border-fuchsia-300/20 bg-slate-900 px-3 py-2 text-xs text-white outline-none transition focus:border-fuchsia-400 disabled:opacity-50"
                                    >
                                      {planningWeek.map((entry) => (
                                        <option key={entry.key} value={entry.key}>
                                          {entry.label} {entry.day}.
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  {familyPlannerForm.repeat_same_tasks_all_week ? (
                                    <div className="mt-2 pl-7 text-xs text-fuchsia-200/70">
                                      Ulozi se pro kazdy den v nasledujicich 7 dnech.
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section id="task-create" className="scroll-mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-white">{editingTaskId ? "Upravit ukol" : "Novy ukol"}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {editingTaskId
                    ? "Kliknuty ukol muzes upravit a znovu ulozit."
                    : "Prirad konkretni ukol vybranemu diteti."}
                </p>
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
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Den v kalendari</span>
                  <input
                    type="date"
                    name="due_date"
                    value={taskForm.due_date}
                    onChange={handleTaskChange}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  />
                  <span className="mt-2 block text-xs text-slate-400">
                    Vyber den, kdy se ma jednorazovy ukol zobrazit diteti.
                  </span>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Cas pripominky</span>
                  <input
                    type="time"
                    name="due_time"
                    value={taskForm.due_time}
                    onChange={handleTaskChange}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  />
                  <span className="mt-2 block text-xs text-slate-400">
                    Pokud je vyplneny, dite dostane pripominku v nastaveny cas.
                  </span>
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
                  <input
                    type="checkbox"
                    name="requires_proof"
                    checked={taskForm.requires_proof}
                    onChange={handleTaskChange}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-fuchsia-400"
                  />
                  <span className="text-sm text-slate-200">Vyžadovat důkaz splnění (AI kontrola)</span>
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
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="submit"
                    disabled={submittingTask || players.length === 0}
                    className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {submittingTask ? "Ukladam..." : editingTaskId ? "Ulozit zmeny" : "Vytvorit ukol"}
                  </button>
                  {editingTaskId ? (
                    <button
                      type="button"
                      onClick={handleCancelTaskEdit}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 font-semibold text-slate-200 transition hover:border-cyan-400 hover:text-white"
                    >
                      Zrusit upravu
                    </button>
                  ) : null}
                </div>
              </form>
            </section>

            <section id="reward-create" className="scroll-mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
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
            <section id="task-list" className="scroll-mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
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
              <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Tydenni kalendar ukolu
                </div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  <button
                    type="button"
                    onClick={() => setTaskDateFilter("all")}
                    className={`rounded-xl px-2 py-2 text-xs font-bold transition ${
                      taskDateFilter === "all"
                        ? "bg-cyan-400 text-slate-950"
                        : "border border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-400"
                    }`}
                  >
                    Vse
                  </button>
                  {weekCalendar.map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => setTaskDateFilter(entry.key)}
                      className={`rounded-xl px-2 py-2 text-xs font-bold transition ${
                        taskDateFilter === entry.key
                          ? "bg-cyan-400 text-slate-950"
                          : "border border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-400"
                      }`}
                    >
                      <div>{entry.label}</div>
                      <div className="text-[11px] opacity-80">{entry.day}</div>
                    </button>
                  ))}
                </div>
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
                    const needsApproval = Boolean(task.is_completed && !task.approved);
                    const needsProofReview = Boolean(task.requires_proof && task.ai_flagged && !task.approved);
                    return (
                      <article
                        key={task.id}
                        className="rounded-3xl border border-slate-800 bg-slate-950 p-4 transition hover:border-cyan-500/50"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <button
                            type="button"
                            onClick={() => handleStartTaskEdit(task)}
                            className="flex-1 text-left"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-bold text-white">{task.title}</h3>
                              {task.is_daily ? (
                                <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-200">
                                  Denne
                                </span>
                              ) : null}
                              {task.is_completed ? (
                                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-200">
                                  Ditetem splneno
                                </span>
                              ) : null}
                              {task.approved ? (
                                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-xs font-semibold text-cyan-200">
                                  Rodicem schvaleno
                                </span>
                              ) : null}
                              {needsApproval ? (
                                <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-xs font-semibold text-rose-200">
                                  Ceka na schvaleni
                                </span>
                              ) : null}
                              {task.requires_proof ? (
                                <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-2 py-1 text-xs font-semibold text-fuchsia-200">
                                  Dukaz povinny
                                </span>
                              ) : null}
                              {task.proof_submitted_at ? (
                                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-xs font-semibold text-cyan-200">
                                  Dukaz odeslan
                                </span>
                              ) : null}
                              {needsProofReview ? (
                                <span className="rounded-full border border-orange-400/30 bg-orange-400/10 px-2 py-1 text-xs font-semibold text-orange-200">
                                  AI flag: kontrola rodicem
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
                              {task.due_time ? (
                                <span className="rounded-full bg-sky-400/10 px-3 py-1 text-sky-200">
                                  Cas {task.due_time}
                                </span>
                              ) : null}
                              {task.due_date ? (
                                <span className="rounded-full bg-indigo-400/10 px-3 py-1 text-indigo-200">
                                  Den {task.due_date}
                                </span>
                              ) : null}
                              {task.ai_review_score != null ? (
                                <span className="rounded-full bg-fuchsia-400/10 px-3 py-1 text-fuchsia-200">
                                  AI score {task.ai_review_score}
                                </span>
                              ) : null}
                            </div>
                            {task.ai_review_note ? (
                              <p className="mt-2 text-xs text-fuchsia-200/80">{task.ai_review_note}</p>
                            ) : null}
                            <div className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                              Klikni pro upravu ukolu
                            </div>
                          </button>
                          <div className="flex flex-wrap gap-2">
                            {needsApproval ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleApprove(task.id);
                                }}
                                disabled={busyTaskId === task.id}
                                className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {busyTaskId === task.id ? "Schvaluji..." : "Schvalit"}
                              </button>
                            ) : null}
                            {needsProofReview ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleReviewProof(task.id, true);
                                  }}
                                  disabled={busyTaskId === task.id}
                                  className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {busyTaskId === task.id ? "Ukladam..." : "Schvalit dukaz"}
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleReviewProof(task.id, false);
                                  }}
                                  disabled={busyTaskId === task.id}
                                  className="rounded-2xl border border-orange-500/40 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-100 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {busyTaskId === task.id ? "Ukladam..." : "Vratit dukaz"}
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteTask(task.id);
                              }}
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

            <section id="reward-list" className="scroll-mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
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
              <h2 className="mb-4 text-lg font-black text-amber-200">🏆 Rodinne vyzvy a sezonni eventy</h2>

              <form onSubmit={handleCreateChallenge} className="mb-4 grid gap-2 sm:grid-cols-2">
                <input
                  name="title"
                  required
                  value={challengeForm.title}
                  onChange={handleChallengeChange}
                  placeholder="Nazev vyzvy"
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
                <input
                  name="description"
                  value={challengeForm.description}
                  onChange={handleChallengeChange}
                  placeholder="Popis"
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
                <input
                  name="target"
                  type="number"
                  min="1"
                  value={challengeForm.target}
                  onChange={handleChallengeChange}
                  placeholder="Cil"
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
                <input
                  name="days"
                  type="number"
                  min="1"
                  value={challengeForm.days}
                  onChange={handleChallengeChange}
                  placeholder="Dni"
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
                <input
                  name="bonus_xp"
                  type="number"
                  min="0"
                  value={challengeForm.bonus_xp}
                  onChange={handleChallengeChange}
                  placeholder="Bonus XP"
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
                <input
                  name="bonus_gold"
                  type="number"
                  min="0"
                  value={challengeForm.bonus_gold}
                  onChange={handleChallengeChange}
                  placeholder="Bonus gold"
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
                <button
                  type="submit"
                  disabled={creatingChallenge}
                  className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-bold text-amber-100 transition hover:bg-amber-400/20 disabled:opacity-60 sm:col-span-2"
                >
                  {creatingChallenge ? "Vytvarim vyzvu..." : "Vytvorit tymovou vyzvu"}
                </button>
              </form>

              <div className="mb-4 grid gap-2 sm:grid-cols-4">
                {[
                  { id: "jaro", label: "Jarni event" },
                  { id: "leto", label: "Letni event" },
                  { id: "podzim", label: "Podzimni event" },
                  { id: "zima", label: "Zimni event" },
                ].map((season) => (
                  <button
                    key={season.id}
                    type="button"
                    onClick={() => handleCreateSeasonalChallenge(season.id)}
                    disabled={creatingSeasonalChallenge}
                    className="rounded-2xl border border-fuchsia-400/40 bg-fuchsia-400/10 px-3 py-2 text-xs font-bold text-fuchsia-100 transition hover:bg-fuchsia-400/20 disabled:opacity-60"
                  >
                    {season.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {challenges.length === 0 ? (
                  <p className="text-sm text-slate-400">Zatim nejsou zadne aktivni ani nedavne vyzvy.</p>
                ) : (
                  challenges.map((challenge) => (
                    <article key={challenge.id} className="rounded-2xl border border-amber-400/20 bg-slate-950/50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-amber-100">{challenge.title}</div>
                          <div className="text-xs text-amber-200/80">
                            {challenge.current_progress}/{challenge.target} • bonus {challenge.bonus_xp} XP + {challenge.bonus_gold} gold
                          </div>
                          <div className="mt-1 h-2 w-full rounded-full bg-slate-800">
                            <div
                              className="h-2 rounded-full bg-amber-300"
                              style={{ width: `${Math.min(100, Math.round(((challenge.current_progress || 0) / Math.max(1, challenge.target)) * 100))}%` }}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteChallenge(challenge.id)}
                          disabled={deletingChallengeId === challenge.id}
                          className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-60"
                        >
                          {deletingChallengeId === challenge.id ? "Mazani..." : "Smazat"}
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Admin;
