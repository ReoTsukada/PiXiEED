/** Deterministic string ordering for reproducible manifests and hashes. */

/** Compare strings by Unicode code-point sequence without locale state. */
export function compareCodePointStrings(left: string, right: string): number {
  if (left === right) return 0;

  const leftPoints = Array.from(
    left,
    (character) => character.codePointAt(0) ?? 0,
  );
  const rightPoints = Array.from(
    right,
    (character) => character.codePointAt(0) ?? 0,
  );
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const leftPoint = leftPoints[index];
    const rightPoint = rightPoints[index];
    if (leftPoint === undefined || rightPoint === undefined) {
      return leftPoint === rightPoint ? 0 : leftPoint === undefined ? -1 : 1;
    }
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
  }
  return leftPoints.length < rightPoints.length ? -1 : 1;
}

/** Compare strings by UTF-16 code-unit sequence without locale state. */
export function compareCodeUnitStrings(left: string, right: string): number {
  if (left === right) return 0;

  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftUnit = left.charCodeAt(index);
    const rightUnit = right.charCodeAt(index);
    if (leftUnit !== rightUnit) return leftUnit < rightUnit ? -1 : 1;
  }
  return left.length < right.length ? -1 : 1;
}

export function sortStringsByCodePoint(
  values: readonly string[],
): string[] {
  return [...values].sort(compareCodePointStrings);
}
