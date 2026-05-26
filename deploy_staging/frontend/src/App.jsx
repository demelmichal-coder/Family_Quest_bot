import React, { useEffect, useState } from "react";
// Telegram Web Apps API integration
function useTelegramTheme(tg) {
  useEffect(() => {
    if (!tg || !tg.themeParams) return;
    // Example: set background color from Telegram theme
    document.body.style.backgroundColor = tg.themeParams.bg_color || "#f8fafc";
    return () => {
      document.body.style.backgroundColor = "";
    };
  }, [tg]);
}
import Admin from "./views/Admin";
import Dashboard from "./views/Dashboard";
import { APP_MESSAGES } from "./constants/messages";
import { APP_VIEW_ADMIN, APP_VIEW_DASHBOARD } from "./constants/ui";
import Onboarding from "./views/Onboarding";
import { ROLE_PARENT, ROLE_PENDING } from "./constants/roles";
import { useUser } from "./context/UserContext";
import { getErrorMessage } from "./utils/errors";
import "./index.css";

function FullScreenMessage({ title, detail, tone = "neutral" }) {
  const toneStyles = {
    neutral: "border-slate-300/40 bg-white/80 text-slate-900",
    error: "border-rose-400/40 bg-rose-50/90 text-rose-900",
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#e0f2fe,transparent_30%),linear-gradient(180deg,#f8fafc_0%,#fef3c7_100%)] px-4 py-6">
      <div className={`mx-auto max-w-3xl rounded-[32px] border p-6 shadow-2xl ${toneStyles[tone]}`}>
        <div className="text-sm font-bold uppercase tracking-[0.35em]">Family Quest</div>
        <h1 className="mt-3 text-3xl font-black">{title}</h1>
        {detail ? <p className="mt-3 text-sm opacity-80">{detail}</p> : null}
      </div>
    </div>
  );
}

function App() {
  const {
    user,
    loading: userLoading,
    error: userError,
    api,
    refreshUser,
    hasAuthData,
    telegramReady,
    telegramId,
    telegramInitData,
    tg,
    error: telegramError,
  } = useUser();

  useTelegramTheme(tg);

  // Example: add a button to close the miniapp if running in Telegram
  const [showClose, setShowClose] = useState(false);
  useEffect(() => {
    if (tg && typeof tg.close === "function") {
      setShowClose(true);
    }
  }, [tg]);

  const [tasks, setTasks] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [familyStats, setFamilyStats] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [seasonProgress, setSeasonProgress] = useState(null);
  const [weeklyStats, setWeeklyStats] = useState(null);
  const [view, setView] = useState(APP_VIEW_DASHBOARD);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    if (user?.role === ROLE_PARENT) {
      setView(APP_VIEW_ADMIN);
      return;
    }
    setView(APP_VIEW_DASHBOARD);
  }, [user?.role]);

  async function loadInsights() {
    if (!user?.family_id) {
      setLeaderboard([]);
      setFamilyStats(null);
      setAchievements([]);
      setSeasonProgress(null);
      setWeeklyStats(null);
      return;
    }

    const promises = [
      api("/game/leaderboard"),
      api("/game/family-stats"),
      api("/game/achievements"),
      api("/game/season-progress"),
    ];
    if (user?.role === ROLE_PARENT) {
      promises.push(api("/game/family-weekly-stats"));
    }
    const [leaderboardData, familyStatsData, achievementsData, seasonData, weeklyData] = await Promise.all(promises);
    setLeaderboard(leaderboardData);
    setFamilyStats(familyStatsData);
    setAchievements(achievementsData);
    setSeasonProgress(seasonData);
    if (weeklyData) setWeeklyStats(weeklyData);
  }

  async function loadAppData() {
    if (!user?.family_id) {
      setTasks([]);
      setRewards([]);
      setPurchases([]);
      setLeaderboard([]);
      setFamilyStats(null);
      setAchievements([]);
      setSeasonProgress(null);
      setDataError("");
      return;
    }

    setDataLoading(true);
    setDataError("");

    try {
      const [taskList, rewardList, purchaseHistory] = await Promise.all([
        api("/tasks/"),
        api("/rewards/"),
        api("/game/purchase-history"),
      ]);
      setTasks(taskList);
      setRewards(rewardList);
      setPurchases(purchaseHistory);
      await loadInsights();
    } catch (loadError) {
      setDataError(getErrorMessage(loadError, APP_MESSAGES.loadError));
    } finally {
      setDataLoading(false);
    }
  }

  useEffect(() => {
    if (!user?.family_id) {
      setTasks([]);
      setRewards([]);
      setPurchases([]);
      return;
    }
    loadAppData();
  }, [user?.id, user?.family_id, user?.role]);

  // Auto-refresh pro Admin pohled: aktualizuj data kazde 30s
  useEffect(() => {
    if (user?.role !== ROLE_PARENT || !user?.family_id) return;
    const interval = setInterval(() => {
      loadAppData();
    }, 30000);
    return () => clearInterval(interval);
  }, [user?.role, user?.family_id]);

  async function handleJoinedFamily() {
    await refreshUser();
  }

  async function handleCompleteTask(taskId) {
    const response = await api(`/game/complete-task/${taskId}`, { method: "POST" });
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? response.task : task))
    );
    await loadInsights();
    setDataError("");
    if (response.user) {
      await refreshUser();
    }
    return response;
  }

  async function handleBuyReward(rewardId) {
    const response = await api(`/game/buy-reward/${rewardId}`, { method: "POST" });
    setPurchases((current) => [response.purchase, ...current]);
    await loadInsights();
    setDataError("");
    if (response.user) {
      await refreshUser();
    }
    return response;
  }

  async function handleApproveTask(taskId) {
    const response = await api(`/game/approve-task/${taskId}`, { method: "POST" });
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, approved: true } : task
      )
    );
    await loadInsights();
    setDataError("");
    return response;
  }

  if (telegramError) {
    return (
      <FullScreenMessage
        title={APP_MESSAGES.authTitle}
        detail={telegramError}
        tone="error"
      />
    );
  }

  if (userLoading || !telegramReady) {
    return (
      <FullScreenMessage
        title={APP_MESSAGES.loadingTitle}
        detail={APP_MESSAGES.loadingDetail}
      />
    );
  }

  if (!hasAuthData || userError) {
    return (
      <FullScreenMessage
        title={APP_MESSAGES.authTitle}
        detail={userError || APP_MESSAGES.authDetail}
        tone="error"
      />
    );
  }

  if (!user) {
    return (
      <FullScreenMessage
        title={APP_MESSAGES.missingUserTitle}
        detail={APP_MESSAGES.missingUserDetail}
        tone="error"
      />
    );
  }

  if (!user.family_id || user.role === ROLE_PENDING) {
    return <Onboarding user={user} api={api} onJoined={handleJoinedFamily} />;
  }

  return (
    <div className="min-h-screen">
      {showClose && (
        <button
          onClick={() => tg.close()}
          className="fixed left-4 bottom-4 z-50 rounded-full border border-slate-900/10 bg-white/85 px-4 py-2 text-xs font-bold text-slate-700 shadow-lg backdrop-blur hover:bg-slate-100"
        >
          Zavřít miniaplikaci
        </button>
      )}
      {dataError ? (
        <div className="fixed left-4 right-4 top-4 z-50 mx-auto max-w-3xl rounded-2xl border border-rose-400/40 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 shadow-lg">
          {dataError}
        </div>
      ) : null}

      {user.role === ROLE_PARENT ? (
        <>
          <div className="fixed right-4 top-4 z-40">
            <button
              type="button"
              onClick={() =>
                setView((current) =>
                  current === APP_VIEW_ADMIN ? APP_VIEW_DASHBOARD : APP_VIEW_ADMIN
                )
              }
              className="rounded-full border border-slate-900/10 bg-white/85 px-4 py-2 text-sm font-bold text-slate-900 shadow-lg backdrop-blur transition hover:bg-white"
            >
              {view === APP_VIEW_ADMIN ? "Prepnout na dashboard" : "Prepnout na administraci"}
            </button>
          </div>
          {view === APP_VIEW_ADMIN ? (
            <Admin
              user={user}
              tasks={tasks}
              rewards={rewards}
              weeklyStats={weeklyStats}
              onApproveTask={handleApproveTask}
              onDataChanged={loadAppData}
            />
          ) : (
            <Dashboard
              user={user}
              tasks={tasks}
              rewards={rewards}
              purchases={purchases}
              leaderboard={leaderboard}
              familyStats={familyStats}
              achievements={achievements}
              seasonProgress={seasonProgress}
              onCompleteTask={handleCompleteTask}
              onBuyReward={handleBuyReward}
            />
          )}
        </>
      ) : (
        <Dashboard
          user={user}
          tasks={tasks}
          rewards={rewards}
          purchases={purchases}
          leaderboard={leaderboard}
          familyStats={familyStats}
          achievements={achievements}
          seasonProgress={seasonProgress}
          onCompleteTask={handleCompleteTask}
          onBuyReward={handleBuyReward}
        />
      )}

      {dataLoading ? (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-slate-900/10 bg-white/85 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-700 shadow-lg backdrop-blur">
          {APP_MESSAGES.syncingData}
        </div>
      ) : null}
    </div>
  );
}

export default App;
