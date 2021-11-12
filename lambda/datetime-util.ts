
export function formatDate(date: Date, timezoneCode?: string): string {
  return new Intl.DateTimeFormat("default", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
    timeZone: timezoneCode,
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
