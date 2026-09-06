import type { SourceSpan, UnparsedFragment } from './types';

/**
 * Text primitives for the deterministic shorthand parser.
 * Two contract obligations live here, and both are easy to violate by writing the obvious
 * thing:
 *
 * 1. **`source_span` is measured in Unicode code points** (`API_CONTRACTS.md` §5.1; D-023).
 *    JavaScript's native string indexing — `length`, `slice`, `substring`, `charAt`,
 *    `indexOf` — counts UTF-16 code units, which agree with code points only for text
 *    entirely inside the Basic Multilingual Plane. Using them would produce spans that look
 *    right in every ASCII test and are wrong for the first emoji or rare CJK character the
 *    OCR emits. So the parser converts the input to a code-point array once and indexes that
 *    array everywhere; the only bridge back is `utf16ToCodePointIndex`, used where a
 *    `RegExp` reports a UTF-16 offset.
 *
 * 2. **Token-boundary checking is edge validation, never tokenisation**
 *    (`SHORTHAND_DICTIONARY.md` §4; D-029). `hasTokenBoundaries` looks only at the code
 *    points immediately *outside* a candidate. It must never be replaced by splitting the
 *    input on the boundary set: `.` is a boundary character, and splitting on it would tear
 *    `2.5 mg` into `2` and `5 mg` under `STR-MASS-001` (§7.7).
 *
 * Nothing here logs (SI-16) and nothing here mutates its arguments.
 */

/**
 * Boundary characters other than whitespace and the string ends (dictionary §4, D-029).
 *
 * `/` is **deliberately absent**: duration forms such as `5/7` and the ophthalmic signal
 * `e/d` contain it legitimately, and a rule that needs it declares it in its own pattern.
 * `.` is present so that a terminal sentence period delimits rather than defeats a token —
 * `Give 1 tab BD.` must match `BD` (dictionary §4, §11 case 21; `API_CONTRACTS.md` §12.5).
 * A dotted declared form such as `B.D.` is unaffected, because a candidate is matched whole
 * and this set is only ever consulted for the code points outside it.
 */
const BOUNDARY_CHARACTERS: ReadonlySet<string> = new Set([
  ',',
  ';',
  ':',
  '(',
  ')',
  '[',
  ']',
  '|',
  '.',
]);

/**
 * Splits text into Unicode code points. `Array.from` iterates a string by code point, so a
 * surrogate pair becomes one element — which is exactly the unit `source_span` is defined in.
 */
export function toCodePoints(text: string): string[] {
  return Array.from(text);
}

/**
 * Reads back the text a `[start, end)` code-point span covers. The half-open interval is the
 * contract's (`API_CONTRACTS.md` §5.1), and this is the function that makes `matched_literal`
 * and `source_span` agree by construction rather than by coincidence.
 */
export function sliceByCodePoints(codePoints: readonly string[], start: number, end: number): string {
  return codePoints.slice(start, end).join('');
}

/**
 * Converts a UTF-16 code-unit offset — what `RegExp` match indices are — into a code-point
 * offset. Counting the code points in the preceding text is the definition, not an
 * approximation: for all-BMP text the two numbers coincide, which is precisely why the
 * conversion has to be explicit instead of assumed.
 */
export function utf16ToCodePointIndex(text: string, utf16Index: number): number {
  return Array.from(text.slice(0, utf16Index)).length;
}

/**
 * ASCII-only, locale-invariant case folding (`API_CONTRACTS.md` §4.5, §12.4; dictionary §4
 * normalization 1, subject to OQ-11).
 *
 * `String.prototype.toLowerCase` would fold non-ASCII characters too, and some of those folds
 * land on ASCII letters — Turkish dotless `I` and the Kelvin sign both lower-case into the
 * ASCII range — which could manufacture a match out of text no rule declares. Every
 * `match_forms` entry in the dictionary is ASCII, so folding only `A`–`Z` is sufficient and
 * strictly more conservative. `toLocaleLowerCase` is not used at all: its result depends on
 * ambient locale, which would make the same prescription parse differently on two machines.
 */
export function foldAsciiCase(text: string): string {
  let folded = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    folded += code >= 0x41 && code <= 0x5a ? String.fromCodePoint(code + 0x20) : character;
  }
  return folded;
}

/** Whitespace or a member of the boundary set — the delimiters dictionary §4 permits. */
function isBoundaryCharacter(codePoint: string): boolean {
  return /\s/u.test(codePoint) || BOUNDARY_CHARACTERS.has(codePoint);
}

/**
 * Whether the candidate occupying `[start, end)` is delimited on both sides, per dictionary
 * §4. Start and end of string count as boundaries.
 *
 * This is the whole of the substring defence: `BDS` fails here because `S` follows the
 * candidate `BD`, and `50 mcg` cannot yield a bare `g` because `c` precedes it. Edge
 * validation only — the candidate's own contents are never inspected, which is what keeps
 * `.` in the boundary set from breaking `2.5 mg` or `B.D.`.
 */
export function hasTokenBoundaries(
  codePoints: readonly string[],
  start: number,
  end: number,
): boolean {
  const before = start === 0 ? undefined : codePoints[start - 1];
  const after = end === codePoints.length ? undefined : codePoints[end];

  const leftIsBoundary = before === undefined || isBoundaryCharacter(before);
  const rightIsBoundary = after === undefined || isBoundaryCharacter(after);

  return leftIsBoundary && rightIsBoundary;
}

/**
 * Extracts unparsed non-whitespace text fragments that are not covered by any matched rule span.
 * Preserves Unicode code-point source spans and byte-for-byte source text (dictionary §10, SI-06).
 */
export function extractUnparsedFragments(
  codePoints: readonly string[],
  matches: readonly { source_span: SourceSpan }[],
): UnparsedFragment[] {
  const length = codePoints.length;
  if (length === 0) {
    return [];
  }

  const matched = new Array<boolean>(length).fill(false);
  for (const match of matches) {
    const start = Math.max(0, match.source_span.start);
    const end = Math.min(length, match.source_span.end);
    for (let i = start; i < end; i++) {
      matched[i] = true;
    }
  }

  const fragments: UnparsedFragment[] = [];
  let i = 0;
  while (i < length) {
    if (matched[i]) {
      i++;
      continue;
    }

    let start = i;
    while (i < length && !matched[i]) {
      i++;
    }
    let end = i;

    // Trim leading whitespace in [start, end)
    while (start < end && /\s/u.test(codePoints[start]!)) {
      start++;
    }
    // Trim trailing whitespace in [start, end)
    while (end > start && /\s/u.test(codePoints[end - 1]!)) {
      end--;
    }

    if (start < end) {
      fragments.push({
        text: sliceByCodePoints(codePoints, start, end),
        source_span: { start, end },
      });
    }
  }

  return fragments;
}
