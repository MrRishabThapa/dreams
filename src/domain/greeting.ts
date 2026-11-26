/** Time-of-day greeting by local hour: morning < 12, afternoon < 17, evening < 21, night otherwise (incl. before 5). */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

/** The name to greet with, trimmed; null when none is set. */
export function displayName(name: string | null | undefined): string | null {
  const n = (name ?? '').replace(/\s+/g, ' ').trim();
  return n ? n : null;
}

export const NAME_MAX = 40;
