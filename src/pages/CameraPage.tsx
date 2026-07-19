import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Photo } from "../lib/api";
import { canvasToJpeg } from "../lib/image";

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [lastPhoto, setLastPhoto] = useState<Photo | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0.4);
  const [showOverlay, setShowOverlay] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 2048 },
            height: { ideal: 2048 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setError(
          "カメラを起動できませんでした。ブラウザのカメラ許可を確認してください。",
        );
      }
    })();
    (async () => {
      try {
        const photos = await api.listPhotos();
        // タイムラプス対象外(excluded)の写真は重ね合わせに使わない
        const latest = photos.find((p) => !p.excluded);
        if (!cancelled && latest) setLastPhoto(latest);
      } catch {
        // オニオンスキンが出ないだけなので握りつぶす
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || saving) return;
    setSaving(true);
    setError(null);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      const jpeg = await canvasToJpeg(canvas);
      await api.uploadPhoto(jpeg, new Date().toISOString());
      navigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="camera">
      <video ref={videoRef} autoPlay playsInline muted className="camera__preview" />
      {lastPhoto && showOverlay && (
        <img
          src={lastPhoto.imageUrl}
          alt=""
          className="camera__onion"
          style={{ opacity: overlayOpacity }}
        />
      )}
      {flash && <div className="camera__flash" />}

      <div className="camera__top">
        <button className="btn btn--ghost" onClick={() => navigate(-1)}>
          閉じる
        </button>
        {lastPhoto && (
          <button
            className="btn btn--ghost"
            onClick={() => setShowOverlay((v) => !v)}
          >
            {showOverlay ? "前回写真: 表示" : "前回写真: 非表示"}
          </button>
        )}
      </div>

      {error && <p className="camera__error">{error}</p>}

      <div className="camera__bottom">
        {lastPhoto && showOverlay && (
          <label className="camera__opacity">
            重ね具合
            <input
              type="range"
              min="0.1"
              max="0.8"
              step="0.05"
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(Number(e.target.value))}
            />
          </label>
        )}
        <button
          className="camera__shutter"
          onClick={() => void capture()}
          disabled={saving}
          aria-label="シャッター"
        >
          {saving && <span className="camera__saving">保存中…</span>}
        </button>
      </div>
    </div>
  );
}
