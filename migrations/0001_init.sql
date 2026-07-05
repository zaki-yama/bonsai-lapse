-- photos: 撮影した/取り込んだ写真のメタデータ。画像本体は R2
CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  taken_at TEXT NOT NULL, -- ISO 8601 (UTC)
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_photos_taken_at ON photos (taken_at);

-- videos: 生成済みタイムラプス動画。本体は R2
CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  from_taken_at TEXT NOT NULL, -- 動画に含まれる最初の写真の taken_at
  to_taken_at TEXT NOT NULL,   -- 同じく最後の写真の taken_at
  photo_count INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_videos_created_at ON videos (created_at);
