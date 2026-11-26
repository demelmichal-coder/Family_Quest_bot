export const APP_MESSAGES = {
  loadError: "Nepodařilo se načíst data aplikace.",
  loadingTitle: "Načítám Family Quest",
  loadingDetail: "Čekám na ověření Telegram session a uživatelská data.",
  authTitle: "Aplikaci se nepodařilo ověřit",
  authDetail: "Telegram neposlal potřebná auth data.",
  missingUserTitle: "Uživatel není dostupný",
  missingUserDetail: "Backend zatím nevrátil aktivní profil.",
  syncingData: "Synchronizuji data",
};

export const USER_MESSAGES = {
  providerNotInitialized: "UserProvider není inicializovaný.",
  missingAuthData: "Telegram neposlal auth data miniaplikaci.",
  loadUserError: "Nepodařilo se načíst uživatele.",
};

export const API_MESSAGES = {
  networkError: "Síťový požadavek selhal.",
  statusError: (status) => `API chyba ${status}`,
};

export const ADMIN_MESSAGES = {
  loadError: "Nepodařilo se načíst administraci.",
  createTaskSuccess: "Úkol byl vytvořen.",
  createTaskError: "Úkol se nepodařilo vytvořit.",
  updateTaskSuccess: "Úkol byl upraven.",
  updateTaskError: "Úkol se nepodařilo upravit.",
  createRewardSuccess: "Odměna byla vytvořena.",
  createRewardError: "Odměnu se nepodařilo vytvořit.",
  deleteTaskSuccess: "Úkol byl smazán.",
  deleteTaskError: "Úkol se nepodařilo smazat.",
  deleteRewardSuccess: "Odměna byla smazána.",
  deleteRewardError: "Odměnu se nepodařilo smazat.",
  deleteMemberSuccess: "Člen rodiny byl odebrán.",
  deleteMemberError: "Člena rodiny se nepodařilo odebrat.",
  approveTaskSuccess: "Úkol byl schválen.",
  approveTaskError: "Úkol se nepodařilo schválit.",
  resetDailySuccess: "Denní úkoly byly resetovány.",
  resetDailyError: "Denní reset se nepodařilo provést.",
  rewriteTaskSuccess: "Návrh úkolu byl vygenerován.",
  rewriteTaskMissingDescription: "Nejdřív vyplň popis úkolu.",
  rewriteTaskError: "AI návrh úkolu se nepodařilo vygenerovat. Zkus to prosím znovu.",
  applyAiTitleSuccess: "AI návrh doplnil název úkolu.",
  applyAiXpSuccess: "AI návrh doplnil XP odměnu.",
  applyAiAllSuccess: "AI návrh doplnil název i XP.",
  rewriteRewardSuccess: "Návrh odměny byl vygenerován.",
  rewriteRewardMissingDescription: "Nejdřív vyplň popis odměny.",
  rewriteRewardError: "AI návrh odměny se nepodařilo vygenerovat. Zkus to prosím znovu.",
  applyAiRewardNameSuccess: "AI návrh doplnil název odměny.",
  applyAiRewardCostSuccess: "AI návrh doplnil cenu odměny.",
  applyAiRewardAllSuccess: "AI návrh doplnil název i cenu odměny.",
  aiStyleLabel: "Styl AI návrhu",
  aiRetry: "Zkusit znovu",
};

export const DASHBOARD_MESSAGES = {
  completeTaskError: "Úkol se nepodařilo dokončit.",
  saveAvatarSuccess: "Avatar byl uložen.",
  saveAvatarError: "Avatar se nepodařilo uložit.",
};

export const SHOP_MESSAGES = {
  buyRewardError: "Nákup se nepodařilo dokončit.",
  buyButton: "Koupit odměnu",
  buyingButton: "Nakupuji...",
  insufficientGold: "Nedostatek zlata",
};

export const ONBOARDING_MESSAGES = {
  createFamilyError: "Rodinu se nepodařilo vytvořit.",
  joinFamilyError: "Do rodiny se nepodařilo připojit.",
};

export const AI_MESSAGES = {
  rewriteError: "Přepis úkolu se nepodařilo dokončit.",
};

export const AI_REWRITE_STYLES = [
  { id: "epicke", label: "Epické" },
  { id: "vtipne", label: "Vtipné" },
  { id: "kratke", label: "Krátké" },
];
