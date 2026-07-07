/**
 * @freewriter/core — Input Handler
 *
 * Implements the "hidden textarea trick" — an invisible <textarea>
 * positioned over the canvas captures native keyboard events, basic
 * IME composition, and clipboard operations (plain text only for Phase 2).
 *
 * The textarea is:
 * - Invisible (opacity: 0, dimensions: 1×1px)
 * - Positioned absolutely to follow the caret (for IME popup placement)
 * - Auto-focused when the canvas is clicked
 * - The sole recipient of keyboard events
 *
 * This handler is framework-agnostic and works with any canvas element.
 */

import type {EditorState} from "../state/editor-state.js";
import type {LayoutIndex} from "../layout/layout-index.js";
import {ShortcutResolver} from "./keyboard-shortcuts.js";

// ─── Configuration ───────────────────────────────────────────────────

export interface InputHandlerConfig {
  /** The canvas element to overlay with the hidden textarea */
  canvas: HTMLCanvasElement;

  /** The editor state to mutate on input */
  editorState: EditorState;

  /** The layout index for caret position lookups */
  layoutIndex: LayoutIndex;

  /** Optional custom shortcut resolver */
  shortcutResolver?: ShortcutResolver;
}

// ─── Input Handler ───────────────────────────────────────────────────

export class InputHandler {
  private readonly canvas: HTMLCanvasElement;
  private readonly editorState: EditorState;
  private readonly layoutIndex: LayoutIndex;
  private readonly shortcutResolver: ShortcutResolver;

  /** The hidden textarea element */
  private textarea: HTMLTextAreaElement | null = null;

  /** Whether we're currently in an IME composition session */
  private isComposing = false;

  /** Bound event handlers (for clean removal) */
  private readonly boundHandlers: {
    handleInput: (e: Event) => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    handleCompositionStart: () => void;
    handleCompositionEnd: (e: CompositionEvent) => void;
    handleCopy: (e: ClipboardEvent) => void;
    handlePaste: (e: ClipboardEvent) => void;
    handleCut: (e: ClipboardEvent) => void;
    handleFocus: () => void;
    handleBlur: () => void;
  };

  /** Whether the textarea is currently focused */
  private _isFocused = false;

  /** Callback invoked when focus state changes (for caret visibility) */
  onFocusChange: ((focused: boolean) => void) | null = null;

  constructor(config: InputHandlerConfig) {
    this.canvas = config.canvas;
    this.editorState = config.editorState;
    this.layoutIndex = config.layoutIndex;
    this.shortcutResolver = config.shortcutResolver ?? new ShortcutResolver();

    // Pre-bind handlers for clean add/remove
    this.boundHandlers = {
      handleInput: this.handleInput.bind(this),
      handleKeyDown: this.handleKeyDown.bind(this),
      handleCompositionStart: this.handleCompositionStart.bind(this),
      handleCompositionEnd: this.handleCompositionEnd.bind(this),
      handleCopy: this.handleCopy.bind(this),
      handlePaste: this.handlePaste.bind(this),
      handleCut: this.handleCut.bind(this),
      handleFocus: this.handleFocus.bind(this),
      handleBlur: this.handleBlur.bind(this),
    };
  }

  get isFocused(): boolean {
    return this._isFocused;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────

  /**
   * Creates the hidden textarea and attaches event listeners.
   * Call this after the canvas is mounted in the DOM.
   */
  mount(): void {
    if (this.textarea) return; // Already mounted

    const textarea = document.createElement("textarea");

    // Make invisible but focusable
    textarea.setAttribute("autocapitalize", "off");
    textarea.setAttribute("autocomplete", "off");
    textarea.setAttribute("autocorrect", "off");
    textarea.setAttribute("spellcheck", "false");
    textarea.setAttribute("tabindex", "0");
    textarea.setAttribute("aria-label", "Freewriter text input");

    Object.assign(textarea.style, {
      position: "absolute",
      top: "0px",
      left: "0px",
      width: "1px",
      height: "1px",
      padding: "0",
      border: "none",
      outline: "none",
      resize: "none",
      overflow: "hidden",
      opacity: "0",
      fontSize: "16px", // Prevent iOS zoom on focus
      caretColor: "transparent",
      zIndex: "-1",
      pointerEvents: "none",
    });

    // Insert textarea as sibling of canvas (within the same container)
    const container = this.canvas.parentElement;
    if (container) {
      // Ensure container is positioned for absolute children
      const containerPosition = getComputedStyle(container).position;
      if (containerPosition === "static") {
        container.style.position = "relative";
      }
      container.appendChild(textarea);
    } else {
      document.body.appendChild(textarea);
    }

    this.textarea = textarea;

    // Attach event listeners
    textarea.addEventListener("input", this.boundHandlers.handleInput);
    textarea.addEventListener("keydown", this.boundHandlers.handleKeyDown);
    textarea.addEventListener(
      "compositionstart",
      this.boundHandlers.handleCompositionStart
    );
    textarea.addEventListener(
      "compositionend",
      this.boundHandlers.handleCompositionEnd
    );
    textarea.addEventListener("copy", this.boundHandlers.handleCopy);
    textarea.addEventListener("paste", this.boundHandlers.handlePaste);
    textarea.addEventListener("cut", this.boundHandlers.handleCut);
    textarea.addEventListener("focus", this.boundHandlers.handleFocus);
    textarea.addEventListener("blur", this.boundHandlers.handleBlur);
  }

  /**
   * Removes the textarea and all event listeners.
   */
  destroy(): void {
    if (!this.textarea) return;

    this.textarea.removeEventListener("input", this.boundHandlers.handleInput);
    this.textarea.removeEventListener(
      "keydown",
      this.boundHandlers.handleKeyDown
    );
    this.textarea.removeEventListener(
      "compositionstart",
      this.boundHandlers.handleCompositionStart
    );
    this.textarea.removeEventListener(
      "compositionend",
      this.boundHandlers.handleCompositionEnd
    );
    this.textarea.removeEventListener("copy", this.boundHandlers.handleCopy);
    this.textarea.removeEventListener("paste", this.boundHandlers.handlePaste);
    this.textarea.removeEventListener("cut", this.boundHandlers.handleCut);
    this.textarea.removeEventListener("focus", this.boundHandlers.handleFocus);
    this.textarea.removeEventListener("blur", this.boundHandlers.handleBlur);

    this.textarea.remove();
    this.textarea = null;
  }

  /**
   * Focus the hidden textarea (e.g., after a canvas click).
   */
  focus(): void {
    this.textarea?.focus({preventScroll: true});
  }

  /**
   * Repositions the hidden textarea to the caret's pixel coordinates.
   * This ensures IME popups appear in the correct location.
   */
  syncTextareaPosition(): void {
    if (!this.textarea || !this.layoutIndex.isBuilt) return;

    const rect = this.layoutIndex.getCharacterRect(this.editorState.cursor);
    if (!rect) return;

    // Get the canvas position relative to the container
    const canvasRect = this.canvas.getBoundingClientRect();
    const container = this.canvas.parentElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();

    // Calculate position relative to the scroll container
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;

    const x = rect.x + (canvasRect.left - containerRect.left) + scrollLeft;
    const y = rect.y + (canvasRect.top - containerRect.top) + scrollTop;

    this.textarea.style.left = `${x}px`;
    this.textarea.style.top = `${y}px`;
    this.textarea.style.height = `${rect.height}px`;
  }

  // ─── Event Handlers ───────────────────────────────────────────────

  /**
   * Handles text input from the textarea.
   * This fires for regular character input and after IME composition ends.
   */
  private handleInput(e: Event): void {
    // During IME composition, don't process input events
    if (this.isComposing) return;

    const inputEvent = e as InputEvent;

    // Ignore non-insertion input types (deletion is handled by keydown)
    if (inputEvent.inputType !== "insertText" &&
      inputEvent.inputType !== "insertFromPaste") {
      return;
    }

    const text = inputEvent.data;
    if (text) {
      this.editorState.insertText(text);
    }

    // Clear the textarea so it's ready for the next input
    this.clearTextarea();
  }

  /**
   * Handles keydown events for shortcuts and special keys.
   * Regular character input is handled by the `input` event instead.
   */
  private handleKeyDown(e: KeyboardEvent): void {
    // During IME composition, don't intercept keys
    if (this.isComposing) return;

    const matched = this.shortcutResolver.match(e);
    if (matched) {
      if (matched.preventDefault !== false) {
        e.preventDefault();
      }
      matched.action(this.editorState, this.layoutIndex);
    }
  }

  /**
   * Handles the start of an IME composition session.
   */
  private handleCompositionStart(): void {
    this.isComposing = true;
  }

  /**
   * Handles the end of an IME composition session.
   * The composed text is inserted into the document.
   */
  private handleCompositionEnd(e: CompositionEvent): void {
    this.isComposing = false;

    if (e.data) {
      this.editorState.insertText(e.data);
    }

    this.clearTextarea();
  }

  /**
   * Handles copy events — copies selected text to clipboard as plain text.
   */
  private handleCopy(e: ClipboardEvent): void {
    const selectedText = this.editorState.getSelectedText();
    if (!selectedText) return;

    e.preventDefault();
    e.clipboardData?.setData("text/plain", selectedText);
  }

  /**
   * Handles paste events — inserts plain text from clipboard.
   */
  private handlePaste(e: ClipboardEvent): void {
    e.preventDefault();

    const text = e.clipboardData?.getData("text/plain");
    if (text) {
      // Handle multi-line paste by splitting into paragraph breaks
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line !== undefined && line.length > 0) {
          this.editorState.insertText(line);
        }
        if (i < lines.length - 1) {
          this.editorState.insertParagraphBreak();
        }
      }
    }
  }

  /**
   * Handles cut events — copies selected text and deletes it.
   */
  private handleCut(e: ClipboardEvent): void {
    const selectedText = this.editorState.getSelectedText();
    if (!selectedText) return;

    e.preventDefault();
    e.clipboardData?.setData("text/plain", selectedText);
    this.editorState.deleteBackward();
  }

  /**
   * Handles focus events on the textarea.
   */
  private handleFocus(): void {
    this._isFocused = true;
    this.onFocusChange?.(true);
  }

  /**
   * Handles blur events on the textarea.
   */
  private handleBlur(): void {
    this._isFocused = false;
    this.onFocusChange?.(false);
  }

  /**
   * Clears the textarea content so it's ready for the next input event.
   */
  private clearTextarea(): void {
    if (this.textarea) {
      this.textarea.value = "";
    }
  }
}
