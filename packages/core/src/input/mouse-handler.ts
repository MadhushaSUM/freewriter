/**
 * @freewriter/core — Mouse Handler
 *
 * Handles mouse events on the canvas for:
 * - Click to position the caret
 * - Click and drag to select text
 * - Double-click to select a word
 * - Triple-click to select a paragraph
 *
 * Translates pixel coordinates into document positions using the LayoutIndex,
 * then updates EditorState accordingly.
 */

import type {EditorState} from "../state/editor-state.js";
import type {LayoutIndex} from "../layout/layout-index.js";
import {getParagraphText, getParagraphTextLength} from "../state/document-mutator.js";

// ─── Configuration ───────────────────────────────────────────────────

export interface MouseHandlerConfig {
  /** The canvas element to listen for mouse events on */
  canvas: HTMLCanvasElement;

  /** The editor state to mutate */
  editorState: EditorState;

  /** The layout index for hit-testing */
  layoutIndex: LayoutIndex;

  /** Callback to focus the hidden textarea after a click */
  onCanvasClick?: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────

/** Maximum time (ms) between clicks to count as a multi-click */
const MULTI_CLICK_TIMEOUT = 400;

// ─── Mouse Handler ───────────────────────────────────────────────────

export class MouseHandler {
  private readonly canvas: HTMLCanvasElement;
  private readonly editorState: EditorState;
  private readonly layoutIndex: LayoutIndex;
  private readonly onCanvasClick: (() => void) | null;

  /** Whether a drag-select is in progress */
  private isDragging = false;

  /** Click counter for double/triple click detection */
  private clickCount = 0;

  /** Timestamp of the last mousedown event */
  private lastMouseDownTime = 0;

  /** Position of the last mousedown event */
  private lastMouseDownX = 0;
  private lastMouseDownY = 0;

  /** Bound event handlers */
  private readonly boundHandlers: {
    handleMouseDown: (e: MouseEvent) => void;
    handleMouseMove: (e: MouseEvent) => void;
    handleMouseUp: (e: MouseEvent) => void;
  };

  constructor(config: MouseHandlerConfig) {
    this.canvas = config.canvas;
    this.editorState = config.editorState;
    this.layoutIndex = config.layoutIndex;
    this.onCanvasClick = config.onCanvasClick ?? null;

    this.boundHandlers = {
      handleMouseDown: this.handleMouseDown.bind(this),
      handleMouseMove: this.handleMouseMove.bind(this),
      handleMouseUp: this.handleMouseUp.bind(this),
    };
  }

  // ─── Lifecycle ────────────────────────────────────────────────────

  mount(): void {
    this.canvas.addEventListener("mousedown", this.boundHandlers.handleMouseDown);
    // mousemove and mouseup on window to handle drags outside canvas
    window.addEventListener("mousemove", this.boundHandlers.handleMouseMove);
    window.addEventListener("mouseup", this.boundHandlers.handleMouseUp);
  }

  destroy(): void {
    this.canvas.removeEventListener(
      "mousedown",
      this.boundHandlers.handleMouseDown
    );
    window.removeEventListener(
      "mousemove",
      this.boundHandlers.handleMouseMove
    );
    window.removeEventListener("mouseup", this.boundHandlers.handleMouseUp);
  }

  // ─── Event Handlers ───────────────────────────────────────────────

  private handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return; // Only handle left click
    if (!this.layoutIndex.isBuilt) return;

    e.preventDefault(); // Prevent native text selection

    const {x, y} = this.getCanvasCoordinates(e);
    const now = Date.now();

    // Multi-click detection
    const timeDelta = now - this.lastMouseDownTime;
    const distX = Math.abs(x - this.lastMouseDownX);
    const distY = Math.abs(y - this.lastMouseDownY);

    if (timeDelta < MULTI_CLICK_TIMEOUT && distX < 5 && distY < 5) {
      this.clickCount++;
    } else {
      this.clickCount = 1;
    }

    this.lastMouseDownTime = now;
    this.lastMouseDownX = x;
    this.lastMouseDownY = y;

    // Handle based on click count
    if (this.clickCount === 3) {
      this.handleTripleClick(x, y);
    } else if (this.clickCount === 2) {
      this.handleDoubleClick(x, y);
    } else {
      this.handleSingleClick(x, y, e.shiftKey);
    }

    // Focus the textarea
    this.onCanvasClick?.();
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    if (!this.layoutIndex.isBuilt) return;

    const {x, y} = this.getCanvasCoordinates(e);
    const hitResult = this.layoutIndex.hitTest(x, y);

    this.editorState.extendSelectionTo(hitResult.position);
  }

  private handleMouseUp(_e: MouseEvent): void {
    this.isDragging = false;
  }

  // ─── Click Handlers ───────────────────────────────────────────────

  /**
   * Single click: positions the caret at the clicked location.
   * With Shift held, extends the selection to the clicked position.
   */
  private handleSingleClick(x: number, y: number, shiftKey: boolean): void {
    const hitResult = this.layoutIndex.hitTest(x, y);

    if (shiftKey) {
      // Extend selection from current cursor to click position
      this.editorState.extendSelectionTo(hitResult.position);
    } else {
      // Set caret to click position
      this.editorState.setCursor(hitResult.position);
    }

    // Start tracking drag
    this.isDragging = true;
  }

  /**
   * Double click: selects the word under the cursor.
   */
  private handleDoubleClick(x: number, y: number): void {
    const hitResult = this.layoutIndex.hitTest(x, y);
    const {paragraphIndex, charOffset} = hitResult.position;

    const paragraph = this.editorState.document.paragraphs[paragraphIndex];
    if (!paragraph) return;

    const text = getParagraphText(paragraph);
    if (text.length === 0) return;

    // Find word boundaries
    const wordStart = this.findWordBoundary(text, charOffset, "backward");
    const wordEnd = this.findWordBoundary(text, charOffset, "forward");

    this.editorState.setSelection({
      anchor: {paragraphIndex, charOffset: wordStart},
      focus: {paragraphIndex, charOffset: wordEnd},
    });

    this.isDragging = false; // Don't drag after double-click
  }

  /**
   * Triple click: selects the entire paragraph.
   */
  private handleTripleClick(x: number, y: number): void {
    const hitResult = this.layoutIndex.hitTest(x, y);
    const {paragraphIndex} = hitResult.position;

    const paragraph = this.editorState.document.paragraphs[paragraphIndex];
    if (!paragraph) return;

    const paraLength = getParagraphTextLength(paragraph);

    this.editorState.setSelection({
      anchor: {paragraphIndex, charOffset: 0},
      focus: {paragraphIndex, charOffset: paraLength},
    });

    this.isDragging = false; // Don't drag after triple-click
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  /**
   * Converts a mouse event to canvas-relative CSS coordinates.
   * Accounts for scroll position and canvas offset.
   */
  private getCanvasCoordinates(e: MouseEvent): { x: number; y: number } {
    const canvasRect = this.canvas.getBoundingClientRect();

    // Get the scroll container (canvas's parent)
    const container = this.canvas.parentElement;
    const scrollTop = container?.scrollTop ?? 0;
    const scrollLeft = container?.scrollLeft ?? 0;

    return {
      x: e.clientX - canvasRect.left + scrollLeft,
      y: e.clientY - canvasRect.top + scrollTop,
    };
  }

  /**
   * Finds a word boundary from the given offset in the specified direction.
   * A "word" is a contiguous sequence of alphanumeric/underscore characters.
   */
  private findWordBoundary(
    text: string,
    offset: number,
    direction: "backward" | "forward"
  ): number {
    const isWordChar = (ch: string): boolean => /\w/.test(ch);

    if (direction === "backward") {
      let pos = Math.min(offset, text.length);
      // Move back past non-word chars
      while (pos > 0 && !isWordChar(text[pos - 1]!)) {
        pos--;
      }
      // Move back through word chars
      while (pos > 0 && isWordChar(text[pos - 1]!)) {
        pos--;
      }
      return pos;
    } else {
      let pos = offset;
      // Move forward past non-word chars
      while (pos < text.length && !isWordChar(text[pos]!)) {
        pos++;
      }
      // Move forward through word chars
      while (pos < text.length && isWordChar(text[pos]!)) {
        pos++;
      }
      return pos;
    }
  }
}
