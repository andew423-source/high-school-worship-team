const SEOUL_OFFSET = "+09:00";

export function saturdayDates(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00${SEOUL_OFFSET}`);
  const end = new Date(`${endDate}T00:00:00${SEOUL_OFFSET}`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start > end) return [];

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor.getDay() !== 6) cursor.setDate(cursor.getDate() + 1);
  while (cursor <= end) {
    dates.push(toSeoulDate(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return dates;
}

export function toSeoulDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatKoreanDate(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00${SEOUL_OFFSET}`));
}
