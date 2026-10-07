import {
  CreateEventDedupeDeletedError,
  CreateEventDoseConflictError,
  CreateEventNotFoundError,
  CreateEventScopeError,
  CreateEventValidationError,
} from "../services/createEvent.js";
import type { ApiMessageKey } from "./i18n.js";

export type CreateEventErrorReply = { status: number; key: ApiMessageKey };

/** createEvent가 던지는 도메인 오류를 HTTP 상태와 i18n 키로 옮긴다. 모르는 오류는 null. */
export function mapCreateEventError(err: unknown): CreateEventErrorReply | null {
  if (err instanceof CreateEventDedupeDeletedError) return { status: 409, key: "eventDedupeDeleted" };
  if (err instanceof CreateEventScopeError) return { status: 403, key: "forbidden" };
  if (err instanceof CreateEventNotFoundError) {
    const key: ApiMessageKey =
      err.field === "pet"
        ? "petNotFound"
        : err.field === "preset"
          ? "presetNotFound"
          : err.field === "course"
            ? "medicationCourseNotFound"
            : err.field === "event"
              ? "eventNotFound"
              : "eventTypeNotFound";
    return { status: 404, key };
  }
  if (err instanceof CreateEventDoseConflictError) {
    const key: ApiMessageKey =
      err.message === "DOSE_SLOT_TAKEN" ? "medicationDoseSlotTaken" : "medicationDoseLimitReached";
    return { status: 409, key };
  }
  if (err instanceof CreateEventValidationError) {
    switch (err.message) {
      case "SCALE_VALUE_OUT_OF_RANGE":
      case "SCALE_VALUE_NOT_ALLOWED":
      case "SCALE_VALUE_INVALID":
        return { status: 400, key: "scaleValueInvalid" };
      case "PRESET_PET_MISMATCH":
        return { status: 400, key: "presetPetMismatch" };
      case "DOSE_SLOT_INVALID":
        return { status: 400, key: "medicationDoseSlotInvalid" };
      case "DOSE_SLOT_WITHOUT_COURSE":
        return { status: 400, key: "doseSlotWithoutCourse" };
      case "MEDICATION_COURSE_NOT_ALLOWED":
        return { status: 400, key: "medicationCourseNotAllowed" };
      default:
        return { status: 400, key: "eventTargetRequired" };
    }
  }
  return null;
}
