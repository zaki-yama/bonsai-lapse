import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Photo, type Video } from "../lib/api";
import { generateTimelapse, type TimelapseProgress } from "../lib/timelapse";
import { loadSettings } from "../lib/settings";
import { formatDate } from "./AlbumPage";
import ErrorNotice from "../components/ErrorNotice";

export default function TimelapsePage() {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const [creating, setCreating] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [secondsPerPhoto, setSecondsPerPhoto] = useState(
    loadSettings().secondsPerPhoto,
  );
  const [progress, setProgress] = useState<TimelapseProgress | null>(null);
  const [playing, setPlaying] = useState<Video | null>(null);
  const [sharing, setSharing] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [videoList, photoList] = await Promise.all([
        api.listVideos(),
        api.listPhotos(),
      ]);
      setVideos(videoList);
      setPhotos(photoList);
      return photoList;
    } catch (e) {
      setError(e);
      return [];
    }
  }, []);

  useEffect(() => {
    void reload().then((photoList) => {
      // アルバムのバナーから遷移してきたときは作成パネルを開いておく
      if (searchParams.get("create") === "1") {
        openCreatePanel(photoList);
        setSearchParams({}, { replace: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreatePanel = (photoList: Photo[]) => {
    if (photoList.length < 2) {
      setError("タイムラプスには写真が 2 枚以上必要です");
      return;
    }
    const sorted = [...photoList].sort((a, b) =>
      a.takenAt.localeCompare(b.takenAt),
    );
    setFrom(toDateInput(sorted[0].takenAt));
    setTo(toDateInput(sorted[sorted.length - 1].takenAt));
    setSecondsPerPhoto(loadSettings().secondsPerPhoto);
    setCreating(true);
  };

  const targetPhotos = useMemo(() => {
    if (!from || !to) return [];
    return photos
      .filter((p) => {
        const day = toDateInput(p.takenAt);
        return from <= day && day <= to;
      })
      .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  }, [photos, from, to]);

  const generate = async () => {
    setError(null);
    setProgress({ current: 0, total: targetPhotos.length });
    try {
      const blob = await generateTimelapse(
        targetPhotos,
        secondsPerPhoto,
        setProgress,
      );
      await api.uploadVideo(blob, {
        fromTakenAt: targetPhotos[0].takenAt,
        toTakenAt: targetPhotos[targetPhotos.length - 1].takenAt,
        photoCount: targetPhotos.length,
      });
      setCreating(false);
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setProgress(null);
    }
  };

  const share = async (video: Video) => {
    setSharing(true);
    setError(null);
    try {
      const res = await fetch(video.videoUrl);
      const blob = await res.blob();
      const file = new File(
        [blob],
        `bonsai-lapse-${toDateInput(video.toTakenAt).replaceAll("-", "")}.mp4`,
        { type: "video/mp4" },
      );
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        // 共有シート非対応 (PC ブラウザなど) はダウンロードにフォールバック
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      // ユーザーが共有シートを閉じただけの場合は無視
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e);
      }
    } finally {
      setSharing(false);
    }
  };

  const onDelete = async (video: Video) => {
    if (!confirm("この動画を削除しますか?")) return;
    try {
      await api.deleteVideo(video.id);
      setPlaying(null);
      await reload();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Timelapse</h1>
        <div className="page__actions">
          <button
            className="btn btn--accent"
            onClick={() => openCreatePanel(photos)}
          >
            作成
          </button>
        </div>
      </header>

      <ErrorNotice error={error} />

      {videos === null ? (
        <p className="empty">読み込み中…</p>
      ) : videos.length === 0 ? (
        <div className="empty">
          <p>まだタイムラプスがありません。</p>
          <p>写真が溜まったら「作成」から生成できます。</p>
        </div>
      ) : (
        <ul className="video-list">
          {videos.map((video) => (
            <li key={video.id}>
              <button className="video-card" onClick={() => setPlaying(video)}>
                <span className="video-card__period">
                  {formatDate(video.fromTakenAt)} — {formatDate(video.toTakenAt)}
                </span>
                <span className="video-card__meta">
                  {video.photoCount} 枚 / 生成日 {formatDate(video.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <div className="sheet" onClick={() => !progress && setCreating(false)}>
          <div className="sheet__body" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet__title">タイムラプスを作成</h2>
            <label className="field">
              開始日
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={!!progress}
              />
            </label>
            <label className="field">
              終了日
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={!!progress}
              />
            </label>
            <label className="field">
              速さ
              <select
                value={secondsPerPhoto}
                onChange={(e) => setSecondsPerPhoto(Number(e.target.value))}
                disabled={!!progress}
              >
                <option value={0.15}>速い (0.15秒/枚)</option>
                <option value={0.25}>ふつう (0.25秒/枚)</option>
                <option value={0.5}>ゆっくり (0.5秒/枚)</option>
              </select>
            </label>
            <p className="sheet__note">対象: {targetPhotos.length} 枚</p>
            {progress ? (
              <div className="progress">
                <div
                  className="progress__bar"
                  style={{
                    width: `${(progress.current / Math.max(progress.total, 1)) * 100}%`,
                  }}
                />
                <span className="progress__label">
                  生成中… {progress.current}/{progress.total}
                </span>
              </div>
            ) : (
              <div className="sheet__buttons">
                <button className="btn" onClick={() => setCreating(false)}>
                  やめる
                </button>
                <button
                  className="btn btn--accent"
                  onClick={() => void generate()}
                  disabled={targetPhotos.length < 2}
                >
                  生成開始
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {playing && (
        <div className="viewer" onClick={() => setPlaying(null)}>
          <div className="viewer__body" onClick={(e) => e.stopPropagation()}>
            <video src={playing.videoUrl} controls autoPlay playsInline loop />
            <div className="viewer__meta">
              <time>
                {formatDate(playing.fromTakenAt)} — {formatDate(playing.toTakenAt)}
              </time>
              <div className="viewer__buttons">
                <button
                  className="btn btn--danger"
                  onClick={() => void onDelete(playing)}
                >
                  削除
                </button>
                <button
                  className="btn btn--accent"
                  onClick={() => void share(playing)}
                  disabled={sharing}
                >
                  {sharing ? "準備中…" : "共有 / 保存"}
                </button>
                <button className="btn" onClick={() => setPlaying(null)}>
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

function toDateInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
