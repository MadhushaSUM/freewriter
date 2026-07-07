/**
 * @freewriter/core — Document Mutator
 *
 * Pure functions for document mutations. Each function takes a document
 * and a position, and returns a new document with the mutation applied
 * plus the resulting cursor position.
 *
 * Follows the Single Responsibility Principle: mutation logic is fully
 * isolated from state management (EditorState) and rendering.
 *
 * All functions are immutable — they create new arrays/objects for
 * affected paragraphs and runs, enabling future undo/redo support
 * (Phase 4) and efficient React reconciliation.
 */

import type {
  FreewriterDocument,
  Paragraph,
  TextRun,
  TextStyle,
} from "../model/document.js";
import {DEFAULT_PARAGRAPH_PROPS} from "../model/document.js";

// ─── Types ───────────────────────────────────────────────────────────

/** A position in the document: paragraph index + character offset */
export interface DocumentPosition {
  /** Zero-based index of the paragraph */
  paragraphIndex: number;
  /** Zero-based character offset within the paragraph's flattened text */
  charOffset: number;
}

/** A selection range defined by an anchor (start) and focus (current end) */
export interface SelectionRange {
  /** Where the user started selecting */
  anchor: DocumentPosition;
  /** Where the selection currently ends (may be before or after anchor) */
  focus: DocumentPosition;
}

/** Result of a mutation operation: a new document and the new cursor position */
export interface MutationResult {
  document: FreewriterDocument;
  newPosition: DocumentPosition;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Returns the total text length of a paragraph (sum of all run text lengths).
 */
export function getParagraphTextLength(paragraph: Paragraph): number {
  let length = 0;
  for (const run of paragraph.runs) {
    length += run.text.length;
  }
  return length;
}

/**
 * Flattens all runs in a paragraph into a single string.
 */
export function getParagraphText(paragraph: Paragraph): string {
  return paragraph.runs.map((r) => r.text).join("");
}

/**
 * Normalizes a selection range so that `start` is always before `end`.
 */
export function normalizeRange(range: SelectionRange): {
  start: DocumentPosition;
  end: DocumentPosition;
} {
  const {anchor, focus} = range;

  if (
    anchor.paragraphIndex < focus.paragraphIndex ||
    (anchor.paragraphIndex === focus.paragraphIndex &&
      anchor.charOffset <= focus.charOffset)
  ) {
    return {start: anchor, end: focus};
  }

  return {start: focus, end: anchor};
}

/**
 * Finds which run a character offset falls into, and the offset within that run.
 * Returns the run index and the local character offset.
 */
function findRunAtOffset(
  runs: TextRun[],
  charOffset: number
): { runIndex: number; localOffset: number } {
  let accumulated = 0;

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]!;
    if (charOffset <= accumulated + run.text.length) {
      return {runIndex: i, localOffset: charOffset - accumulated};
    }
    accumulated += run.text.length;
  }

  // Clamp to end of last run
  const lastIndex = runs.length - 1;
  return {
    runIndex: lastIndex,
    localOffset: runs[lastIndex]?.text.length ?? 0,
  };
}

/**
 * Resolves the effective style at a given character offset in a paragraph.
 * Used to determine what style new text should inherit.
 */
export function getStyleAtOffset(
  paragraph: Paragraph,
  charOffset: number
): Partial<TextStyle> | undefined {
  const {runIndex, localOffset} = findRunAtOffset(paragraph.runs, charOffset);
  const run = paragraph.runs[runIndex];

  // If at the beginning of a run (and not the first run), prefer the
  // previous run's style (typing continues the preceding style).
  if (localOffset === 0 && runIndex > 0) {
    return paragraph.runs[runIndex - 1]?.style;
  }

  return run?.style;
}

/**
 * Cleans up empty runs and merges adjacent runs with identical styles.
 */
function consolidateRuns(runs: TextRun[]): TextRun[] {
  // Remove empty runs
  const nonEmpty = runs.filter((r) => r.text.length > 0);
  if (nonEmpty.length === 0) {
    return [{text: ""}];
  }

  // Merge adjacent runs with the same style
  const merged: TextRun[] = [nonEmpty[0]!];

  for (let i = 1; i < nonEmpty.length; i++) {
    const prev = merged[merged.length - 1]!;
    const curr = nonEmpty[i]!;

    if (stylesEqual(prev.style, curr.style)) {
      merged[merged.length - 1] = {
        text: prev.text + curr.text,
        style: prev.style,
      };
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

/**
 * Shallow comparison of two partial TextStyle objects.
 */
function stylesEqual(
  a?: Partial<TextStyle>,
  b?: Partial<TextStyle>
): boolean {
  if (a === b) return true;
  if (!a && !b) return true;
  if (!a || !b) return false;

  return (
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.fontWeight === b.fontWeight &&
    a.fontStyle === b.fontStyle &&
    a.color === b.color &&
    a.textDecoration === b.textDecoration &&
    a.letterSpacing === b.letterSpacing
  );
}

/**
 * Splits a paragraph's runs at a given character offset.
 * Returns [runsBefore, runsAfter].
 */
function splitRunsAtOffset(
  runs: TextRun[],
  charOffset: number
): [TextRun[], TextRun[]] {
  const {runIndex, localOffset} = findRunAtOffset(runs, charOffset);
  const run = runs[runIndex];

  if (!run) {
    return [[...runs], [{text: ""}]];
  }

  const before: TextRun[] = runs.slice(0, runIndex);
  const after: TextRun[] = runs.slice(runIndex + 1);

  if (localOffset === 0) {
    // Split is at the start of this run — entire run goes to 'after'
    return [
      consolidateRuns(before),
      consolidateRuns([run, ...after]),
    ];
  }

  if (localOffset === run.text.length) {
    // Split is at the end of this run — entire run goes to 'before'
    return [
      consolidateRuns([...before, run]),
      consolidateRuns(after.length > 0 ? after : [{text: "", style: run.style}]),
    ];
  }

  // Split is mid-run
  const leftPart: TextRun = {
    text: run.text.slice(0, localOffset),
    style: run.style,
  };
  const rightPart: TextRun = {
    text: run.text.slice(localOffset),
    style: run.style,
  };

  return [
    consolidateRuns([...before, leftPart]),
    consolidateRuns([rightPart, ...after]),
  ];
}

// ─── Mutation Functions ──────────────────────────────────────────────

/**
 * Inserts text at the given position.
 * The inserted text inherits the style of the character at the cursor.
 */
export function insertTextAt(
  doc: FreewriterDocument,
  position: DocumentPosition,
  text: string
): MutationResult {
  const {paragraphIndex, charOffset} = position;
  const paragraph = doc.paragraphs[paragraphIndex];

  if (!paragraph) {
    return {document: doc, newPosition: position};
  }

  const {runIndex, localOffset} = findRunAtOffset(
    paragraph.runs,
    charOffset
  );
  const run = paragraph.runs[runIndex];

  if (!run) {
    return {document: doc, newPosition: position};
  }

  // Create new run with text inserted
  const newRunText =
    run.text.slice(0, localOffset) + text + run.text.slice(localOffset);
  const newRun: TextRun = {text: newRunText, style: run.style};

  // Build new runs array
  const newRuns = [...paragraph.runs];
  newRuns[runIndex] = newRun;

  // Build new paragraph
  const newParagraph: Paragraph = {
    ...paragraph,
    runs: consolidateRuns(newRuns),
  };

  // Build new document
  const newParagraphs = [...doc.paragraphs];
  newParagraphs[paragraphIndex] = newParagraph;

  return {
    document: {...doc, paragraphs: newParagraphs},
    newPosition: {
      paragraphIndex,
      charOffset: charOffset + text.length,
    },
  };
}

/**
 * Deletes a single character backward (Backspace behavior).
 * If at the start of a paragraph (offset 0), merges with the previous paragraph.
 */
export function deleteCharBackward(
  doc: FreewriterDocument,
  position: DocumentPosition
): MutationResult {
  const {paragraphIndex, charOffset} = position;

  // At the very start of the document — nothing to delete
  if (paragraphIndex === 0 && charOffset === 0) {
    return {document: doc, newPosition: position};
  }

  // At the start of a paragraph — merge with previous
  if (charOffset === 0) {
    return mergeParagraphWithPrevious(doc, paragraphIndex);
  }

  // Delete a character within the paragraph
  const paragraph = doc.paragraphs[paragraphIndex];
  if (!paragraph) {
    return {document: doc, newPosition: position};
  }

  const {runIndex, localOffset} = findRunAtOffset(
    paragraph.runs,
    charOffset
  );
  const run = paragraph.runs[runIndex];

  if (!run) {
    return {document: doc, newPosition: position};
  }

  // If deleting at the start of a run, we need to delete from the previous run
  if (localOffset === 0 && runIndex > 0) {
    const prevRun = paragraph.runs[runIndex - 1]!;
    const newPrevRun: TextRun = {
      text: prevRun.text.slice(0, -1),
      style: prevRun.style,
    };

    const newRuns = [...paragraph.runs];
    newRuns[runIndex - 1] = newPrevRun;

    const newParagraph: Paragraph = {
      ...paragraph,
      runs: consolidateRuns(newRuns),
    };

    const newParagraphs = [...doc.paragraphs];
    newParagraphs[paragraphIndex] = newParagraph;

    return {
      document: {...doc, paragraphs: newParagraphs},
      newPosition: {paragraphIndex, charOffset: charOffset - 1},
    };
  }

  // Delete within a run
  const newRunText =
    run.text.slice(0, localOffset - 1) + run.text.slice(localOffset);
  const newRun: TextRun = {text: newRunText, style: run.style};

  const newRuns = [...paragraph.runs];
  newRuns[runIndex] = newRun;

  const newParagraph: Paragraph = {
    ...paragraph,
    runs: consolidateRuns(newRuns),
  };

  const newParagraphs = [...doc.paragraphs];
  newParagraphs[paragraphIndex] = newParagraph;

  return {
    document: {...doc, paragraphs: newParagraphs},
    newPosition: {paragraphIndex, charOffset: charOffset - 1},
  };
}

/**
 * Deletes a single character forward (Delete key behavior).
 * If at the end of a paragraph, merges with the next paragraph.
 */
export function deleteCharForward(
  doc: FreewriterDocument,
  position: DocumentPosition
): MutationResult {
  const {paragraphIndex, charOffset} = position;
  const paragraph = doc.paragraphs[paragraphIndex];

  if (!paragraph) {
    return {document: doc, newPosition: position};
  }

  const paraLength = getParagraphTextLength(paragraph);

  // At the end of the last paragraph — nothing to delete
  if (
    paragraphIndex === doc.paragraphs.length - 1 &&
    charOffset >= paraLength
  ) {
    return {document: doc, newPosition: position};
  }

  // At the end of a paragraph — merge with next
  if (charOffset >= paraLength) {
    return mergeParagraphWithNext(doc, paragraphIndex);
  }

  // Delete a character forward = same as delete backward at offset + 1
  const nextPosition: DocumentPosition = {
    paragraphIndex,
    charOffset: charOffset + 1,
  };
  const result = deleteCharBackward(doc, nextPosition);

  // The cursor should stay at the original position
  return {
    document: result.document,
    newPosition: position,
  };
}

/**
 * Merges paragraph at `index` with the previous paragraph.
 * The cursor is placed at the end of the previous paragraph's text.
 */
function mergeParagraphWithPrevious(
  doc: FreewriterDocument,
  index: number
): MutationResult {
  if (index <= 0) {
    return {
      document: doc,
      newPosition: {paragraphIndex: 0, charOffset: 0},
    };
  }

  const prevParagraph = doc.paragraphs[index - 1]!;
  const currParagraph = doc.paragraphs[index]!;
  const prevLength = getParagraphTextLength(prevParagraph);

  // Merge runs — concatenate and consolidate
  const mergedRuns = consolidateRuns([
    ...prevParagraph.runs,
    ...currParagraph.runs,
  ]);

  const mergedParagraph: Paragraph = {
    ...prevParagraph,
    runs: mergedRuns,
  };

  const newParagraphs = [...doc.paragraphs];
  newParagraphs.splice(index - 1, 2, mergedParagraph);

  return {
    document: {...doc, paragraphs: newParagraphs},
    newPosition: {paragraphIndex: index - 1, charOffset: prevLength},
  };
}

/**
 * Merges paragraph at `index` with the next paragraph.
 * The cursor stays at the end of the current paragraph's text.
 */
function mergeParagraphWithNext(
  doc: FreewriterDocument,
  index: number
): MutationResult {
  if (index >= doc.paragraphs.length - 1) {
    return {
      document: doc,
      newPosition: {
        paragraphIndex: index,
        charOffset: getParagraphTextLength(doc.paragraphs[index]!),
      },
    };
  }

  const currParagraph = doc.paragraphs[index]!;
  const nextParagraph = doc.paragraphs[index + 1]!;
  const currLength = getParagraphTextLength(currParagraph);

  const mergedRuns = consolidateRuns([
    ...currParagraph.runs,
    ...nextParagraph.runs,
  ]);

  const mergedParagraph: Paragraph = {
    ...currParagraph,
    runs: mergedRuns,
  };

  const newParagraphs = [...doc.paragraphs];
  newParagraphs.splice(index, 2, mergedParagraph);

  return {
    document: {...doc, paragraphs: newParagraphs},
    newPosition: {paragraphIndex: index, charOffset: currLength},
  };
}

/**
 * Splits a paragraph at the given position, creating two paragraphs.
 * (Enter key behavior.)
 */
export function splitParagraphAt(
  doc: FreewriterDocument,
  position: DocumentPosition
): MutationResult {
  const {paragraphIndex, charOffset} = position;
  const paragraph = doc.paragraphs[paragraphIndex];

  if (!paragraph) {
    return {document: doc, newPosition: position};
  }

  const [runsBefore, runsAfter] = splitRunsAtOffset(
    paragraph.runs,
    charOffset
  );

  // First paragraph keeps the original paragraph formatting
  const firstParagraph: Paragraph = {
    ...paragraph,
    runs: runsBefore,
  };

  // Second paragraph inherits the default formatting
  const secondParagraph: Paragraph = {
    runs: runsAfter,
    alignment: paragraph.alignment,
    lineHeight: paragraph.lineHeight,
    spaceBefore: DEFAULT_PARAGRAPH_PROPS.spaceBefore,
    spaceAfter: paragraph.spaceAfter,
  };

  const newParagraphs = [...doc.paragraphs];
  newParagraphs.splice(paragraphIndex, 1, firstParagraph, secondParagraph);

  return {
    document: {...doc, paragraphs: newParagraphs},
    newPosition: {
      paragraphIndex: paragraphIndex + 1,
      charOffset: 0,
    },
  };
}

/**
 * Deletes all content within a selection range.
 * Returns the document with the range removed and the cursor at the start of the range.
 */
export function deleteRange(
  doc: FreewriterDocument,
  range: SelectionRange
): MutationResult {
  const {start, end} = normalizeRange(range);

  // Same position — nothing to delete
  if (
    start.paragraphIndex === end.paragraphIndex &&
    start.charOffset === end.charOffset
  ) {
    return {document: doc, newPosition: start};
  }

  // Selection within a single paragraph
  if (start.paragraphIndex === end.paragraphIndex) {
    return deleteWithinParagraph(doc, start.paragraphIndex, start.charOffset, end.charOffset);
  }

  // Selection spans multiple paragraphs
  return deleteAcrossParagraphs(doc, start, end);
}

/**
 * Deletes a range of characters within a single paragraph.
 */
function deleteWithinParagraph(
  doc: FreewriterDocument,
  paragraphIndex: number,
  startOffset: number,
  endOffset: number
): MutationResult {
  const paragraph = doc.paragraphs[paragraphIndex];
  if (!paragraph) {
    return {
      document: doc,
      newPosition: {paragraphIndex, charOffset: startOffset},
    };
  }

  // Get runs before the start offset and after the end offset
  const [runsBefore] = splitRunsAtOffset(paragraph.runs, startOffset);
  const [, runsAfter] = splitRunsAtOffset(paragraph.runs, endOffset);

  const newRuns = consolidateRuns([...runsBefore, ...runsAfter]);

  const newParagraph: Paragraph = {
    ...paragraph,
    runs: newRuns,
  };

  const newParagraphs = [...doc.paragraphs];
  newParagraphs[paragraphIndex] = newParagraph;

  return {
    document: {...doc, paragraphs: newParagraphs},
    newPosition: {paragraphIndex, charOffset: startOffset},
  };
}

/**
 * Deletes content spanning multiple paragraphs.
 * Keeps the beginning of the first paragraph and the end of the last paragraph,
 * removing everything in between.
 */
function deleteAcrossParagraphs(
  doc: FreewriterDocument,
  start: DocumentPosition,
  end: DocumentPosition
): MutationResult {
  const firstParagraph = doc.paragraphs[start.paragraphIndex]!;
  const lastParagraph = doc.paragraphs[end.paragraphIndex]!;

  // Get runs before the start offset in the first paragraph
  const [runsBefore] = splitRunsAtOffset(firstParagraph.runs, start.charOffset);

  // Get runs after the end offset in the last paragraph
  const [, runsAfter] = splitRunsAtOffset(lastParagraph.runs, end.charOffset);

  // Merge them into one paragraph
  const mergedRuns = consolidateRuns([...runsBefore, ...runsAfter]);

  const mergedParagraph: Paragraph = {
    ...firstParagraph,
    runs: mergedRuns,
  };

  // Remove all paragraphs from start to end (inclusive) and insert the merged one
  const newParagraphs = [...doc.paragraphs];
  newParagraphs.splice(
    start.paragraphIndex,
    end.paragraphIndex - start.paragraphIndex + 1,
    mergedParagraph
  );

  return {
    document: {...doc, paragraphs: newParagraphs},
    newPosition: {
      paragraphIndex: start.paragraphIndex,
      charOffset: start.charOffset,
    },
  };
}

/**
 * Extracts the plain text content of a selection range.
 */
export function getTextInRange(
  doc: FreewriterDocument,
  range: SelectionRange
): string {
  const {start, end} = normalizeRange(range);

  if (
    start.paragraphIndex === end.paragraphIndex &&
    start.charOffset === end.charOffset
  ) {
    return "";
  }

  const parts: string[] = [];

  for (let pi = start.paragraphIndex; pi <= end.paragraphIndex; pi++) {
    const paragraph = doc.paragraphs[pi];
    if (!paragraph) continue;

    const fullText = getParagraphText(paragraph);
    const paraStart = pi === start.paragraphIndex ? start.charOffset : 0;
    const paraEnd =
      pi === end.paragraphIndex ? end.charOffset : fullText.length;

    parts.push(fullText.slice(paraStart, paraEnd));
  }

  return parts.join("\n");
}
