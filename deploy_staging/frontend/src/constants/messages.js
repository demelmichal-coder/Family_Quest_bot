export const APP_MESSAGES = {
  loadError: "Nepodarilo se nacist data aplikace.",
  loadingTitle: "Nacitam Family Quest",
  loadingDetail: "Cekam na overeni Telegram session a uzivatelska data.",
  authTitle: "Aplikaci se nepodarilo overit",
  authDetail: "Telegram neposlal potrebna auth data.",
  missingUserTitle: "Uzivatel neni dostupny",
  missingUserDetail: "Backend zatim nevratil aktivni profil.",
  syncingData: "Synchronizuji data",
};

export const USER_MESSAGES = {
  providerNotInitialized: "UserProvider neni inicializovany.",
  missingAuthData: "Telegram neposlal auth data miniaplikaci.",
  loadUserError: "Nepodarilo se nacist uzivatele.",
};

export const API_MESSAGES = {
  networkError: "Sitovy pozadavek selhal.",
  statusError: (status) => `API chyba ${status}`,
};

export const ADMIN_MESSAGES = {
  loadError: "Nepodarilo se nacist administraci.",
  createTaskSuccess: "Ukol byl vytvoren.",
  createTaskError: "Ukol se nepodarilo vytvorit.",
  createRewardSuccess: "Odmena byla vytvorena.",
  createRewardError: "Odmenu se nepodarilo vytvorit.",
  deleteTaskSuccess: "Ukol byl smazan.",
  deleteTaskError: "Ukol se nepodarilo smazat.",
  deleteRewardSuccess: "Odmena byla smazana.",
  deleteRewardError: "Odmenu se nepodarilo smazat.",
  deleteMemberSuccess: "Clen rodiny byl odebran.",
  deleteMemberError: "Clena rodiny se nepodarilo odebrat.",
  approveTaskSuccess: "Ukol byl schvalen.",
  approveTaskError: "Ukol se nepodarilo schvalit.",
  resetDailySuccess: "Denni ukoly byly resetovany.",
  resetDailyError: "Denni reset se nepodarilo provest.",
  rewriteTaskSuccess: "Navrh ukolu byl vygenerovan.",
  rewriteTaskMissingDescription: "Nejdriv vypln popis ukolu.",
  applyAiTitleSuccess: "AI navrh doplnil nazev ukolu.",
  applyAiXpSuccess: "AI navrh doplnil XP odmenu.",
  applyAiAllSuccess: "AI navrh doplnil nazev i XP.",
  rewriteRewardSuccess: "Navrh odmeny byl vygenerovan.",
  rewriteRewardMissingDescription: "Nejdriv vypln popis odmeny.",
  applyAiRewardNameSuccess: "AI navrh doplnil nazev odmeny.",
  applyAiRewardCostSuccess: "AI navrh doplnil cenu odmeny.",
  applyAiRewardAllSuccess: "AI navrh doplnil nazev i cenu odmeny.",
  aiStyleLabel: "Styl AI navrhu",
  aiRetry: "Zkusit znovu",
};

export const DASHBOARD_MESSAGES = {
  completeTaskError: "Ukol se nepodarilo dokoncit.",
  saveAvatarSuccess: "Avatar byl ulozen.",
  saveAvatarError: "Avatar se nepodarilo ulozit.",
};

export const SHOP_MESSAGES = {
  buyRewardError: "Nakup se nepodarilo dokoncit.",
  buyButton: "Koupit odmenu",
  buyingButton: "Nakupuji...",
  insufficientGold: "Nedostatek zlata",
};

export const ONBOARDING_MESSAGES = {
  createFamilyError: "Rodinu se nepodarilo vytvorit.",
  joinFamilyError: "Do rodiny se nepodarilo pripojit.",
};

export const AI_MESSAGES = {
  rewriteError: "Prepis ukolu se nepodarilo dokoncit.",
};

export const AI_REWRITE_STYLES = [
  { id: "epicke", label: "Epicke" },
  { id: "vtipne", label: "Vtipne" },
  { id: "kratke", label: "Kratke" },
];
