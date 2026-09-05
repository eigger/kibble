/** 포스터가 아직 없으면 목록이 원본 영상을 받지 않게. 라이트박스(controls)는 원본 재생. */
export function holdVideoThumbPlaceholder(input: {
  mime: string;
  controls?: boolean;
  posterPath?: string | null;
  transcodeStatus?: string | null;
}): boolean {
  if (!input.mime.startsWith("video/")) return false;
  if (input.controls) return false;
  if (input.posterPath) return false;
  return input.transcodeStatus === "pending" || input.transcodeStatus === "processing";
}
