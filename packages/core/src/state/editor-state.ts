/**
 * @freewriter/core — Editor State
 *
 * The central state container for the editor. Wraps the FreewriterDocument
 * with cursor position and selection range, and exposes mutation methods
 * that produce immutable updates.
 *
 * Implements the Mediator pattern — it mediates between input handlers,
 * the document model, and the renderer. None of those subsystems know
 * about each other directly; they communicate through EditorState events.
 *
 * Emits events via the Observer pattern so the renderer and React wrapper
 * can react to state changes without tight coupling.
 */

import type {FreewriterDocument} from "../model/document.js";

import {EventEmitter} from "./event-emitter.js";
import type {DocumentPosition, SelectionRange} from "./document-mutator.js";
import {
  deleteCharBackward,
  deleteCharForward,
  deleteRange,
  getParagraphTextLength,
  getTextInRange,
  insertTextAt,
  normalizeRange,
  splitParagraphAt,
} from "./document-mutator.js";

// ─── Event Types ─────────────────────────────────────────────────────

/** Events emitted by EditorState */
export interface EditorStateEvents {
  /** The document content has changed */
  "document-change": { document: FreewriterDocument };
  /** The cursor position has changed */
  "cursor-change": { cursor: DocumentPosition };
  /** The selection range has changed (null = no selection) */
  "selection-change": { selection: SelectionRange | null };
  /** A re-render has been requested */
  "render-request": undefined;
}

// ─── Snapshot ────────────────────────────────────────────────────────

/** An immutable snapshot of the full editor state */
export interface EditorStateSnapshot {
  document: FreewriterDocument;
  cursor: DocumentPosition;
  selection: SelectionRange | null;
}

// ─── Editor State ────────────────────────────────────────────────────

export class EditorState {
  private _document: FreewriterDocument;
  private _cursor: DocumentPosition;
  private _selection: SelectionRange | null;

  /**
   * The preferred X coordinate when navigating up/down.
   * Reset on horizontal movement, preserved on vertical movement.
   */
  private _preferredX: number | null = null;

  /** Event emitter for state change notifications */
  readonly events: EventEmitter<EditorStateEvents>;

  constructor(document: FreewriterDocument) {
    this._document = document;
    this._cursor = {paragraphIndex: 0, charOffset: 0};
    this._selection = null;
    this.events = new EventEmitter<EditorStateEvents>();
  }

  // ─── Getters ──────────────────────────────────────────────────────

  get document(): FreewriterDocument {
    return this._document;
  }

  get cursor(): DocumentPosition {
    return this._cursor;
  }

  get selection(): SelectionRange | null {
    return this._selection;
  }

  get preferredX(): number | null {
    return this._preferredX;
  }

  /** Returns a full snapshot of the current state */
  getSnapshot(): EditorStateSnapshot {
    return {
      document: this._document,
      cursor: {...this._cursor},
      selection: this._selection
        ? {
          anchor: {...this._selection.anchor},
          focus: {...this._selection.focus},
        }
        : null,
    };
  }

  // ─── Cursor ───────────────────────────────────────────────────────

  /** Sets the cursor position and clears any selection */
  setCursor(position: DocumentPosition): void {
    this._cursor = this.clampPosition(position);
    this._selection = null;
    this._preferredX = null;
    this.events.emit("cursor-change", {cursor: this._cursor});
    this.events.emit("selection-change", {selection: null});
    this.requestRender();
  }

  /** Sets the preferred X coordinate for vertical navigation */
  setPreferredX(x: number): void {
    this._preferredX = x;
  }

  /**
   * Moves the cursor in the given direction.
   * Clears selection if there is one (collapses to the appropriate edge).
   */
  moveCursor(direction: "left" | "right" | "up" | "down"): void {
    // If there's a selection, collapse it
    if (this._selection) {
      const {start, end} = normalizeRange(this._selection);
      this._selection = null;
      this.events.emit("selection-change", {selection: null});

      if (direction === "left" || direction === "up") {
        this._cursor = start;
      } else {
        this._cursor = end;
      }

      this._preferredX = null;
      this.events.emit("cursor-change", {cursor: this._cursor});
      this.requestRender();
      return;
    }

    // Move cursor
    switch (direction) {
      case "left":
        this._cursor = this.moveCursorLeft(this._cursor);
        this._preferredX = null;
        break;
      case "right":
        this._cursor = this.moveCursorRight(this._cursor);
        this._preferredX = null;
        break;
      case "up":
      case "down":
        // Up/Down handled by the editor orchestrator using LayoutIndex
        // (needs pixel coordinates). This is a fallback for direct calls.
        break;
    }

    this.events.emit("cursor-change", {cursor: this._cursor});
    this.requestRender();
  }

  /** Moves cursor one position left, crossing paragraph boundaries */
  private moveCursorLeft(pos: DocumentPosition): DocumentPosition {
    if (pos.charOffset > 0) {
      return {paragraphIndex: pos.paragraphIndex, charOffset: pos.charOffset - 1};
    }
    if (pos.paragraphIndex > 0) {
      const prevParagraph = this._document.paragraphs[pos.paragraphIndex - 1];
      if (!prevParagraph) return pos;
      return {
        paragraphIndex: pos.paragraphIndex - 1,
        charOffset: getParagraphTextLength(prevParagraph),
      };
    }
    return pos;
  }

  /** Moves cursor one position right, crossing paragraph boundaries */
  private moveCursorRight(pos: DocumentPosition): DocumentPosition {
    const paragraph = this._document.paragraphs[pos.paragraphIndex];
    if (!paragraph) return pos;

    const paraLength = getParagraphTextLength(paragraph);
    if (pos.charOffset < paraLength) {
      return {paragraphIndex: pos.paragraphIndex, charOffset: pos.charOffset + 1};
    }
    if (pos.paragraphIndex < this._document.paragraphs.length - 1) {
      return {paragraphIndex: pos.paragraphIndex + 1, charOffset: 0};
    }
    return pos;
  }

  // ─── Selection ────────────────────────────────────────────────────

  /** Sets the selection range */
  setSelection(range: SelectionRange | null): void {
    this._selection = range;
    if (range) {
      this._cursor = range.focus;
    }
    this.events.emit("selection-change", {selection: this._selection});
    this.events.emit("cursor-change", {cursor: this._cursor});
    this.requestRender();
  }

  /**
   * Extends the current selection in the given direction.
   * If no selection exists, starts one from the current cursor position.
   */
  extendSelection(direction: "left" | "right"): void {
    const anchor = this._selection
      ? this._selection.anchor
      : {...this._cursor};

    let newFocus: DocumentPosition;
    if (direction === "left") {
      newFocus = this.moveCursorLeft(this._cursor);
    } else {
      newFocus = this.moveCursorRight(this._cursor);
    }

    // If anchor === focus, clear selection
    if (
      newFocus.paragraphIndex === anchor.paragraphIndex &&
      newFocus.charOffset === anchor.charOffset
    ) {
      this._selection = null;
      this._cursor = newFocus;
    } else {
      this._selection = {anchor, focus: newFocus};
      this._cursor = newFocus;
    }

    this._preferredX = null;
    this.events.emit("cursor-change", {cursor: this._cursor});
    this.events.emit("selection-change", {selection: this._selection});
    this.requestRender();
  }

  /** Extends selection to a specific position (used by vertical navigation and mouse drag) */
  extendSelectionTo(position: DocumentPosition): void {
    const anchor = this._selection
      ? this._selection.anchor
      : {...this._cursor};

    const clampedPos = this.clampPosition(position);

    if (
      clampedPos.paragraphIndex === anchor.paragraphIndex &&
      clampedPos.charOffset === anchor.charOffset
    ) {
      this._selection = null;
      this._cursor = clampedPos;
    } else {
      this._selection = {anchor, focus: clampedPos};
      this._cursor = clampedPos;
    }

    this.events.emit("cursor-change", {cursor: this._cursor});
    this.events.emit("selection-change", {selection: this._selection});
    this.requestRender();
  }

  /** Select the entire document */
  selectAll(): void {
    const lastParagraph =
      this._document.paragraphs[this._document.paragraphs.length - 1];
    if (!lastParagraph) return;

    const anchor: DocumentPosition = {paragraphIndex: 0, charOffset: 0};
    const focus: DocumentPosition = {
      paragraphIndex: this._document.paragraphs.length - 1,
      charOffset: getParagraphTextLength(lastParagraph),
    };

    this._selection = {anchor, focus};
    this._cursor = focus;
    this.events.emit("cursor-change", {cursor: this._cursor});
    this.events.emit("selection-change", {selection: this._selection});
    this.requestRender();
  }

  /** Returns true if there is an active selection */
  hasSelection(): boolean {
    return this._selection !== null;
  }

  /** Returns the selected text content as a plain string */
  getSelectedText(): string {
    if (!this._selection) return "";
    return getTextInRange(this._document, this._selection);
  }

  // ─── Mutations ────────────────────────────────────────────────────

  /** Insert text at the current cursor position (or replace selection) */
  insertText(text: string): void {
    // Delete selection first if there is one
    if (this._selection) {
      const result = deleteRange(this._document, this._selection);
      this._document = result.document;
      this._cursor = result.newPosition;
      this._selection = null;
    }

    const result = insertTextAt(this._document, this._cursor, text);
    this._document = result.document;
    this._cursor = result.newPosition;
    this._preferredX = null;

    this.events.emit("document-change", {document: this._document});
    this.events.emit("cursor-change", {cursor: this._cursor});
    this.events.emit("selection-change", {selection: null});
    this.requestRender();
  }

  /** Delete backward (Backspace) */
  deleteBackward(): void {
    if (this._selection) {
      const result = deleteRange(this._document, this._selection);
      this._document = result.document;
      this._cursor = result.newPosition;
      this._selection = null;
    } else {
      const result = deleteCharBackward(this._document, this._cursor);
      this._document = result.document;
      this._cursor = result.newPosition;
    }

    this._preferredX = null;
    this.events.emit("document-change", {document: this._document});
    this.events.emit("cursor-change", {cursor: this._cursor});
    this.events.emit("selection-change", {selection: null});
    this.requestRender();
  }

  /** Delete forward (Delete key) */
  deleteForward(): void {
    if (this._selection) {
      const result = deleteRange(this._document, this._selection);
      this._document = result.document;
      this._cursor = result.newPosition;
      this._selection = null;
    } else {
      const result = deleteCharForward(this._document, this._cursor);
      this._document = result.document;
      this._cursor = result.newPosition;
    }

    this._preferredX = null;
    this.events.emit("document-change", {document: this._document});
    this.events.emit("cursor-change", {cursor: this._cursor});
    this.events.emit("selection-change", {selection: null});
    this.requestRender();
  }

  /** Insert a paragraph break (Enter) */
  insertParagraphBreak(): void {
    if (this._selection) {
      const result = deleteRange(this._document, this._selection);
      this._document = result.document;
      this._cursor = result.newPosition;
      this._selection = null;
    }

    const result = splitParagraphAt(this._document, this._cursor);
    this._document = result.document;
    this._cursor = result.newPosition;
    this._preferredX = null;

    this.events.emit("document-change", {document: this._document});
    this.events.emit("cursor-change", {cursor: this._cursor});
    this.events.emit("selection-change", {selection: null});
    this.requestRender();
  }

  /** Replace the entire document (e.g., from external source) */
  setDocument(doc: FreewriterDocument): void {
    this._document = doc;
    this._cursor = this.clampPosition(this._cursor);
    this._selection = null;
    this._preferredX = null;

    this.events.emit("document-change", {document: this._document});
    this.events.emit("cursor-change", {cursor: this._cursor});
    this.events.emit("selection-change", {selection: null});
    this.requestRender();
  }

  // ─── Internal ─────────────────────────────────────────────────────

  /** Request a re-render from the orchestrator */
  private requestRender(): void {
    this.events.emit("render-request", undefined);
  }

  /** Clamps a position to valid document bounds */
  private clampPosition(pos: DocumentPosition): DocumentPosition {
    const paragraphIndex = Math.max(
      0,
      Math.min(pos.paragraphIndex, this._document.paragraphs.length - 1)
    );
    const paragraph = this._document.paragraphs[paragraphIndex];
    if (!paragraph) return {paragraphIndex: 0, charOffset: 0};

    const charOffset = Math.max(
      0,
      Math.min(pos.charOffset, getParagraphTextLength(paragraph))
    );
    return {paragraphIndex, charOffset};
  }
}
