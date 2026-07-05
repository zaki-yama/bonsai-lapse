import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
};

type PhotoRow = {
  id: string;
  taken_at: string;
  r2_key: string;
  created_at: string;
};

type VideoRow = {
  id: string;
  from_taken_at: string;
  to_taken_at: string;
  photo_count: number;
  r2_key: string;
  created_at: string;
};

const app = new Hono<{ Bindings: Bindings }>().basePath("/api");

// ---- photos ----

app.get("/photos", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, taken_at, created_at FROM photos ORDER BY taken_at DESC",
  ).all<PhotoRow>();
  return c.json({
    photos: results.map((r) => ({
      id: r.id,
      takenAt: r.taken_at,
      createdAt: r.created_at,
      imageUrl: `/api/photos/${r.id}/image`,
    })),
  });
});

app.post("/photos", async (c) => {
  const form = await c.req.formData();
  // workers-types の FormData.get は string | null 固定だが、実行時は File が返る
  const file = form.get("file") as unknown;
  const takenAt = form.get("takenAt");
  if (!(file instanceof File) || typeof takenAt !== "string" || !takenAt) {
    return c.json({ error: "file と takenAt が必要です" }, 400);
  }
  const id = crypto.randomUUID();
  const r2Key = `photos/${id}.jpg`;
  await c.env.BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: "image/jpeg" },
  });
  await c.env.DB.prepare(
    "INSERT INTO photos (id, taken_at, r2_key) VALUES (?, ?, ?)",
  )
    .bind(id, takenAt, r2Key)
    .run();
  return c.json(
    { id, takenAt, imageUrl: `/api/photos/${id}/image` },
    201,
  );
});

app.get("/photos/:id/image", async (c) => {
  const row = await c.env.DB.prepare("SELECT r2_key FROM photos WHERE id = ?")
    .bind(c.req.param("id"))
    .first<Pick<PhotoRow, "r2_key">>();
  if (!row) return c.json({ error: "not found" }, 404);
  return serveR2Object(c.env.BUCKET, row.r2_key, c.req.raw, "image/jpeg");
});

app.delete("/photos/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT r2_key FROM photos WHERE id = ?")
    .bind(c.req.param("id"))
    .first<Pick<PhotoRow, "r2_key">>();
  if (!row) return c.json({ error: "not found" }, 404);
  await c.env.BUCKET.delete(row.r2_key);
  await c.env.DB.prepare("DELETE FROM photos WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

// ---- videos ----

app.get("/videos", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, from_taken_at, to_taken_at, photo_count, created_at FROM videos ORDER BY created_at DESC",
  ).all<VideoRow>();
  return c.json({
    videos: results.map((r) => ({
      id: r.id,
      fromTakenAt: r.from_taken_at,
      toTakenAt: r.to_taken_at,
      photoCount: r.photo_count,
      createdAt: r.created_at,
      videoUrl: `/api/videos/${r.id}/video`,
    })),
  });
});

app.post("/videos", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file") as unknown;
  const fromTakenAt = form.get("fromTakenAt");
  const toTakenAt = form.get("toTakenAt");
  const photoCount = Number(form.get("photoCount"));
  if (
    !(file instanceof File) ||
    typeof fromTakenAt !== "string" ||
    typeof toTakenAt !== "string" ||
    !Number.isInteger(photoCount) ||
    photoCount <= 0
  ) {
    return c.json(
      { error: "file, fromTakenAt, toTakenAt, photoCount が必要です" },
      400,
    );
  }
  const id = crypto.randomUUID();
  const r2Key = `videos/${id}.mp4`;
  await c.env.BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: "video/mp4" },
  });
  await c.env.DB.prepare(
    "INSERT INTO videos (id, from_taken_at, to_taken_at, photo_count, r2_key) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, fromTakenAt, toTakenAt, photoCount, r2Key)
    .run();
  return c.json({ id, videoUrl: `/api/videos/${id}/video` }, 201);
});

app.get("/videos/:id/video", async (c) => {
  const row = await c.env.DB.prepare("SELECT r2_key FROM videos WHERE id = ?")
    .bind(c.req.param("id"))
    .first<Pick<VideoRow, "r2_key">>();
  if (!row) return c.json({ error: "not found" }, 404);
  return serveR2Object(c.env.BUCKET, row.r2_key, c.req.raw, "video/mp4");
});

app.delete("/videos/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT r2_key FROM videos WHERE id = ?")
    .bind(c.req.param("id"))
    .first<Pick<VideoRow, "r2_key">>();
  if (!row) return c.json({ error: "not found" }, 404);
  await c.env.BUCKET.delete(row.r2_key);
  await c.env.DB.prepare("DELETE FROM videos WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

// ---- status(自動生成トリガー判定用)----

app.get("/status", async (c) => {
  const photoCount =
    (
      await c.env.DB.prepare("SELECT COUNT(*) AS n FROM photos").first<{
        n: number;
      }>()
    )?.n ?? 0;
  const newPhotos =
    (
      await c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM photos
         WHERE created_at > COALESCE((SELECT MAX(created_at) FROM videos), '')`,
      ).first<{ n: number }>()
    )?.n ?? 0;
  return c.json({ photoCount, newPhotosSinceLastVideo: newPhotos });
});

// R2 オブジェクトを Range リクエスト対応で配信する。
// iOS Safari の <video> は Range 対応が必須
async function serveR2Object(
  bucket: R2Bucket,
  key: string,
  req: Request,
  contentType: string,
): Promise<Response> {
  const rangeHeader = req.headers.get("Range");
  const baseHeaders = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
  };

  const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (match && (match[1] !== "" || match[2] !== "")) {
    const head = await bucket.head(key);
    if (!head) return new Response("not found", { status: 404 });
    const size = head.size;
    let start: number;
    let end: number;
    if (match[1] === "") {
      // suffix range: bytes=-N (末尾 N バイト)
      const suffix = Math.min(Number(match[2]), size);
      start = size - suffix;
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
    }
    if (start > end || start >= size) {
      return new Response("range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    const obj = await bucket.get(key, {
      range: { offset: start, length: end - start + 1 },
    });
    if (!obj) return new Response("not found", { status: 404 });
    return new Response(obj.body, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
      },
    });
  }

  const obj = await bucket.get(key);
  if (!obj) return new Response("not found", { status: 404 });
  return new Response(obj.body, {
    headers: { ...baseHeaders, "Content-Length": String(obj.size) },
  });
}

export default app;
