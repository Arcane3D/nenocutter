export function uid(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}-${rand}${time}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
