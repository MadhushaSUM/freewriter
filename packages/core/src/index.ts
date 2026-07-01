/**
 * @freewriter/core
 *
 * Pure TypeScript canvas-based word processor engine.
 * Zero runtime dependencies. Provides:
 * - Document data model (Document, Paragraph, TextRun)
 * - Text measurement API
 * - Canvas rendering engine with DPR scaling
 */

// ─── Data Model ────────────────────────────────────────────────────
export type {
  TextStyle,
  FontWeight,
  FontStyle,
  TextDecoration,
  TextRun,
  Paragraph,
  ParagraphAlignment,
  PageSettings,
  FreewriterDocument,
} from "./model/index.js";

export {
  DEFAULT_TEXT_STYLE,
  DEFAULT_PARAGRAPH_PROPS,
  DEFAULT_PAGE_SETTINGS,
} from "./model/index.js";

// ─── Measurement ───────────────────────────────────────────────────
export {TextMeasurer, buildFontString, resolveStyle} from "./measurement/index.js";
export type {TextMeasurement} from "./measurement/index.js";

// ─── Renderer ──────────────────────────────────────────────────────
export {CanvasRenderer} from "./renderer/index.js";
export type {RendererConfig} from "./renderer/index.js";
