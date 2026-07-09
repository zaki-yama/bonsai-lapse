# 撮影リマインダー通知(Web Push)実装プラン

> GitHub リポジトリ作成後、このままissueとして登録する想定のドキュメント。
> 2026-07-09 作成。osarai(https://github.com/zaki-yama/osarai)で同一スタック上に実装・実機検証済みの方式の流用。

## 背景

企画時は「Web Push はサーバー構成が複雑化するため断念」とした([plans/functional-wiggling-simon.md](../plans/functional-wiggling-simon.md))。しかし osarai で検証した結果、**本アプリと同じ構成(Hono on Cloudflare Workers + D1 + PWA)のまま、追加インフラなしで実現できる**ことがわかった。複雑化の原因と思われていたポイントはすべて解消可能:

- サーバー常駐プロセス不要 → **Workers Cron Triggers**(無料枠内)で定時実行
- push ライブラリ(`web-push`)が Node 依存で Workers で動かない → WebCrypto ベースの **`@block65/webcrypto-web-push`** で解決
- iOS の Web Push 非対応 → iOS 16.4+ の**ホーム画面追加 PWA なら受信可**(本アプリは既に PWA)

osarai での実機検証済み事項: iPhone(ホーム画面 PWA)での購読・受信・通知タップからの起動、Cloudflare Access 併用時も配信に影響なし(cron は HTTP を通らないため)。

## 仕様案

- 毎朝決まった時刻(例: 8:00 JST)に cron が起動し、**最後の撮影から N 日以上**(例: 3日)経っていたら「そろそろ盆栽を撮りませんか?(前回から N 日)」を送る
- 判定は `SELECT MAX(taken_at) FROM photos`(既存の `idx_photos_taken_at` が使える)
- 通知タップで撮影画面を開く(`notificationclick` → `openWindow("/capture")` など)
- 購読のオン/オフは設定またはヘッダーのトグルで。購読情報は D1 に保存

## 実装タスク

参考実装はすべて osarai リポジトリ内(public)。

### 1. VAPID 鍵の準備
- `npx web-push generate-vapid-keys` で生成
- 公開鍵: `wrangler.jsonc` の `vars.VAPID_PUBLIC_KEY`(+ `VAPID_SUBJECT: "mailto:..."`)
- 秘密鍵: `wrangler secret put VAPID_PRIVATE_KEY` / ローカルは `.dev.vars`

### 2. D1: 購読テーブル追加(マイグレーション)
```sql
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription TEXT NOT NULL, -- PushSubscription の JSON
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
```

### 3. Worker: 購読 API + 送信ロジック + scheduled ハンドラ
- `pnpm add @block65/webcrypto-web-push`(bonsai-lapse は npm なので `npm i`)
- ルート追加: `GET /api/push/public-key`, `POST /api/push/subscribe`, `POST /api/push/unsubscribe`, `POST /api/push/test`(実機テスト用)
  - 参考: [osarai src/worker/index.ts](https://github.com/zaki-yama/osarai/blob/main/src/worker/index.ts)
- 送信モジュール: 購読を全件取得 → `buildPushPayload()`(VAPID 署名 + aes128gcm 暗号化)→ endpoint へ fetch。404/410 の購読は削除
  - 参考: [osarai src/worker/push.ts](https://github.com/zaki-yama/osarai/blob/main/src/worker/push.ts)
- `worker/index.ts` のエクスポートを変更(現在は `export default root;`):
  ```ts
  export default {
    fetch: root.fetch,
    scheduled: async (_controller, env) => {
      await sendCaptureReminder(env); // MAX(taken_at) が N 日以上前なら送信
    },
  } satisfies ExportedHandler<Bindings>;
  ```
- `wrangler.jsonc` に cron 追加: `"triggers": { "crons": ["0 23 * * *"] }`(= 8:00 JST)

### 4. Service Worker: push ハンドラ追加 ⚠️ 本アプリ固有の注意点
osarai は手書き `public/sw.js` だが、bonsai-lapse は **vite-plugin-pwa の `generateSW` 戦略**(自動生成 SW)のため、push イベントハンドラを差し込むには **`injectManifest` 戦略への切り替え**が必要:

- `VitePWA({ strategies: "injectManifest", srcDir: "src", filename: "sw.ts", ... })`
- `src/sw.ts` に precache(`precacheAndRoute(self.__WB_MANIFEST)`)+ `push` / `notificationclick` ハンドラを実装
  - push ハンドラ参考: [osarai public/sw.js](https://github.com/zaki-yama/osarai/blob/main/public/sw.js)

### 5. フロント: 購読 UI
- 購読ヘルパー(SW ready → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → API へ POST)
  - 参考: [osarai src/react-app/push.ts](https://github.com/zaki-yama/osarai/blob/main/src/react-app/push.ts)
- ベル/トグル UI(unsupported / off / on / busy の4状態)
  - 参考: [osarai src/react-app/App.tsx の NotificationBell](https://github.com/zaki-yama/osarai/blob/main/src/react-app/App.tsx)

### 6. 検証
1. ローカル: 購読 API に fake subscription を入れて `POST /api/push/test` → 「Invalid EC key」エラーが返れば署名・暗号化パイプラインは正常(fake の鍵が無効なだけ)
2. 実機(iPhone): PWA 再インストール → 購読 → `/api/push/test` で受信確認(Access 有効時は認証付きで叩く)
3. cron 本番確認: ダッシュボード → Worker → Settings → Trigger events → View events

## 補足

- `wrangler dev --test-scheduled` は assets 付き Worker では scheduled イベントが届かない既知の制限がある(osaraiで確認)。cron 本体の確認は本番の Trigger events ログで行う
- リマインダー時刻や「N 日」は最初はハードコードでよい。設定画面を作るなら D1 に settings テーブルを追加
- 通知の仕様・仕組みの詳細ドキュメント: [osarai docs/notifications.md](https://github.com/zaki-yama/osarai/blob/main/docs/notifications.md)
