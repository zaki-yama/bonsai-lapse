# 盆栽帖 — Bonsai Lapse

盆栽の成長を記録する個人用 Web アプリ(PWA)。数日おきに撮影した写真をアルバムとして閲覧でき、写真が溜まったらブラウザ内でタイムラプス動画を生成する。

## 機能

- **撮影**: アプリ内カメラ(前回写真を半透明で重ねるオニオンスキン付き)/ カメラロールからの取り込み
- **アルバム**: 月別・日付順のグリッド表示、詳細表示(左右スワイプで前後の写真へ移動)・削除
- **タイムラプス**: 期間と速さを指定してブラウザ内(WebCodecs)で MP4 を生成。新しい写真が N 枚溜まると生成を提案。写真ごとに対象/対象外を切り替え可能(失敗写真をアルバムに残したまま動画から外せる)。一覧は動画プレビュー付き
- **共有**: 生成した動画を iOS 共有シートでカメラロール保存・共有

## 技術スタック

| レイヤ | 技術 |
|---|---|
| フロントエンド | React + TypeScript + Vite + vite-plugin-pwa |
| API | Cloudflare Workers + Hono(静的アセットも Workers から配信) |
| ストレージ | Cloudflare R2(画像・動画)+ D1(メタデータ) |
| 動画生成 | mediabunny(WebCodecs)。iOS 16.4+ の Safari が必要 |
| 認証 | Cloudflare Access(コード実装なし、手前で保護) |

すべて Cloudflare の無料枠で運用できる(Workers 10万リクエスト/日、R2 10GB、D1 5GB)。

## 開発

```sh
npm install
npm run db:migrate:local   # ローカル D1 にスキーマ適用(初回のみ)
npm run dev                # http://localhost:5173
```

`npm run dev` は Vite と Workers ランタイム(R2/D1 はローカルエミュレーション)を 1 プロセスで起動する。

```sh
npm run check   # 型チェック
npm run build   # 本番ビルド
```

## デプロイ手順

1. Cloudflare アカウントを用意して `npx wrangler login`
2. リソースを作成する

   ```sh
   npx wrangler r2 bucket create bonsai-lapse
   npx wrangler d1 create bonsai-lapse-db
   ```

3. `d1 create` が表示した `database_id` を `wrangler.jsonc` の `REPLACE_WITH_YOUR_DATABASE_ID` に書き込む
4. スキーマ適用とデプロイ

   ```sh
   npm run db:migrate:remote
   npm run deploy
   ```

5. **Cloudflare Access で保護する**(公開 URL のため必須)
   1. Cloudflare ダッシュボード → Zero Trust(初回はチーム名を決めて Free プランを選択)
   2. Access → Applications → Add an application → **Self-hosted**
   3. ドメインにデプロイ先(`bonsai-lapse.<account>.workers.dev`)を指定
   4. ポリシー: Allow / Include → Emails → 自分のメールアドレス
   5. Session Duration を 1 ヶ月にすると再ログイン頻度が下がる

## iPhone で使う

デプロイ先 URL を Safari で開き、メール宛のワンタイム PIN でログイン後、
共有シート → **ホーム画面に追加** でフルスクリーンの PWA として使える。

## トラブルシューティング

### 「通信に失敗しました」「ログインセッションが切れています」と出る

PWA(Service Worker)がアプリ画面をキャッシュしているため、Access のセッションが
ない状態でもアプリ自体は開けてしまい、API 呼び出しだけが失敗する。
エラーに表示される **ログイン** ボタン(または `/login` を直接開く)で
Access のログインを通せば復帰する。

## 制限事項

- タイムラプス生成は WebCodecs を使うため iOS 16.4 以降(非対応環境は MediaRecorder にフォールバック)
- リマインダー通知は非搭載(iOS 標準のリマインダー等で代替する想定)
