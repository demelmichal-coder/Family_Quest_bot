// calendar.js - týdenní kalendář úkolů a export do .ics (Google/Apple kalendář).

export const WEEKDAY_NAMES = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];
const ICS_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayBased = (result.getDay() + 6) % 7; // 0 = pondělí
  result.setDate(result.getDate() - mondayBased);
  return result;
}

/** Dny (0 = pondělí) ve kterých se opakovaný úkol zobrazuje. Stejná logika jako scheduler.py. */
export function recurrenceWeekdays(task) {
  if (!task?.recurrence) return [];
  if (task.recurrence === "daily") return [0, 1, 2, 3, 4, 5, 6];
  if (task.recurrence === "weekly") return [0];
  if (task.recurrence === "custom" && task.recurrence_days) {
    return task.recurrence_days
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  }
  return [];
}

function isRecurringTemplate(task) {
  return Boolean(task?.recurrence) && !task.parent_task_id;
}

/** Sedm dní od pondělí weekStart; v každém úkoly s termínem a opakované úkoly, které na den vychází. */
export function buildWeekDays(weekStart, tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index);
    const key = dateKey(date);

    const dated = list.filter((task) => !isRecurringTemplate(task) && task.due_date === key);
    const datedParentIds = new Set(dated.map((task) => task.parent_task_id).filter(Boolean));

    const recurring = list.filter(
      (task) =>
        isRecurringTemplate(task) &&
        recurrenceWeekdays(task).includes(index) &&
        !datedParentIds.has(task.id)
    );

    const items = [
      ...dated.map((task) => ({
        id: `t-${task.id}`,
        title: task.title,
        time: task.due_time || "",
        completed: Boolean(task.is_completed),
        recurring: false,
      })),
      ...recurring.map((task) => ({
        id: `r-${task.id}`,
        title: task.title,
        time: task.due_time || "",
        completed: false,
        recurring: true,
      })),
    ].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

    return { date, key, label: WEEKDAY_NAMES[index], items };
  });
}

function escapeIcs(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsDate(key) {
  return key.replace(/-/g, "");
}

function icsTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Vytvoří obsah souboru .ics: úkoly s termínem jako celodenní události, opakované jako RRULE. */
export function buildIcs(tasks, now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Family Quest//Ukoly//CS", "CALSCALE:GREGORIAN"];
  const stamp = icsTimestamp(now);
  const todayKey = dateKey(now);

  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (isRecurringTemplate(task)) {
      const days = recurrenceWeekdays(task);
      if (days.length === 0) continue;
      const rrule =
        days.length === 7 ? "FREQ=DAILY" : `FREQ=WEEKLY;BYDAY=${days.map((day) => ICS_DAYS[day]).join(",")}`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:fq-recurring-${task.id}@familyquest`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(todayKey)}`,
        `RRULE:${rrule}`,
        `SUMMARY:${escapeIcs(task.title)}`,
        "END:VEVENT"
      );
      continue;
    }
    if (!task?.due_date || task.is_completed) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:fq-task-${task.id}@familyquest`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(task.due_date)}`,
      `SUMMARY:${escapeIcs(task.title)}`,
      ...(task.description ? [`DESCRIPTION:${escapeIcs(task.description)}`] : []),
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** Stáhne text jako soubor v prohlížeči. */
export function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
