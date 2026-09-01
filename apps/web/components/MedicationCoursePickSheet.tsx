"use client";

type CourseOption = { id: string; name: string };

type Props = {
  open: boolean;
  courses: CourseOption[];
  onClose: () => void;
  onPick: (courseId: string) => void;
  t: (key: string) => string;
};

export function MedicationCoursePickSheet({ open, courses, onClose, onPick, t }: Props) {
  if (!open) return null;

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sheet-card med-course-pick-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t("medicationPickTitle")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <h2 className="med-course-sheet-title">{t("medicationPickTitle")}</h2>
        <ul className="med-course-pick-list">
          {courses.map((course) => (
            <li key={course.id}>
              <button
                type="button"
                className="med-course-pick-item"
                onClick={() => onPick(course.id)}
              >
                {course.name}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-link chip-action-cancel" onClick={onClose}>
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
