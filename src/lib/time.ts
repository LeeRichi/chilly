/** Offset (ms) of a time zone from UTC at a given instant. */
function zoneOffset(instant: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second,
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * Converts a wall-clock time like "2026-12-12T14:30" in Europe/Helsinki to a real Date,
 * handling daylight saving. Returns null for malformed input.
 */
export function helsinkiLocalToDate(local: string, timeZone = "Europe/Helsinki"): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Two passes settle the offset across DST boundaries.
  let guess = naive - zoneOffset(naive, timeZone);
  guess = naive - zoneOffset(guess, timeZone);
  const date = new Date(guess);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const helsinkiClock = (date: Date) =>
  date.toLocaleTimeString("en-GB", {
    timeZone: "Europe/Helsinki",
    hour: "2-digit",
    minute: "2-digit",
  });

export const helsinkiDayTime = (date: Date) =>
  date.toLocaleString("en-GB", {
    timeZone: "Europe/Helsinki",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
