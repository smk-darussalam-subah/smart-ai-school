export function schoolMinute(value: string) {
  const date = new Date(new Date(value).getTime() + 7 * 3600000);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}
