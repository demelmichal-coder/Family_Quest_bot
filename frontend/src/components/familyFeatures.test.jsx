import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WishesPanel from "./WishesPanel";
import WishInbox from "./WishInbox";
import OffersBoard from "./OffersBoard";
import OffersManager from "./OffersManager";
import FamilyGoalCard from "./FamilyGoalCard";
import QuietHoursSettings from "./QuietHoursSettings";
import TaskTemplates from "./TaskTemplates";
import WeeklyOverview, { badgesFor, buildDayLabels } from "./WeeklyOverview";
import WeekCalendar from "./WeekCalendar";
import DataPrivacyPanel from "./DataPrivacyPanel";
import { dateKey } from "../utils/calendar";

const apiMock = vi.fn();
const logoutMock = vi.fn();
const downloadMock = vi.fn();

vi.mock("../context/UserContext", () => ({
  useUser: () => ({ api: apiMock, logout: logoutMock }),
}));

vi.mock("../utils/calendar", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, downloadTextFile: (...args) => downloadMock(...args) };
});

beforeEach(() => {
  apiMock.mockReset();
  logoutMock.mockReset();
  downloadMock.mockReset();
});

function routeApi(routes) {
  apiMock.mockImplementation(async (endpoint, options) => {
    const key = `${options?.method || "GET"} ${endpoint}`;
    const handler = routes[key];
    if (handler === undefined) return null;
    if (handler instanceof Error) throw handler;
    return typeof handler === "function" ? handler(options) : handler;
  });
}

// ---------- Přání ----------

test("dítě pošle přání a vidí jeho stav", async () => {
  routeApi({
    "GET /wishes/": [
      { id: 1, title: "Kino", suggested_cost: 40, status: "pending", parent_note: null },
      { id: 2, title: "Zmrzlina", suggested_cost: 10, status: "approved", parent_note: "Dobrý nápad" },
    ],
    "POST /wishes/": { id: 3 },
  });
  const user = userEvent.setup();
  render(<WishesPanel />);

  expect(await screen.findByText("Čeká na rodiče")).toBeInTheDocument();
  expect(screen.getByText("Schváleno – je v obchodě")).toBeInTheDocument();
  expect(screen.getByText("Rodič: Dobrý nápad")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Co si přeješ"), "Bazén");
  await user.type(screen.getByLabelText("Navržená cena ve zlatě"), "60");
  await user.click(screen.getByRole("button", { name: "Poslat přání" }));

  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith("/wishes/", {
      method: "POST",
      body: { title: "Bazén", suggested_cost: 60 },
    })
  );
});

test("dítě může zrušit čekající přání", async () => {
  routeApi({
    "GET /wishes/": [{ id: 1, title: "Kino", suggested_cost: 40, status: "pending" }],
    "DELETE /wishes/1": { detail: "ok" },
  });
  const user = userEvent.setup();
  render(<WishesPanel />);

  await user.click(await screen.findByRole("button", { name: "Zrušit přání Kino" }));
  await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/wishes/1", { method: "DELETE" }));
});

test("rodič schválí přání s upravenou cenou a zamítne jiné", async () => {
  const onChanged = vi.fn();
  routeApi({
    "GET /wishes/": [
      { id: 1, title: "Kino", suggested_cost: 40, status: "pending", username: "Kuba" },
      { id: 2, title: "Tablet", suggested_cost: 900, status: "pending", username: "Anička" },
      { id: 3, title: "Staré", suggested_cost: 5, status: "approved", username: "Kuba" },
    ],
    "POST /wishes/1/approve": { id: 1 },
    "POST /wishes/2/reject": { id: 2 },
  });
  const user = userEvent.setup();
  render(<WishInbox onChanged={onChanged} />);

  expect(await screen.findByText("Kino")).toBeInTheDocument();
  expect(screen.queryByText("Staré")).not.toBeInTheDocument(); // vyřízená přání se nezobrazují

  const costInput = screen.getByLabelText("Cena pro přání Kino");
  await user.clear(costInput);
  await user.type(costInput, "55");
  await user.click(screen.getByRole("button", { name: "Schválit přání Kino" }));
  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith("/wishes/1/approve", { method: "POST", body: { cost: 55 } })
  );
  expect(onChanged).toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Zamítnout přání Tablet" }));
  await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/wishes/2/reject", { method: "POST", body: {} }));
});

test("rodič bez čekajících přání vidí prázdný stav", async () => {
  routeApi({ "GET /wishes/": [] });
  render(<WishInbox />);
  expect(await screen.findByText("Žádná čekající přání.")).toBeInTheDocument();
});

// ---------- Volné úkoly ----------

test("dítě si vezme volný úkol a tabule se obnoví", async () => {
  const onClaimed = vi.fn();
  routeApi({
    "GET /offers/": [{ id: 7, title: "Umýt auto", xp: 30, gold: 5 }],
    "POST /offers/7/claim": { id: 7 },
  });
  const user = userEvent.setup();
  render(<OffersBoard onClaimed={onClaimed} />);

  expect(await screen.findByText("Umýt auto")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Vzít si úkol Umýt auto" }));
  await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/offers/7/claim", { method: "POST" }));
  expect(onClaimed).toHaveBeenCalled();
});

test("když si úkol vzal sourozenec, dítě uvidí chybu", async () => {
  routeApi({
    "GET /offers/": [{ id: 7, title: "Umýt auto", xp: 30, gold: 0 }],
    "POST /offers/7/claim": new Error("Tenhle úkol si už vzal někdo jiný."),
  });
  const user = userEvent.setup();
  render(<OffersBoard />);

  await user.click(await screen.findByRole("button", { name: "Vzít si úkol Umýt auto" }));
  expect(await screen.findByText("Tenhle úkol si už vzal někdo jiný.")).toBeInTheDocument();
});

test("bez volných úkolů se tabule vůbec nezobrazí", async () => {
  routeApi({ "GET /offers/": [] });
  const { container } = render(<OffersBoard />);
  await waitFor(() => expect(apiMock).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});

test("rodič vystaví a stáhne volný úkol", async () => {
  routeApi({
    "GET /offers/": [{ id: 9, title: "Sekání", xp: 20, gold: 0 }],
    "POST /offers/": { id: 10 },
    "DELETE /offers/9": { detail: "ok" },
  });
  const user = userEvent.setup();
  render(<OffersManager />);

  await user.type(screen.getByLabelText("Název volného úkolu"), "Umýt okna");
  await user.click(screen.getByRole("button", { name: "Vystavit" }));
  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith("/offers/", {
      method: "POST",
      body: { title: "Umýt okna", xp: 20, gold: 0 },
    })
  );

  await user.click(await screen.findByRole("button", { name: "Stáhnout volný úkol Sekání" }));
  await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/offers/9", { method: "DELETE" }));
});

// ---------- Rodinný cíl ----------

test("rodič založí rodinný cíl", async () => {
  routeApi({ "GET /goals/active": null, "POST /goals/": { id: 1 } });
  const user = userEvent.setup();
  render(<FamilyGoalCard isParent />);

  await user.type(await screen.findByLabelText("Název rodinného cíle"), "Pizza večer");
  await user.click(screen.getByRole("button", { name: "Založit cíl" }));
  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith("/goals/", { method: "POST", body: { title: "Pizza večer", target_xp: 200 } })
  );
});

test("dítě vidí postup k cíli a nemá žádná tlačítka pro správu", async () => {
  routeApi({
    "GET /goals/active": { id: 1, title: "Pizza večer", target_xp: 200, progress_xp: 80, percent: 40, reached: false },
  });
  render(<FamilyGoalCard />);

  expect(await screen.findByText("Pizza večer")).toBeInTheDocument();
  expect(screen.getByText("80 / 200 XP (40 %)")).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "Postup k cíli Pizza večer" })).toHaveAttribute("aria-valuenow", "80");
  expect(screen.queryByRole("button", { name: "Zrušit cíl" })).not.toBeInTheDocument();
});

test("dítě bez aktivního cíle nevidí nic", async () => {
  routeApi({ "GET /goals/active": null });
  const { container } = render(<FamilyGoalCard />);
  await waitFor(() => expect(apiMock).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});

test("rodič potvrdí splněný cíl, nesplněný jde jen zrušit", async () => {
  routeApi({
    "GET /goals/active": { id: 4, title: "Výlet", target_xp: 100, progress_xp: 100, percent: 100, reached: true },
    "POST /goals/4/complete": { id: 4 },
  });
  const user = userEvent.setup();
  render(<FamilyGoalCard isParent />);

  const complete = await screen.findByRole("button", { name: "Splněno – oslavit" });
  expect(complete).toBeEnabled();
  await user.click(complete);
  await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/goals/4/complete", { method: "POST" }));
});

test("nesplněný cíl nejde potvrdit", async () => {
  routeApi({
    "GET /goals/active": { id: 4, title: "Výlet", target_xp: 100, progress_xp: 10, percent: 10, reached: false },
  });
  render(<FamilyGoalCard isParent />);
  expect(await screen.findByRole("button", { name: "Splněno – oslavit" })).toBeDisabled();
});

// ---------- Tichý režim ----------

test("tichý režim se načte, uloží a jde vypnout", async () => {
  routeApi({
    "GET /push/quiet-hours": { start: "21:00", end: "07:00" },
    "PUT /push/quiet-hours": { start: "21:00", end: "07:00" },
  });
  const user = userEvent.setup();
  render(<QuietHoursSettings />);

  const toggle = await screen.findByRole("checkbox", { name: "Zapnout tichý režim" });
  await waitFor(() => expect(toggle).toBeChecked());

  await user.click(screen.getByRole("button", { name: "Uložit" }));
  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith("/push/quiet-hours", { method: "PUT", body: { start: "21:00", end: "07:00" } })
  );

  await user.click(toggle);
  await user.click(screen.getByRole("button", { name: "Uložit" }));
  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith("/push/quiet-hours", { method: "PUT", body: { start: null, end: null } })
  );
  expect(await screen.findByText("Tichý režim je vypnutý.")).toBeInTheDocument();
});

// ---------- Šablony ----------

test("šablona podle věku předá úkol do formuláře", async () => {
  const onPick = vi.fn();
  const user = userEvent.setup();
  render(<TaskTemplates onPick={onPick} />);

  await user.click(screen.getByRole("tab", { name: "11+ let" }));
  await user.click(screen.getByRole("button", { name: /Vysát pokoj/ }));

  expect(onPick).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Vysát pokoj", xp: 18, gold: 2 })
  );

  await user.click(screen.getByRole("tab", { name: "Do 6 let" }));
  expect(screen.getByRole("button", { name: /Uklidit hračky/ })).toBeInTheDocument();
});

// ---------- Týdenní přehled ----------

test("odznaky a popisky dnů v týdenním přehledu", () => {
  expect(badgesFor([1, 1, 1, 1, 1, 1, 1])).toContain("🔥 7 dní v řadě");
  expect(badgesFor([1, 0, 1, 1, 1, 1, 0])).toEqual(["⭐ 5 aktivních dnů"]);
  expect(badgesFor([0, 0, 0, 0, 0, 0, 0])).toEqual([]);
  expect(badgesFor([5, 5, 0, 0, 0, 0, 0])).toEqual(["🏅 10 úkolů za týden"]);
  // Neděle 29. 11. 2026: poslední sloupec je dnes (Ne), první je před šesti dny (Po)
  const labels = buildDayLabels(new Date(2026, 10, 29));
  expect(labels[6]).toBe("Ne");
  expect(labels[0]).toBe("Po");
});

test("týdenní přehled ukáže žebříček dětí a aktivitu", async () => {
  routeApi({
    "GET /game/family-weekly-stats": {
      children: [{ user_id: 2, username: "Kuba", total_xp: 120, tasks_completed: 12, activity_days: [1, 1, 1, 1, 1, 1, 1] }],
    },
    "GET /game/leaderboard": [
      { id: 1, role: "parent", username: "Máma", xp: 0, completed_tasks: 0, is_me: false },
      { id: 2, role: "child", username: "Kuba", xp: 120, completed_tasks: 12, is_me: true },
    ],
  });
  render(<WeeklyOverview />);

  expect(await screen.findByRole("list", { name: "Žebříček dětí" })).toBeInTheDocument();
  expect(screen.getByText(/Kuba \(ty\)/)).toBeInTheDocument();
  expect(screen.queryByText("Máma")).not.toBeInTheDocument(); // žebříček je jen pro děti
  expect(screen.getByText("🔥 7 dní v řadě")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /Splněné úkoly za posledních 7 dní/ })).toBeInTheDocument();
});

// ---------- Kalendář ----------

test("kalendář ukáže dnešní úkol a exportuje .ics", async () => {
  const today = dateKey(new Date());
  const user = userEvent.setup();
  render(
    <WeekCalendar
      tasks={[
        { id: 1, title: "Dnešní úkol", due_date: today, is_completed: false },
        { id: 2, title: "Pravidelné cvičení", recurrence: "daily", parent_task_id: null },
      ]}
    />
  );

  expect(screen.getByText("Dnešní úkol")).toBeInTheDocument();
  expect(screen.getAllByText("Pravidelné cvičení").length).toBe(7); // denní úkol vychází každý den

  await user.click(screen.getByRole("button", { name: "Do kalendáře (.ics)" }));
  expect(downloadMock).toHaveBeenCalledTimes(1);
  const [filename, content, mime] = downloadMock.mock.calls[0];
  expect(filename).toBe("family-quest-ukoly.ics");
  expect(content).toContain("BEGIN:VCALENDAR");
  expect(content).toContain("SUMMARY:Dnešní úkol");
  expect(mime).toContain("text/calendar");
});

test("kalendář umí listovat týdny", async () => {
  const user = userEvent.setup();
  render(<WeekCalendar tasks={[]} />);
  expect(screen.getByText("Tenhle týden nejsou žádné úkoly s termínem.")).toBeInTheDocument();
  const before = screen.getByText(/–/).textContent;
  await user.click(screen.getByRole("button", { name: "Další týden" }));
  expect(screen.getByText(/–/).textContent).not.toBe(before);
});

// ---------- Export a smazání ----------

test("export dat stáhne soubor JSON", async () => {
  routeApi({ "GET /families/me/export": { family: { name: "Rodina" } } });
  const user = userEvent.setup();
  render(<DataPrivacyPanel />);

  await user.click(screen.getByRole("button", { name: "Stáhnout data (JSON)" }));
  await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1));
  expect(downloadMock.mock.calls[0][0]).toBe("family-quest-export.json");
  expect(downloadMock.mock.calls[0][1]).toContain("Rodina");
});

test("smazání rodiny vyžaduje přesné potvrzení a pak odhlásí", async () => {
  routeApi({ "POST /families/me/delete": { detail: "ok" } });
  const user = userEvent.setup();
  render(<DataPrivacyPanel />);

  const submit = screen.getByRole("button", { name: "Smazat rodinu" });
  expect(submit).toBeDisabled();

  await user.type(screen.getByLabelText("Potvrzení smazání rodiny"), "smazat");
  expect(submit).toBeDisabled(); // musí být přesně velkými písmeny

  await user.clear(screen.getByLabelText("Potvrzení smazání rodiny"));
  await user.type(screen.getByLabelText("Potvrzení smazání rodiny"), "SMAZAT RODINU");
  expect(submit).toBeEnabled();
  await user.click(submit);

  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith("/families/me/delete", { method: "POST", body: { confirm: "SMAZAT RODINU" } })
  );
  expect(logoutMock).toHaveBeenCalled();
});
