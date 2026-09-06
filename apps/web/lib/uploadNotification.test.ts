import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  dismissUploadNotification,
  requestUploadNotificationPermission,
  showUploadCompleteNotification,
  showUploadFailedNotification,
  showUploadProgressNotification,
} from "./uploadNotification";

describe("uploadNotification", () => {
  let showNotificationMock: ReturnType<typeof vi.fn>;
  let getNotificationsMock: ReturnType<typeof vi.fn>;
  let closeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    closeMock = vi.fn();
    showNotificationMock = vi.fn().mockResolvedValue(undefined);
    getNotificationsMock = vi.fn().mockResolvedValue([{ close: closeMock }]);

    Object.defineProperty(globalThis, "Notification", {
      writable: true,
      value: {
        permission: "granted",
        requestPermission: vi.fn().mockResolvedValue("granted"),
      },
    });

    Object.defineProperty(globalThis.navigator, "serviceWorker", {
      writable: true,
      value: {
        ready: Promise.resolve({
          showNotification: showNotificationMock,
          getNotifications: getNotificationsMock,
        }),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("requests permission when permission is default", async () => {
    (Notification as unknown as { permission: string }).permission = "default";
    const granted = await requestUploadNotificationPermission();
    expect(granted).toBe(true);
    expect(Notification.requestPermission).toHaveBeenCalled();
  });

  it("skips requesting permission when already granted", async () => {
    (Notification as unknown as { permission: string }).permission = "granted";
    const granted = await requestUploadNotificationPermission();
    expect(granted).toBe(true);
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("shows progress notification and throttles rapid updates", async () => {
    await showUploadProgressNotification({
      fileIndex: 0,
      fileCount: 2,
      loaded: 50,
      total: 100,
      force: true,
    });

    expect(showNotificationMock).toHaveBeenCalledOnce();
    expect(showNotificationMock).toHaveBeenCalledWith(
      "Kibble",
      expect.objectContaining({
        tag: "kibble-upload",
        body: "사진 1/2장 올리는 중... (50%)",
        icon: expect.stringContaining("icon-192.png"),
        badge: expect.stringContaining("badge-96.png"),
        silent: true,
      }),
    );

    // Immediate second call on same file should be throttled
    await showUploadProgressNotification({
      fileIndex: 0,
      fileCount: 2,
      loaded: 60,
      total: 100,
    });
    expect(showNotificationMock).toHaveBeenCalledOnce();

    // After 600ms, should allow next call
    vi.advanceTimersByTime(600);
    await showUploadProgressNotification({
      fileIndex: 0,
      fileCount: 2,
      loaded: 70,
      total: 100,
    });
    expect(showNotificationMock).toHaveBeenCalledTimes(2);

    // File change should bypass throttle
    await showUploadProgressNotification({
      fileIndex: 1,
      fileCount: 2,
      loaded: 10,
      total: 100,
    });
    expect(showNotificationMock).toHaveBeenCalledTimes(3);
    expect(showNotificationMock).toHaveBeenLastCalledWith(
      "Kibble",
      expect.objectContaining({
        body: "사진 2/2장 올리는 중... (10%)",
      }),
    );
  });

  it("shows complete notification and auto-closes after delay", async () => {
    await showUploadCompleteNotification(2);

    expect(showNotificationMock).toHaveBeenCalledWith(
      "Kibble",
      expect.objectContaining({
        tag: "kibble-upload",
        body: "사진 2장 업로드 완료",
        silent: true,
      }),
    );

    expect(closeMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4000);
    expect(getNotificationsMock).toHaveBeenCalledWith({ tag: "kibble-upload" });
    expect(closeMock).toHaveBeenCalled();
  });

  it("shows failure notification", async () => {
    await showUploadFailedNotification(1);

    expect(showNotificationMock).toHaveBeenCalledWith(
      "Kibble",
      expect.objectContaining({
        tag: "kibble-upload",
        body: "사진 1장 업로드 실패. 다시 시도해 주세요.",
        silent: false,
      }),
    );
  });

  it("includes cancel action and deep link URL in progress notification", async () => {
    await showUploadProgressNotification({
      fileIndex: 0,
      fileCount: 1,
      force: true,
      eventId: "evt-123",
      jobId: "job-abc",
    });

    expect(showNotificationMock).toHaveBeenCalledWith(
      "Kibble",
      expect.objectContaining({
        actions: [{ action: "cancel", title: "취소" }],
        data: expect.objectContaining({
          url: expect.stringContaining("/history/?highlight=evt-123"),
          eventId: "evt-123",
          jobId: "job-abc",
        }),
      }),
    );
  });

  it("includes deep link in complete notification", async () => {
    await showUploadCompleteNotification(3, "evt-456");
    expect(showNotificationMock).toHaveBeenCalledWith(
      "Kibble",
      expect.objectContaining({
        data: expect.objectContaining({
          url: expect.stringContaining("/history/?highlight=evt-456"),
          eventId: "evt-456",
        }),
      }),
    );
  });

  it("includes deep link in failure notification", async () => {
    await showUploadFailedNotification(2, "evt-789");
    expect(showNotificationMock).toHaveBeenCalledWith(
      "Kibble",
      expect.objectContaining({
        data: expect.objectContaining({
          url: expect.stringContaining("/history/?highlight=evt-789"),
          eventId: "evt-789",
        }),
      }),
    );
  });

  it("translates notification strings to English when locale is en", async () => {
    localStorage.setItem("kibble_locale", "en");

    await showUploadProgressNotification({
      fileIndex: 0,
      fileCount: 2,
      loaded: 40,
      total: 100,
      force: true,
    });

    expect(showNotificationMock).toHaveBeenCalledWith(
      "Kibble",
      expect.objectContaining({
        body: "Uploading 1/2... (40%)",
        actions: [{ action: "cancel", title: "Cancel" }],
      }),
    );

    await showUploadCompleteNotification(2);
    expect(showNotificationMock).toHaveBeenCalledWith(
      "Kibble",
      expect.objectContaining({
        body: "2 photos uploaded",
      }),
    );

    await showUploadFailedNotification(1);
    expect(showNotificationMock).toHaveBeenCalledWith(
      "Kibble",
      expect.objectContaining({
        body: "Upload failed (1 files). Please try again.",
      }),
    );

    localStorage.removeItem("kibble_locale");
  });

  it("dismisses active upload notification", async () => {
    await dismissUploadNotification();
    expect(getNotificationsMock).toHaveBeenCalledWith({ tag: "kibble-upload" });
    expect(closeMock).toHaveBeenCalled();
  });
});
