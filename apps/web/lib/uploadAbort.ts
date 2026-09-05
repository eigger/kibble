/** 사용자가 전송을 그만뒀다. 네트워크 실패와 구분해 재시도하지 않는다. */
export class UploadCancelledError extends Error {
  constructor() {
    super("UPLOAD_CANCELLED");
    this.name = "UploadCancelledError";
  }
}

export function isUploadCancelled(err: unknown): boolean {
  if (err instanceof UploadCancelledError) return true;
  if (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError") {
    return true;
  }
  return err instanceof Error && (err.name === "AbortError" || err.name === "UploadCancelledError");
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new UploadCancelledError();
}
