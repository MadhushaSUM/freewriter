/**
 * @freewriter/core — Layout Types
 *
 * Shared layout data structures used by the renderer and layout index.
 * Extracted from canvas-renderer.ts to enable the LayoutIndex to
 * consume rendered layout results without creating circular dependencies.
 */

import type {TextStyle} from "../model/document.js";

// ─── Layout Primitives ───────────────────────────────────────────────

/** A single word token with its resolved style and measured width */
export interface StyledWord {
  text: string;
  style: TextStyle;
  width: number;
}

/** A laid-out line: an array of styled words that fit within the content width */
export interface LayoutLine {
  words: StyledWord[];
  totalWidth: number;
  ascent: number;
  descent: number;
  lineHeight: number;
  spaceBefore: number;
  spaceAfter: number;

  /** Index of the paragraph this line belongs to */
  paragraphIndex: number;

  /**
   * Whether this is the first line of its paragraph.
   * Used for first-line indent and spaceBefore application.
   */
  isFirstLineOfParagraph: boolean;

  /**
   * Whether this is the last line of its paragraph.
   * Used for spaceAfter application.
   */
  isLastLineOfParagraph: boolean;
}

/** A laid-out page containing lines and its vertical position */
export interface LayoutPage {
  lines: LayoutLine[];
  pageIndex: number;
}

// ─── Character-Level Index Entries ───────────────────────────────────

/**
 * A single entry in the layout index, mapping a document position
 * to its pixel coordinates on the canvas.
 */
export interface CharacterEntry {
  /** Paragraph index in the document */
  paragraphIndex: number;

  /** Character offset within the paragraph's flattened text */
  charOffset: number;

  /** Left edge x-coordinate in CSS pixels */
  x: number;

  /** Top edge y-coordinate in CSS pixels */
  y: number;

  /** Width of this character in CSS pixels */
  width: number;

  /** Height of the line this character sits on (line height) */
  height: number;

  /** Baseline y-coordinate in CSS pixels */
  baseline: number;

  /** Which page this character is on */
  pageIndex: number;

  /** Index of the line within the page */
  lineIndex: number;
}

/**
 * A rectangle representing a character's position on the canvas.
 * Used for caret placement and selection highlighting.
 */
export interface CharacterRect {
  /** Left edge in CSS px */
  x: number;
  /** Top edge in CSS px */
  y: number;
  /** Character width */
  width: number;
  /** Line height */
  height: number;
  /** Baseline Y position */
  baseline: number;
  /** Page this character is on */
  pageIndex: number;
}

/** Result of a hit test: which document position was clicked */
export interface HitTestResult {
  /** The document position closest to the click */
  position: {
    paragraphIndex: number;
    charOffset: number;
  };
  /** Whether the click was past the end of the line */
  isAtLineEnd: boolean;
  /** Whether the click was past the end of the paragraph */
  isAtParagraphEnd: boolean;
}
