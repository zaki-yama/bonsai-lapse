import { ApiError } from "../lib/api";

/**
 * エラー表示。Cloudflare Access のログイン切れらしい場合は、
 * Service Worker を経由しない /login への遷移ボタンを出して再認証させる。
 */
export default function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const authLikely = error instanceof ApiError && error.authLikely;
  return (
    <div className="notice notice--error">
      <p>{message}</p>
      {authLikely && (
        <button
          className="btn btn--accent"
          onClick={() => window.location.assign("/login")}
        >
          ログイン
        </button>
      )}
    </div>
  );
}
