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

function LoginScreen({
  onLogin,
  onDeleteProfile = () => {},
  onRenameProfile = () => {},
  onTogglePinnedProfile = () => {},
  onUseTelegram,
  hasTelegramAccount,
  detail = "",
  savedProfiles = [],
}) {
  const [loginId, setLoginId] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    if (!loginId.trim()) {
      setError("Zadej Telegram nebo demo ID profilu, pod kterym se chces prihlasit.");
      return;
    }
    setError("");
    onLogin(loginId.trim());
  }

  function formatLastUsed(timestamp) {
    if (!timestamp) {
      return "Naposledy pouzity: zatim ne";
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "Naposledy pouzity: neznamy cas";
    }

    return `Naposledy pouzity: ${date.toLocaleString("cs-CZ")}`;
  }

  function handleDeleteProfile(profile) {
    const profileName = profile.label || profile.username || profile.id;
    if (!window.confirm(`Opravdu smazat ulozeny profil ${profileName}?`)) {
      return;
    }
    onDeleteProfile(profile.id);
  }

  function handleRenameProfile(profile) {
    const profileName = profile.label || profile.username || profile.id;
    const nextLabel = window.prompt("Zadej novy nazev profilu", profileName);
    if (nextLabel === null) {
      return;
    }
    onRenameProfile(profile.id, nextLabel);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#bae6fd,transparent_30%),linear-gradient(180deg,#f8fafc_0%,#fef3c7_55%,#fde68a_100%)] px-4 py-6">
      <div className="mx-auto max-w-2xl rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-2xl backdrop-blur">
        <div className="text-sm font-bold uppercase tracking-[0.35em] text-cyan-700">Family Quest</div>
        <h1 className="mt-3 text-4xl font-black text-slate-950">Prihlaseni</h1>
        <p className="mt-3 text-sm text-slate-700">
          Vyber profil, do ktereho se chces vratit. Rodina zustava ulozena u profilu, takze se po navratu muzes prihlasit znovu.
        </p>

        {detail ? (
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
            {detail}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
            {error}
          </div>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Telegram nebo demo ID</span>
            <input
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 shadow-sm outline-none transition focus:border-cyan-400"
              placeholder="Napriklad player-1 nebo 123456789"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-2xl bg-slate-950 px-4 py-3 font-bold text-white transition hover:bg-slate-800"
          >
            Prihlasit profil
          </button>
        </form>

        {savedProfiles.length ? (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
              Ulozene profily
            </div>
            <div className="mt-3 space-y-2">
              {savedProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 transition hover:border-cyan-300 hover:bg-cyan-50"
                >
                  <button
                    type="button"
                    onClick={() => onLogin(profile.id)}
                    className="flex min-w-0 flex-1 flex-col text-left"
                  >
                    <span className="truncate text-sm font-bold text-slate-950">
                      {profile.pinned ? "[PIN] " : ""}
                      {profile.label || profile.username || profile.id}
                    </span>
                    <span className="text-xs text-slate-500">
                      {profile.familyName || (profile.familyId ? `Rodina #${profile.familyId}` : "Zalozena identita")}
                      {profile.role ? ` · ${profile.role === "parent" ? "rodic" : "dite"}` : ""}
                    </span>
                    <span className="mt-1 text-[11px] text-slate-400">
                      {formatLastUsed(profile.lastUsedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onTogglePinnedProfile(profile.id)}
                    className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100"
                    aria-label={`${profile.pinned ? "Odepnout" : "Pripnout"} profil ${profile.label || profile.username || profile.id}`}
                  >
                    {profile.pinned ? "Odepnout" : "Pripnout"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRenameProfile(profile)}
                    className="shrink-0 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-800 transition hover:bg-cyan-100"
                    aria-label={`Prejmenovat profil ${profile.label || profile.username || profile.id}`}
                  >
                    Prejmenovat
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProfile(profile)}
                    className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
                    aria-label={`Smazat profil ${profile.label || profile.username || profile.id}`}
                  >
                    Smazat
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {hasTelegramAccount ? (
          <button
            type="button"
            onClick={onUseTelegram}
            className="mt-4 w-full rounded-2xl border border-cyan-300 bg-cyan-50 px-4 py-3 font-bold text-cyan-950 transition hover:bg-cyan-100"
          >
            Pokracovat jako aktualni Telegram ucet
          </button>
        ) : null}
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
    logout,
    loginWithDemoId,
    removeSavedProfile,
    renameSavedProfile,
    togglePinnedProfile,
    savedProfiles,
    useTelegramAccount,
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
  const [challenges, setChallenges] = useState([]);
  const [weeklyStats, setWeeklyStats] = useState(null);
  const [dailyActivity, setDailyActivity] = useState(null);
  const [engagementSummary, setEngagementSummary] = useState(null);
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
      setDailyActivity(null);
      setEngagementSummary(null);
      return;
    }

    const basePromises = [
      api("/game/leaderboard"),
      api("/game/family-stats"),
      api("/game/achievements"),
      api("/game/season-progress"),
    ];
    const [leaderboardData, familyStatsData, achievementsData, seasonData] = await Promise.all(basePromises);

    let weeklyData = null;
    let dailyData = null;
    let engagementData = null;

    if (user?.role === ROLE_PARENT) {
      [weeklyData, dailyData] = await Promise.all([
        api("/game/family-weekly-stats"),
        api("/game/daily-activity"),
      ]);

      try {
        engagementData = await api("/game/engagement-summary");
      } catch {
        engagementData = null;
      }
    }

    setLeaderboard(leaderboardData);
    setFamilyStats(familyStatsData);
    setAchievements(achievementsData);
    setSeasonProgress(seasonData);
    if (weeklyData) setWeeklyStats(weeklyData);
    if (dailyData) setDailyActivity(dailyData);
    setEngagementSummary(engagementData);
  }

  async function loadAppData() {
    if (!user?.family_id) {
      setTasks([]);
      setRewards([]);
      setPurchases([]);
      setLeaderboard([]);
      setFamilyStats(null);
      setAchievements([]);
      setChallenges([]);
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
      let challengeList = [];
      try {
        challengeList = await api("/challenges/");
      } catch {
        challengeList = [];
      }
      setTasks(taskList);
      setRewards(rewardList);
      setPurchases(purchaseHistory);
      setChallenges(challengeList);
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
      setChallenges([]);
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
    await loadAppData();
    await loadInsights();
    setDataError("");
    return response;
  }

  if (!hasAuthData) {
    return (
      <LoginScreen
        detail={telegramError || APP_MESSAGES.authDetail}
        onLogin={loginWithDemoId}
        onDeleteProfile={removeSavedProfile}
        onRenameProfile={renameSavedProfile}
        onTogglePinnedProfile={togglePinnedProfile}
        onUseTelegram={useTelegramAccount}
        hasTelegramAccount={Boolean(tg?.initData || tg?.initDataUnsafe?.user?.id)}
        savedProfiles={savedProfiles}
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

  if (userError) {
    return (
      <FullScreenMessage
        title={APP_MESSAGES.authTitle}
        detail={userError}
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
    return (
      <Onboarding
        user={user}
        api={api}
        onJoined={handleJoinedFamily}
        onSwitchAccount={logout}
      />
    );
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

      {user.role !== ROLE_PARENT ? (
        <div className="fixed left-4 top-4 z-40">
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-extrabold text-rose-800 shadow-lg backdrop-blur transition hover:bg-rose-100"
          >
            Odhlasit
          </button>
        </div>
      ) : null}

      {user.role === ROLE_PARENT ? (
        <>
          <div className="fixed left-3 right-3 top-4 z-40 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() =>
                setView((current) =>
                  current === APP_VIEW_ADMIN ? APP_VIEW_DASHBOARD : APP_VIEW_ADMIN
                )
              }
              className="max-w-full rounded-full border border-slate-900/10 bg-white/85 px-3 py-2 text-xs font-bold text-slate-900 shadow-lg backdrop-blur transition hover:bg-white sm:px-4 sm:text-sm"
            >
              {view === APP_VIEW_ADMIN ? "Prepnout na dashboard" : "Prepnout na administraci"}
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-slate-900/10 bg-white/90 px-3 py-2 text-xs font-bold text-slate-800 shadow-lg backdrop-blur transition hover:bg-slate-50 sm:px-4 sm:text-sm"
            >
              Prepnout profil
            </button>
          </div>
          {view === APP_VIEW_ADMIN ? (
            <Admin
              user={user}
              tasks={tasks}
              rewards={rewards}
              weeklyStats={weeklyStats}
              dailyActivity={dailyActivity}
              engagementSummary={engagementSummary}
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
              challenges={challenges}
              onCompleteTask={handleCompleteTask}
              onBuyReward={handleBuyReward}
            />
          )}
        </>
      ) : (
        <>
          <Dashboard
            user={user}
            tasks={tasks}
            rewards={rewards}
            purchases={purchases}
            leaderboard={leaderboard}
            familyStats={familyStats}
            achievements={achievements}
            seasonProgress={seasonProgress}
            challenges={challenges}
            onCompleteTask={handleCompleteTask}
            onBuyReward={handleBuyReward}
          />
        </>
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
