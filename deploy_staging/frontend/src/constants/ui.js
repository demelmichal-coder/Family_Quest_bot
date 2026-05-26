export const APP_VIEW_ADMIN = "admin";
export const APP_VIEW_DASHBOARD = "dashboard";

export const DASHBOARD_TAB_MISSIONS = "missions";
export const DASHBOARD_TAB_SHOP = "shop";
export const DASHBOARD_TAB_FAMILY = "family";

export const DASHBOARD_TABS = [
  {
    id: DASHBOARD_TAB_MISSIONS,
    label: "Mise",
    active: "bg-yellow-950 text-yellow-100",
    idle: "bg-yellow-100 text-yellow-950 hover:bg-yellow-200",
  },
  {
    id: DASHBOARD_TAB_SHOP,
    label: "Obchod",
    active: "bg-emerald-950 text-emerald-100",
    idle: "bg-emerald-100 text-emerald-950 hover:bg-emerald-200",
  },
  {
    id: DASHBOARD_TAB_FAMILY,
    label: "Rodina",
    active: "bg-cyan-950 text-cyan-100",
    idle: "bg-cyan-100 text-cyan-950 hover:bg-cyan-200",
  },
];
