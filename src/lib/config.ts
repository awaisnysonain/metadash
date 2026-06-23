export type DataMode = 'live' | 'demo';

export interface AppConfig {
  dataMode: DataMode;
  isDemoMode: boolean;
  isLiveMode: boolean;
  apiBaseUrl: string;
  metaWebhookUrl: string;
  isDatabaseAvailable: boolean;
}

function env(key: string, fallback = ''): string {
  return (import.meta.env[key] as string | undefined) ?? fallback;
}

function isTruthy(v: string): boolean {
  return v === 'true' || v === '1';
}

export function getAppConfig(): AppConfig {
  const isDemoMode = isTruthy(env('VITE_DEMO_MODE', 'false'));
  const dataMode: DataMode = isDemoMode ? 'demo' : 'live';

  return {
    dataMode,
    isDemoMode,
    isLiveMode: !isDemoMode,
    apiBaseUrl: env('VITE_API_BASE_URL', ''),
    metaWebhookUrl: env('VITE_META_WEBHOOK_URL', 'https://meta-dashboard.nysonik.com/api/meta/webhook'),
    isDatabaseAvailable: !isDemoMode,
  };
}

export function resolveDataMode(): DataMode {
  return getAppConfig().dataMode;
}
