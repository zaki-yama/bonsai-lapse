import { useState } from "react";
import { loadSettings, saveSettings, type Settings } from "../lib/settings";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Settings</h1>
      </header>

      <section className="settings-group">
        <label className="field field--row">
          <span>
            自動生成のしきい値
            <small>新しい写真がこの枚数溜まったら生成を提案します</small>
          </span>
          <select
            value={settings.autoGenThreshold}
            onChange={(e) => update({ autoGenThreshold: Number(e.target.value) })}
          >
            {[5, 10, 15, 20, 30].map((n) => (
              <option key={n} value={n}>
                {n} 枚
              </option>
            ))}
          </select>
        </label>

        <label className="field field--row">
          <span>
            動画の速さ
            <small>1 枚の写真を表示する秒数</small>
          </span>
          <select
            value={settings.secondsPerPhoto}
            onChange={(e) => update({ secondsPerPhoto: Number(e.target.value) })}
          >
            <option value={0.15}>速い (0.15秒/枚)</option>
            <option value={0.25}>ふつう (0.25秒/枚)</option>
            <option value={0.5}>ゆっくり (0.5秒/枚)</option>
          </select>
        </label>
      </section>

      <p className="settings-note">
        写真と動画は Cloudflare R2 / D1 に保存されます。
        アプリの利用には Cloudflare Access でのログインが必要です。
      </p>
    </div>
  );
}
