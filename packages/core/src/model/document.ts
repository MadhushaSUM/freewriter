/**
 * @freewriter/core — Document Data Model
 *
 * Defines the primitive TypeScript interfaces for the document tree.
 * The model is intentionally simple for Phase 1 (linear array of runs).
 * It will later be backed by a Piece Table or Rope for efficient edits,
 * and the interfaces are designed to be CRDT-compatible for future
 * collaborative editing (Yjs / Automerge).
 */

// ─── Text Style ──────────────────────────────────────────────────────

/** Supported font weight values */
export type FontWeight = "normal" | "bold";

/** Supported font style values */
export type FontStyle = "normal" | "italic";

/** Supported text decoration values */
export type TextDecoration = "none" | "underline" | "line-through";

/**
 * The complete styling for a contiguous run of text.
 * Every property has a sensible default so consumers can
 * provide partial overrides via `Partial<TextStyle>`.
 */
export interface TextStyle {
  /** Font family name (must be loaded/available in the browser) */
  fontFamily: string;

  /** Font size in points (will be converted to px at render time) */
  fontSize: number;

  /** Font weight */
  fontWeight: FontWeight;

  /** Font style (normal or italic) */
  fontStyle: FontStyle;

  /** Text color as a CSS color string */
  color: string;

  /** Text decoration */
  textDecoration: TextDecoration;

  /** Letter spacing in px (0 = normal) */
  letterSpacing: number;
}

/** Default text style — used as fallback when style props are omitted */
export const DEFAULT_TEXT_STYLE: Readonly<TextStyle> = {
  fontFamily: "Inter",
  fontSize: 12,
  fontWeight: "normal",
  fontStyle: "normal",
  color: "#1a1a2e",
  textDecoration: "none",
  letterSpacing: 0,
} as const;

// ─── Text Run ────────────────────────────────────────────────────────

/**
 * A TextRun is the atomic unit of styled text.
 * It represents a contiguous sequence of characters that share
 * the exact same styling. A paragraph is composed of one or more runs.
 *
 * Example: "Hello **world**" → two runs:
 *   { text: "Hello ", style: { fontWeight: "normal" } }
 *   { text: "world",  style: { fontWeight: "bold" } }
 */
export interface TextRun {
  /** The raw text content of this run */
  text: string;

  /**
   * Style overrides for this run.
   * Missing properties inherit from `DEFAULT_TEXT_STYLE`.
   */
  style?: Partial<TextStyle>;
}

// ─── Paragraph ───────────────────────────────────────────────────────

/** Supported paragraph alignment */
export type ParagraphAlignment = "left" | "center" | "right" | "justify";

/**
 * A Paragraph is an ordered array of TextRuns that together form
 * a logical paragraph. It carries paragraph-level formatting
 * (alignment, spacing, indentation).
 */
export interface Paragraph {
  /** Ordered list of text runs composing this paragraph */
  runs: TextRun[];

  /** Horizontal text alignment */
  alignment?: ParagraphAlignment;

  /** Line height as a multiplier of font size (e.g., 1.5 = 150%) */
  lineHeight?: number;

  /** Space before this paragraph in points */
  spaceBefore?: number;

  /** Space after this paragraph in points */
  spaceAfter?: number;

  /** First-line indent in points */
  firstLineIndent?: number;
}

/** Default paragraph properties */
export const DEFAULT_PARAGRAPH_PROPS = {
  alignment: "left" as ParagraphAlignment,
  lineHeight: 1.5,
  spaceBefore: 0,
  spaceAfter: 8,
  firstLineIndent: 0,
} as const;

// ─── Page Settings ───────────────────────────────────────────────────

/**
 * Page dimensions and margins, in points (1 pt = 1/72 inch).
 * Defaults to US Letter (8.5 × 11 inches).
 */
export interface PageSettings {
  /** Page width in points */
  width: number;

  /** Page height in points */
  height: number;

  /** Top margin in points */
  marginTop: number;

  /** Bottom margin in points */
  marginBottom: number;

  /** Left margin in points */
  marginLeft: number;

  /** Right margin in points */
  marginRight: number;
}

/** Default page settings: US Letter with 1-inch margins */
export const DEFAULT_PAGE_SETTINGS: Readonly<PageSettings> = {
  width: 612, // 8.5 inches × 72 pts
  height: 792, // 11 inches × 72 pts
  marginTop: 72,
  marginBottom: 72,
  marginLeft: 72,
  marginRight: 72,
} as const;

// ─── Document ────────────────────────────────────────────────────────

/**
 * The top-level Document interface.
 * A Document is an ordered list of Paragraphs with page-level settings.
 */
export interface FreewriterDocument {
  /** Document title (metadata, not rendered in the canvas body) */
  title?: string;

  /** Ordered list of paragraphs */
  paragraphs: Paragraph[];

  /** Page layout settings */
  pageSettings?: PageSettings;

  /** Default text style for the entire document (overridable per-run) */
  defaultStyle?: Partial<TextStyle>;
}
