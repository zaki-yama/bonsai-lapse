const MAX_LONG_EDGE = 2048;
const JPEG_QUALITY = 0.88;

/**
 * 取り込み/撮影画像を JPEG に正規化する。
 * - HEIC など iOS 特有の形式も <img> デコード経由で吸収する
 * - 長辺 2048px に収めて R2 の容量を節約する
 */
export async function normalizeToJpeg(source: Blob): Promise<Blob> {
  const image = await decodeImage(source);
  const scale = Math.min(
    1,
    MAX_LONG_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0, width, height);
  URL.revokeObjectURL(image.src);

  return canvasToJpeg(canvas);
}

export function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めませんでした"));
    };
    img.src = url;
  });
}

export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("JPEG 変換に失敗しました")),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}
