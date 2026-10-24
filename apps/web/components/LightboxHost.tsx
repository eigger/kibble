"use client";

import { useLocale } from "../lib/i18n/locale-context";
import { AttachmentLightbox, type LightboxTarget } from "./AttachmentLightbox";

/** 라이트박스 상태(target)를 가진 쪽이 렌더하면 라벨·연결을 한 곳에서 맡는다. */
export function LightboxHost({
  target,
  onChange,
}: {
  target: LightboxTarget | null;
  onChange: (next: LightboxTarget | null) => void;
}) {
  const { t } = useLocale();
  if (!target) return null;
  return (
    <AttachmentLightbox
      items={target.items}
      index={target.index}
      onIndexChange={(index) => onChange({ ...target, index })}
      onClose={() => onChange(null)}
      closeLabel={t("close")}
      dialogLabel={`${t("lightboxView")} ${target.index + 1}/${target.items.length}`}
      resetLabel={t("lightboxResetZoom")}
      prevLabel={t("lightboxPrev")}
      nextLabel={t("lightboxNext")}
    />
  );
}
