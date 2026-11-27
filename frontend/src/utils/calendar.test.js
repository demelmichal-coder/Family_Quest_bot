import { buildIcs, buildWeekDays, dateKey, recurrenceWeekdays, startOfWeek } from "./calendar";

// 2026-11-25 je středa, týden začíná v pondělí 2026-11-23.
const WEDNESDAY = new Date(2026, 10, 25);

test("startOfWeek vrací pondělí a funguje i pro neděli", () => {
  expect(dateKey(startOfWeek(WEDNESDAY))).toBe("2026-11-23");
  expect(dateKey(startOfWeek(new Date(2026, 10, 29)))).toBe("2026-11-23"); // neděle
  expect(dateKey(startOfWeek(new Date(2026, 10, 23)))).toBe("2026-11-23"); // pondělí
});

test("recurrenceWeekdays odpovídá pravidlům plánovače", () => {
  expect(recurrenceWeekdays({ recurrence: "daily" })).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(recurrenceWeekdays({ recurrence: "weekly" })).toEqual([0]);
  expect(recurrenceWeekdays({ recurrence: "custom", recurrence_days: "1, 3,x,9" })).toEqual([1, 3]);
  expect(recurrenceWeekdays({ recurrence: null })).toEqual([]);
});

test("buildWeekDays zařadí úkoly s termínem i opakované úkoly", () => {
  const tasks = [
    { id: 1, title: "Úklid", due_date: "2026-11-25", due_time: "16:00", is_completed: false },
    { id: 2, title: "Hotovo", due_date: "2026-11-25", is_completed: true },
    { id: 3, title: "Cvičení", recurrence: "custom", recurrence_days: "0,2", parent_task_id: null },
    { id: 4, title: "Mimo týden", due_date: "2026-12-10" },
  ];
  const days = buildWeekDays(startOfWeek(WEDNESDAY), tasks);

  expect(days).toHaveLength(7);
  expect(days[0].label).toBe("Pondělí");
  expect(days[0].items.map((item) => item.title)).toEqual(["Cvičení"]);

  const wednesday = days[2];
  expect(wednesday.key).toBe("2026-11-25");
  // Úkol s časem je řazen dřív než ty bez času; opakovaný se označí
  expect(wednesday.items.map((item) => item.title)).toEqual(["Úklid", "Hotovo", "Cvičení"]);
  expect(wednesday.items.find((item) => item.title === "Hotovo").completed).toBe(true);
  expect(wednesday.items.find((item) => item.title === "Cvičení").recurring).toBe(true);

  const allTitles = days.flatMap((day) => day.items.map((item) => item.title));
  expect(allTitles).not.toContain("Mimo týden");
});

test("opakovaný úkol se v den, kdy už má vytvořenou instanci, neduplikuje", () => {
  const tasks = [
    { id: 10, title: "Cvičení", recurrence: "daily", parent_task_id: null },
    { id: 11, title: "Cvičení", due_date: "2026-11-25", parent_task_id: 10, is_completed: false },
  ];
  const wednesday = buildWeekDays(startOfWeek(WEDNESDAY), tasks)[2];
  expect(wednesday.items).toHaveLength(1);
  expect(wednesday.items[0].recurring).toBe(false);
});

test("buildIcs vytvoří události, opakování a ošetří speciální znaky", () => {
  const ics = buildIcs(
    [
      { id: 1, title: "Nákup, mléko; chleba", description: "Řádek 1\nŘádek 2", due_date: "2026-11-25" },
      { id: 2, title: "Hotovo", due_date: "2026-11-26", is_completed: true },
      { id: 3, title: "Cvičení", recurrence: "custom", recurrence_days: "0,2" },
      { id: 4, title: "Denně", recurrence: "daily" },
      { id: 5, title: "Bez termínu" },
    ],
    new Date(Date.UTC(2026, 10, 25, 10, 0, 0))
  );

  expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  expect(ics).toContain("DTSTAMP:20261125T100000Z");
  expect(ics).toContain("DTSTART;VALUE=DATE:20261125");
  expect(ics).toContain("SUMMARY:Nákup\\, mléko\\; chleba");
  expect(ics).toContain("DESCRIPTION:Řádek 1\\nŘádek 2");
  expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE");
  expect(ics).toContain("RRULE:FREQ=DAILY");
  expect(ics).not.toContain("Hotovo");
  expect(ics).not.toContain("Bez termínu");
  expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(3);
});
