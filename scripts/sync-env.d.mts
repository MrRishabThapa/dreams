export function resolveSyncEnv(env: Record<string, string | undefined>): { url: string; origin: string; configured: boolean };
export function checkSyncEnv(sync: { origin: string; configured: boolean }, processEnv: Record<string, string | undefined>, log?: (line: string) => void): void;
