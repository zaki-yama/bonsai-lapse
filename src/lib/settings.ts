export type Settings = {
  /** この枚数の新しい写真が溜まったらタイムラプス生成を促す */
  autoGenThreshold: number;
  /** タイムラプスでの 1 枚あたりの表示秒数 */
  secondsPerPhoto: number;
};

const KEY = "bonsai-lapse:settings";

const DEFAULTS: Settings = {
  autoGenThreshold: 10,
  secondsPerPhoto: 0.25,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
