import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  getFirstEncodableVideoCodec,
} from "mediabunny";
import type { Photo } from "./api";
import { decodeImage } from "./image";

export type TimelapseProgress = {
  /** 処理済み枚数 */
  current: number;
  total: number;
};

const MAX_LONG_EDGE = 1440;

/**
 * 写真列からタイムラプス MP4 を生成する(すべてブラウザ内で完結)。
 * WebCodecs (iOS 16.4+) を使用し、非対応環境では MediaRecorder にフォールバックする。
 */
export async function generateTimelapse(
  photos: Photo[],
  secondsPerPhoto: number,
  onProgress: (p: TimelapseProgress) => void,
): Promise<Blob> {
  if (photos.length < 2) {
    throw new Error("タイムラプスには写真が 2 枚以上必要です");
  }
  const ordered = [...photos].sort((a, b) =>
    a.takenAt.localeCompare(b.takenAt),
  );

  // 最初の写真の縦横比で出力サイズを決める(H.264 の制約で偶数に丸める)
  const first = await loadPhoto(ordered[0]);
  const scale = Math.min(
    1,
    MAX_LONG_EDGE / Math.max(first.naturalWidth, first.naturalHeight),
  );
  const width = Math.floor((first.naturalWidth * scale) / 2) * 2;
  const height = Math.floor((first.naturalHeight * scale) / 2) * 2;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const codec = await getFirstEncodableVideoCodec(["avc", "hevc", "vp9"], {
    width,
    height,
  });
  if (!codec) {
    return generateWithMediaRecorder(
      ordered,
      first,
      canvas,
      ctx,
      secondsPerPhoto,
      onProgress,
    );
  }

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, {
    codec,
    bitrate: QUALITY_HIGH,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source, { frameRate: 30 });
  await output.start();

  let timestamp = 0;
  for (let i = 0; i < ordered.length; i++) {
    const img = i === 0 ? first : await loadPhoto(ordered[i]);
    drawCover(ctx, img, width, height);
    URL.revokeObjectURL(img.src);
    await source.add(timestamp, secondsPerPhoto);
    timestamp += secondsPerPhoto;
    onProgress({ current: i + 1, total: ordered.length });
  }
  source.close();
  await output.finalize();

  return new Blob([output.target.buffer!], { type: "video/mp4" });
}

async function loadPhoto(photo: Photo): Promise<HTMLImageElement> {
  const res = await fetch(photo.imageUrl);
  if (!res.ok) throw new Error("写真の取得に失敗しました");
  return decodeImage(await res.blob());
}

// 最初の写真とアスペクト比が違う写真も、はみ出し裁ち落とし(cover)で敷き詰める
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
): void {
  const scale = Math.max(
    width / img.naturalWidth,
    height / img.naturalHeight,
  );
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
}

// WebCodecs 非対応環境向け: canvas.captureStream + MediaRecorder(実時間で描画するため遅い)
async function generateWithMediaRecorder(
  ordered: Photo[],
  first: HTMLImageElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  secondsPerPhoto: number,
  onProgress: (p: TimelapseProgress) => void,
): Promise<Blob> {
  const mimeType = ["video/mp4", "video/webm"].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
  if (!mimeType) {
    throw new Error(
      "このブラウザは動画生成に対応していません(iOS 16.4 以降の Safari をお使いください)",
    );
  }
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start();
  for (let i = 0; i < ordered.length; i++) {
    const img = i === 0 ? first : await loadPhoto(ordered[i]);
    drawCover(ctx, img, canvas.width, canvas.height);
    URL.revokeObjectURL(img.src);
    onProgress({ current: i + 1, total: ordered.length });
    await new Promise((r) => setTimeout(r, secondsPerPhoto * 1000));
  }
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());

  return new Blob(chunks, { type: mimeType });
}
