/**
 * Employee IDs are entered by people, so insignificant casing and surrounding
 * whitespace must not create a second identity (for example ` emp-42 ` and
 * `EMP-42`). Keep the original value for display and use this canonical key for
 * lookups and unique indexes.
 */
export function normalizeEmployeeId(employeeId?: string | null): string | undefined {
  if (typeof employeeId !== 'string') return undefined;
  const trimmed = employeeId.trim();
  return trimmed ? trimmed.toLocaleUpperCase('en-US') : undefined;
}

/** Escape a value before using it in an exact-match MongoDB regular expression. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
