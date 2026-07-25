// Responsive layout classification for the Steward Console. Pure.

export type LayoutClass = "wide" | "standard" | "compact";

/** Choose a layout class from the terminal width. */
export function layoutClass(width: number): LayoutClass {
  if (width >= 120) return "wide";
  if (width >= 80) return "standard";
  return "compact";
}

/** Whether supporting panels render side by side (wide only). */
export function twoColumn(width: number): boolean {
  return layoutClass(width) === "wide";
}
