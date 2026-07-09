import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Photo, type Status } from "../lib/api";
import { normalizeToJpeg } from "../lib/image";
import { loadSettings } from "../lib/settings";
import ErrorNotice from "../components/ErrorNotice";

export default function AlbumPage() {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [selected, setSelected] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const reload = useCallback(async () => {
    try {
      const [photoList, s] = await Promise.all([api.listPhotos(), api.status()]);
      setPhotos(photoList);
      setStatus(s);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const jpeg = await normalizeToJpeg(file);
        // カメラロール由来のファイルは lastModified が撮影日時になる
        const takenAt = new Date(file.lastModified || Date.now()).toISOString();
        await api.uploadPhoto(jpeg, takenAt);
      }
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onDelete = async (photo: Photo) => {
    if (!confirm("この写真を削除しますか?")) return;
    try {
      await api.deletePhoto(photo.id);
      setSelected(null);
      await reload();
    } catch (e) {
      setError(e);
    }
  };

  // ビューアの前後移動(photos は撮影日の新しい順 = グリッドの表示順)
  const selectedIndex =
    selected && photos ? photos.findIndex((p) => p.id === selected.id) : -1;

  const showNeighbor = useCallback(
    (dir: 1 | -1) => {
      if (!photos || selectedIndex < 0) return;
      const next = photos[selectedIndex + dir];
      if (next) setSelected(next);
    },
    [photos, selectedIndex],
  );

  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") showNeighbor(-1);
      if (e.key === "ArrowRight") showNeighbor(1);
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, showNeighbor]);

  const threshold = loadSettings().autoGenThreshold;
  const showAutoGenBanner =
    status !== null &&
    status.newPhotosSinceLastVideo >= threshold &&
    status.photoCount >= 2;

  const groups = groupByMonth(photos ?? []);

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Bonsai Lapse</h1>
        <div className="page__actions">
          <button
            className="btn btn--ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "取込中…" : "取り込む"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void onFilesSelected(e.target.files)}
          />
        </div>
      </header>

      <ErrorNotice error={error} />

      {showAutoGenBanner && (
        <div className="notice notice--accent">
          <p>
            新しい写真が {status.newPhotosSinceLastVideo} 枚溜まりました。
            タイムラプスを作りませんか?
          </p>
          <button
            className="btn btn--accent"
            onClick={() => navigate("/timelapse?create=1")}
          >
            作る
          </button>
        </div>
      )}

      {photos === null ? (
        <p className="empty">読み込み中…</p>
      ) : photos.length === 0 ? (
        <div className="empty">
          <p>まだ写真がありません。</p>
          <p>最初の一枚を撮影しましょう。</p>
        </div>
      ) : (
        groups.map(([month, items]) => (
          <section key={month} className="album-month">
            <h2 className="album-month__label">{month}</h2>
            <div className="album-grid">
              {items.map((photo) => (
                <button
                  key={photo.id}
                  className="album-grid__cell"
                  onClick={() => setSelected(photo)}
                >
                  <img src={photo.imageUrl} alt="" loading="lazy" />
                  <span className="album-grid__day">
                    {new Date(photo.takenAt).getDate()}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      <Link to="/camera" className="fab" aria-label="撮影する">
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
          <path
            d="M9 3 7.5 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.5L15 3H9Zm3 5.5A4.5 4.5 0 1 1 12 17.5 4.5 4.5 0 0 1 12 8.5Zm0 2A2.5 2.5 0 1 0 12 15.5 2.5 2.5 0 0 0 12 10.5Z"
            fill="currentColor"
          />
        </svg>
      </Link>

      {selected && (
        <div className="viewer" onClick={() => setSelected(null)}>
          <div
            className="viewer__body"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              touchStart.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
              };
            }}
            onTouchEnd={(e) => {
              const start = touchStart.current;
              touchStart.current = null;
              if (!start) return;
              const dx = e.changedTouches[0].clientX - start.x;
              const dy = e.changedTouches[0].clientY - start.y;
              // 横方向のスワイプだけ拾う(縦スクロールと区別する)
              if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                showNeighbor(dx < 0 ? 1 : -1);
              }
            }}
          >
            <img src={selected.imageUrl} alt="" />
            <div className="viewer__meta">
              <div className="viewer__info">
                <time>{formatDate(selected.takenAt)}</time>
                {photos && (
                  <span className="viewer__count">
                    {selectedIndex + 1} / {photos.length}
                  </span>
                )}
              </div>
              <div className="viewer__buttons">
                <button
                  className="btn btn--danger"
                  onClick={() => void onDelete(selected)}
                >
                  削除
                </button>
                <button className="btn" onClick={() => setSelected(null)}>
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function groupByMonth(photos: Photo[]): Array<[string, Photo[]]> {
  const map = new Map<string, Photo[]>();
  for (const photo of photos) {
    const d = new Date(photo.takenAt);
    const key = `${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()}`;
    const list = map.get(key) ?? [];
    list.push(photo);
    map.set(key, list);
  }
  return [...map.entries()];
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
