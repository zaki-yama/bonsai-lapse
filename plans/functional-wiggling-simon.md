# bonsai-lapse: 盆栽成長記録 Web アプリ(PWA)

## Context

趣味の盆栽の成長を記録する個人用アプリ。数日おきに撮影した写真をアルバムとして閲覧でき、写真が溜まったらタイムラプス動画を生成する。当初 iOS ネイティブを検討したが、費用ゼロを優先して Web アプリ(スマホブラウザ/PWA)に方針転換。リポジトリは空の状態からの新規開発。

## 確定した要件

| 項目 | 決定内容 |
|---|---|
| 形態 | スマホ(iPhone Safari)向け Web アプリ。ホーム画面に追加して PWA として利用 |
| 対象 | 盆栽 1 鉢のみ |
| 写真の登録 | アプリ内カメラ撮影(getUserMedia)+ カメラロールからのアップロードの両方 |
| 撮影補助 | カメラ画面に前回写真を半透明で重ね表示(オニオンスキン、透明度調整付き) |
| アルバム | 撮影日順のグリッド表示、詳細表示・削除 |
| タイムラプス生成 | 手動(期間指定可)+ 自動(新規 N 枚溜まったら。デフォルト 10 枚、設定で変更可)。生成はブラウザ内で実行 |
| 動画の扱い | アプリ内再生・共有シート(Web Share API)経由でカメラロール保存/共有 |
| リマインダー | **なし**(Web Push はサーバー構成が複雑化するため断念。iOS 標準リマインダー等で代替) |
| データ保存 | Cloudflare R2(画像・動画)+ D1(メタデータ)。無料枠内で運用 |
| 認証 | Cloudflare Access(メール宛ワンタイム PIN、コード実装不要、無料) |
| メモ機能 | なし |

## 技術スタック

- **フロントエンド**: React + TypeScript + Vite。PWA 化は `vite-plugin-pwa`(manifest + service worker)
- **ホスティング/API**: Cloudflare **Workers**(Pages ではなく Workers + 静的アセット配信が現行の推奨)。API は **Hono** で実装。開発は `@cloudflare/vite-plugin` で Vite と Workers ランタイムを統合(1 つの dev サーバーで完結)
- **ストレージ**: **R2**(写真 JPEG・生成動画 MP4。無料枠 10GB・egress 無料)
- **DB**: **D1**(SQLite。写真・動画のメタデータ: id, 撮影日時, R2 キーなど)
- **認証**: **Cloudflare Access**(Zero Trust 無料枠)でアプリ全体を保護。セッション長は最長 1 ヶ月に設定
- **カメラ**: `getUserMedia` で `<video>` プレビュー + 前回写真を CSS opacity で重ね表示 → canvas でキャプチャして JPEG 化
- **タイムラプス生成(クライアントサイド)**: WebCodecs `VideoEncoder`(iOS Safari 16.4+)+ mp4-muxer で MP4 を生成 → R2 へアップロード。WebCodecs 非対応環境向けフォールバックは canvas.captureStream + MediaRecorder(Safari は video/mp4 出力可)
  - ※ Workers 無料枠では ffmpeg 等のサーバーサイド動画処理は不可のため、ブラウザ内生成が必須
- **共有/保存**: `navigator.share({ files })` で iOS 共有シートを起動(カメラロール保存・LINE 等への共有を兼ねる)
- **設定値**(自動生成の枚数 N、1 枚あたりの表示秒数): localStorage に保存

## リポジトリ構成

```
bonsai-lapse/
├── src/                  # React フロントエンド
│   ├── pages/            # Album / Camera / Timelapse / Settings
│   ├── components/
│   ├── lib/              # APIクライアント, timelapse生成(WebCodecs)
│   └── main.tsx
├── worker/
│   └── index.ts          # Hono API (photos/videos CRUD, R2配信)
├── migrations/           # D1 スキーマ
├── wrangler.jsonc        # Workers/R2/D1 バインディング
├── vite.config.ts
└── package.json
```

## API 設計(Hono)

- `GET /api/photos` / `POST /api/photos`(multipart で JPEG)/ `DELETE /api/photos/:id`
- `GET /api/photos/:id/image` — R2 から画像本体を配信(サムネイルはフロントで縮小表示)
- `GET /api/videos` / `POST /api/videos`(生成済み MP4 をアップロード)/ `DELETE /api/videos/:id`
- 認証は Cloudflare Access が手前で担うため API 側の認証コードは不要

## 実装ステップ

1. **雛形**: Vite(React-TS)+ `@cloudflare/vite-plugin` + Hono + wrangler.jsonc(R2/D1 バインディング)、D1 マイグレーション(photos, videos テーブル)
2. **API**: 写真のアップロード/一覧/削除/画像配信、動画の登録/一覧/削除
3. **アルバム画面**: 日付順グリッド、`<input type="file">` からのアップロード、詳細表示・削除
4. **カメラ画面**: getUserMedia プレビュー + オニオンスキン(前回写真、透明度スライダー)+ シャッター → アップロード
5. **タイムラプス**: WebCodecs + mp4-muxer による生成(期間指定 UI 付き)、R2 保存、一覧・プレイヤー画面
6. **自動生成**: 写真追加後に「前回動画以降の枚数 ≥ N」なら生成を促す/実行。設定画面(N・動画速度)
7. **PWA 化**: manifest・アイコン・service worker(アプリシェルのキャッシュ)
8. **共有**: Web Share API で動画をカメラロール保存・共有
9. **デプロイ**: `wrangler deploy`、D1 マイグレーション適用、Cloudflare ダッシュボードで Access 設定(自分のメールのみ許可、セッション 1 ヶ月)

## 検証方法

- **ローカル**: `npm run dev`(Vite + Workers ランタイム統合、R2/D1 はローカルエミュレーション)でアルバム→アップロード→タイムラプス生成→再生の一連フローを確認。カメラは Mac のブラウザ(localhost は getUserMedia 可)で確認
- **実機(iPhone)**: デプロイ後の URL で Safari から確認 — カメラ起動・オニオンスキン・WebCodecs 生成・共有シート・ホーム画面追加(PWA)は実機でしか完全確認できない
- **無料枠の確認**: Workers 10万リクエスト/日・R2 10GB・D1 5GB — 個人利用では到底届かない水準であることをデプロイ後に再確認

## 前提・注意点

- Cloudflare アカウントが必要(未作成なら無料登録)。`wrangler login` でのログインは実装フェーズでユーザー操作が必要
- WebCodecs は iOS 16.4 以降が必要(それ以前は MediaRecorder フォールバック)
- Cloudflare Access 配下でも PWA・API は問題なく動作するが、セッション切れ時に再ログイン(メール PIN)が必要
