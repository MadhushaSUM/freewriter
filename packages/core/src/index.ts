/**
 * @freewriter/core
 *
 * Pure TypeScript canvas-based word processor engine.
 * Zero runtime dependencies. Provides:
 * - Document data model (Document, Paragraph, TextRun)
 * - Text measurement API
 * - Canvas rendering engine with DPR scaling
 * - Editor state management with Observer pattern (Phase 2)
 * - Coordinate mapping and hit-testing (Phase 2)
 * - Input handling via hidden textarea (Phase 2)
 * - Caret and selection rendering (Phase 2)
 * - Editor orchestrator / Facade (Phase 2)
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
export {CaretRenderer} from "./renderer/index.js";
export type {CaretStyle} from "./renderer/index.js";
export {SelectionRenderer} from "./renderer/index.js";
export type {SelectionStyle} from "./renderer/index.js";

// ─── Layout ────────────────────────────────────────────────────────
export {LayoutIndex} from "./layout/index.js";
export type {
  StyledWord,
  LayoutLine,
  LayoutPage,
  CharacterRect,
  HitTestResult,
  CharacterEntry,
} from "./layout/index.js";

// ─── State ─────────────────────────────────────────────────────────
export {EditorState} from "./state/index.js";
export type {
  EditorStateSnapshot,
  EditorStateEvents,
  DocumentPosition,
  SelectionRange,
  MutationResult,
} from "./state/index.js";
export {EventEmitter} from "./state/index.js";
export type {EventMap, EventHandler, Unsubscribe} from "./state/index.js";

// ─── Input ─────────────────────────────────────────────────────────
export {InputHandler} from "./input/index.js";
export type {InputHandlerConfig} from "./input/index.js";
export {MouseHandler} from "./input/index.js";
export type {MouseHandlerConfig} from "./input/index.js";
export {ShortcutResolver, DEFAULT_SHORTCUTS} from "./input/index.js";
export type {KeyboardAction} from "./input/index.js";

// ─── Editor (Facade) ──────────────────────────────────────────────
export {Editor} from "./editor/index.js";
export type {EditorConfig} from "./editor/index.js";
