import cron from "node-cron";

// kibble 도메인(Event 소프트삭제) 연결 전까지는 no-op. 크론 골격만 유지한다.
export async function purgeOldTrash(): Promise<void> {
  // intentionally empty
}

export function startTrashPurgeJob(): void {
  purgeOldTrash().catch((err) => console.error("[trash-purge] initial run failed", err));
  cron.schedule("0 4 * * *", () => {
    purgeOldTrash().catch((err) => console.error("[trash-purge] scheduled run failed", err));
  });
}
