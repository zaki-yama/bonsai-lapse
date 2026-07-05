export type Photo = {
  id: string;
  takenAt: string;
  createdAt: string;
  imageUrl: string;
};

export type Video = {
  id: string;
  fromTakenAt: string;
  toTakenAt: string;
  photoCount: number;
  createdAt: string;
  videoUrl: string;
};

export type Status = {
  photoCount: number;
  newPhotosSinceLastVideo: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    // Cloudflare Access のセッション切れは別ドメインへのリダイレクトになり
    // fetch が失敗する。ページ再読み込みで再ログインさせる
    throw new ApiError(
      "通信に失敗しました。ログインセッションが切れている場合はページを再読み込みしてください",
    );
  }
  const contentType = res.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ApiError(
      "セッションが切れました。ページを再読み込みしてください",
      res.status,
    );
  }
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new ApiError(body.error ?? `エラー (${res.status})`, res.status);
  }
  return body;
}

export const api = {
  async listPhotos(): Promise<Photo[]> {
    const { photos } = await request<{ photos: Photo[] }>("/api/photos");
    return photos;
  },

  async uploadPhoto(image: Blob, takenAt: string): Promise<void> {
    const form = new FormData();
    form.append("file", image, "photo.jpg");
    form.append("takenAt", takenAt);
    await request("/api/photos", { method: "POST", body: form });
  },

  async deletePhoto(id: string): Promise<void> {
    await request(`/api/photos/${id}`, { method: "DELETE" });
  },

  async listVideos(): Promise<Video[]> {
    const { videos } = await request<{ videos: Video[] }>("/api/videos");
    return videos;
  },

  async uploadVideo(
    video: Blob,
    meta: { fromTakenAt: string; toTakenAt: string; photoCount: number },
  ): Promise<void> {
    const form = new FormData();
    form.append("file", video, "timelapse.mp4");
    form.append("fromTakenAt", meta.fromTakenAt);
    form.append("toTakenAt", meta.toTakenAt);
    form.append("photoCount", String(meta.photoCount));
    await request("/api/videos", { method: "POST", body: form });
  },

  async deleteVideo(id: string): Promise<void> {
    await request(`/api/videos/${id}`, { method: "DELETE" });
  },

  async status(): Promise<Status> {
    return request<Status>("/api/status");
  },
};
