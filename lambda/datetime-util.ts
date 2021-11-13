export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("default", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
    timeZone: process.env.TIMEZONE,
    timeZoneName: "short",
  }).format(date);
}

export function determineThresholdDatetime(eventDate: Date): Date {
  const thresholdHours = Number(process.env.NOTIFICATION_THRESHOLD_HRS);
  const thresholdDatetime = new Date(eventDate.getTime());
  thresholdDatetime.setHours(eventDate.getHours() + thresholdHours);
  return thresholdDatetime;
}

export function hasThresholdTimePassed(thresholdDatetime: Date): boolean {
  return Date.now() > thresholdDatetime.getTime();
}

export function getCurrentHour(now?: Date): number {
  return Number(
    new Intl.DateTimeFormat("default", {
      hour: "numeric",
      hour12: false,
      timeZone: process.env.TIMEZONE,
    }).format(now || new Date())
  );
}

export function isQuietHours(now?: Date): boolean {
  const start = Number(process.env.QUIET_HOUR_START);
  const end = Number(process.env.QUIET_HOUR_END);

  if (start && end) {
    const currentHour = getCurrentHour(now);
    return start < end
      ? currentHour >= start && currentHour <= end
      : currentHour >= start || currentHour <= end;
  }
  return false;
}
