/**
 * @freewriter/core — State Module Barrel Exports
 */

export {EventEmitter} from "./event-emitter.js";
export type {EventMap, EventHandler, Unsubscribe} from "./event-emitter.js";

export {EditorState} from "./editor-state.js";
export type {EditorStateEvents, EditorStateSnapshot} from "./editor-state.js";

export type {
  DocumentPosition,
  SelectionRange,
  MutationResult,
} from "./document-mutator.js";

export {
  insertTextAt,
  deleteCharBackward,
  deleteCharForward,
  deleteRange,
  splitParagraphAt,
  getTextInRange,
  getParagraphText,
  getParagraphTextLength,
  normalizeRange,
  getStyleAtOffset,
} from "./document-mutator.js";
