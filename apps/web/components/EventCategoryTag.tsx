import type { PresetCategory } from "../lib/presetGroups";

interface EventCategoryTagProps {
  category: PresetCategory;
  label: string;
  className?: string;
}

export function EventCategoryTag({ category, label, className = "" }: EventCategoryTagProps) {
  return (
    <span className={`event-category-tag${className ? ` ${className}` : ""}`} data-category={category}>
      {label}
    </span>
  );
}
