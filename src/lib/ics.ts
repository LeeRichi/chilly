/** Builds an iCalendar (.ics) file in the browser. No network calls. */

export type CalendarEvent = {
  /** Local "YYYY-MM-DDTHH:MM" in Europe/Helsinki. */
  datetime: string;
  title: string;
  description?: string;
  minutes?: number;
  alarmMinutesBefore?: number;
};

const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Lines must be folded at 75 octets; folding by characters keeps it simple and is accepted by calendar apps.
const fold = (line: string) => line.match(/.{1,73}/g)?.join("\r\n ") ?? line;

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const local = (datetime: string) => `${datetime.replace(/[-:]/g, "")}00`;

// Minimal Europe/Helsinki zone (EET/EEST, EU daylight-saving rules) so times aren't shifted
// when the user's device is in another time zone.
const HELSINKI = [
  "BEGIN:VTIMEZONE", "TZID:Europe/Helsinki",
  "BEGIN:STANDARD", "DTSTART:19701025T040000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "TZOFFSETFROM:+0300", "TZOFFSETTO:+0200", "TZNAME:EET", "END:STANDARD",
  "BEGIN:DAYLIGHT", "DTSTART:19700329T030000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0300", "TZNAME:EEST", "END:DAYLIGHT",
  "END:VTIMEZONE",
];

export function buildIcs(events: CalendarEvent[], calendarName: string) {
  const now = stamp(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Chilly//Personal Assistant//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escape(calendarName)}`, ...HELSINKI];
  events.forEach((e, i) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${now}-${i}@chilly.local`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=Europe/Helsinki:${local(e.datetime)}`,
      `DURATION:PT${e.minutes ?? 15}M`,
      `SUMMARY:${escape(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${escape(e.description)}`] : []),
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escape(e.title)}`, `TRIGGER:-PT${e.alarmMinutesBefore ?? 10}M`, "END:VALARM",
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}

export function downloadIcs(events: CalendarEvent[], name: string) {
  const blob = new Blob([buildIcs(events, name)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "chilly-plan"}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
