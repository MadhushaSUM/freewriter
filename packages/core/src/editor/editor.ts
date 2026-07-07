/**
 * @freewriter/core — Editor
 *
 * The top-level orchestrator implementing the Facade pattern.
 * Wires together all Phase 2 subsystems:
 * - EditorState (state management)
 * - CanvasRenderer (document drawing)
 * - LayoutIndex (coordinate mapping)
 * - InputHandler (keyboard capture via hidden textarea)
 * - MouseHandler (click/drag/selection)
 * - CaretRenderer (blinking cursor)
 * - SelectionRenderer (blue highlight)
 *
 * Consumers instantiate a single Editor and get a fully interactive
 * editing experience. This is the primary public API for Phase 2.
 *
 * Orchestration flow:
 *   User types → textarea input → InputHandler → EditorState.insertText()
 *     → EditorState emits 'render-request'
 *     → Editor.performRender()
 *     → CanvasRenderer.render(doc)
 *     → LayoutIndex.build(layout)
 *     → SelectionRenderer.draw() + CaretRenderer.draw()
 *     → InputHandler.syncTextareaPosition()
 */

import type {FreewriterDocument, PageSettings} from "../model/document.js";
import {DEFAULT_PAGE_SETTINGS} from "../model/document.js";
import type {RendererConfig} from "../renderer/canvas-renderer.js";
import {CanvasRenderer} from "../renderer/canvas-renderer.js";
import {CaretRenderer} from "../renderer/caret-renderer.js";
import {SelectionRenderer} from "../renderer/selection-renderer.js";
import {EditorState} from "../state/editor-state.js";
import {LayoutIndex} from "../layout/layout-index.js";
import {InputHandler} from "../input/input-handler.js";
import {MouseHandler} from "../input/mouse-handler.js";
import type {Unsubscribe} from "../state/event-emitter.js";

// ─── Configuration ───────────────────────────────────────────────────

export interface EditorConfig {
  /** The canvas element to render onto */
  canvas: HTMLCanvasElement;

  /** The initial document to render */
  document: FreewriterDocument;

  /** Optional renderer configuration overrides */
  rendererConfig?: Partial<RendererConfig>;
}

// ─── Editor ──────────────────────────────────────────────────────────

export class Editor {
  /** The central state container */
  readonly state: EditorState;

  /** The canvas rendering engine */
  readonly renderer: CanvasRenderer;

  /** The coordinate mapping index */
  readonly layoutIndex: LayoutIndex;

  /** The caret renderer */
  private readonly caretRenderer: CaretRenderer;

  /** The selection renderer */
  private readonly selectionRenderer: SelectionRenderer;

  /** The keyboard input handler */
  private inputHandler: InputHandler | null = null;

  /** The mouse input handler */
  private mouseHandler: MouseHandler | null = null;

  /** Event subscriptions for cleanup */
  private subscriptions: Unsubscribe[] = [];

  /** Whether a render is already scheduled for the next frame */
  private renderScheduled = false;

  /** The canvas element */
  private readonly canvas: HTMLCanvasElement;

  /** Whether the editor has been mounted */
  private mounted = false;

  constructor(config: EditorConfig) {
    this.canvas = config.canvas;
    this.state = new EditorState(config.document);
    this.renderer = new CanvasRenderer(config.canvas, config.rendererConfig);
    this.layoutIndex = new LayoutIndex();
    this.caretRenderer = new CaretRenderer();
    this.selectionRenderer = new SelectionRenderer();
  }

  // ─── Lifecycle ────────────────────────────────────────────────────

  /**
   * Initializes all subsystems, attaches event listeners, and
   * performs the first render. Call this after the canvas is in the DOM.
   */
  mount(): void {
    if (this.mounted) return;
    this.mounted = true;

    // Wire up state change listeners
    this.subscriptions.push(
      this.state.events.on("render-request", () => {
        this.scheduleRender();
      })
    );

    // Wire up caret blink frame callback
    this.caretRenderer.onBlinkFrame = () => {
      this.drawOverlays();
    };

    // Create and mount input handlers
    this.inputHandler = new InputHandler({
      canvas: this.canvas,
      editorState: this.state,
      layoutIndex: this.layoutIndex,
    });
    this.inputHandler.mount();

    // Wire up focus change for caret visibility
    this.inputHandler.onFocusChange = (focused) => {
      if (focused) {
        this.caretRenderer.startBlinking();
      } else {
        this.caretRenderer.stopBlinking();
        this.drawOverlays();
      }
    };

    this.mouseHandler = new MouseHandler({
      canvas: this.canvas,
      editorState: this.state,
      layoutIndex: this.layoutIndex,
      onCanvasClick: () => {
        this.inputHandler?.focus();
        this.caretRenderer.resetBlink();
      },
    });
    this.mouseHandler.mount();

    // Subscribe to state changes that should reset the caret blink
    this.subscriptions.push(
      this.state.events.on("document-change", () => {
        this.caretRenderer.resetBlink();
      })
    );

    this.subscriptions.push(
      this.state.events.on("cursor-change", () => {
        this.caretRenderer.resetBlink();
        this.inputHandler?.syncTextareaPosition();
      })
    );

    // Perform the initial render
    this.performRender();
  }

  /**
   * Cleans up all event listeners, animations, and DOM elements.
   */
  destroy(): void {
    if (!this.mounted) return;
    this.mounted = false;

    // Unsubscribe all event listeners
    for (const unsub of this.subscriptions) {
      unsub();
    }
    this.subscriptions = [];

    // Destroy input handlers
    this.inputHandler?.destroy();
    this.inputHandler = null;

    this.mouseHandler?.destroy();
    this.mouseHandler = null;

    // Stop caret animation
    this.caretRenderer.dispose();
  }

  // ─── Public API ───────────────────────────────────────────────────

  /**
   * Replaces the document and triggers a re-render.
   */
  setDocument(doc: FreewriterDocument): void {
    this.state.setDocument(doc);
  }

  /**
   * Explicitly requests a re-render (e.g., after resize).
   */
  requestRender(): void {
    this.scheduleRender();
  }

  /**
   * Focus the editor's input handler.
   */
  focus(): void {
    this.inputHandler?.focus();
  }

  // ─── Render Pipeline ──────────────────────────────────────────────

  /**
   * Schedules a render for the next animation frame.
   * Multiple calls within the same frame are coalesced.
   */
  private scheduleRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;

    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.performRender();
    });
  }

  /**
   * Executes the full render pipeline:
   * 1. Render the document (text + pages)
   * 2. Build the layout index
   * 3. Draw selection highlights
   * 4. Draw the caret
   * 5. Sync the textarea position
   */
  private performRender(): void {
    if (!this.mounted) return;

    const doc = this.state.document;

    // Step 1: Render the document (text + pages)
    this.renderer.render(doc);

    // Step 2: Build the layout index from the rendered layout
    const layout = this.renderer.getLastLayout();
    const pageSettings: PageSettings = {
      ...DEFAULT_PAGE_SETTINGS,
      ...doc.pageSettings,
    };

    this.layoutIndex.build(
      layout,
      pageSettings,
      this.renderer.config,
      this.renderer.measurer,
      this.renderer.getLastCssWidth()
    );

    // Step 3 & 4: Draw overlays (selection + caret)
    this.drawOverlays();

    // Step 5: Sync textarea position for IME
    this.inputHandler?.syncTextareaPosition();
  }

  /**
   * Draws the selection highlights and caret on top of the rendered document.
   * This is called both from the full render pipeline and from the
   * caret blink animation (which doesn't need a full re-layout).
   */
  private drawOverlays(): void {
    if (!this.mounted) return;

    // For overlay drawing, we need to re-render the document first
    // (since canvas is immediate-mode, we can't layer on top without clearing)
    // However, for blink frames, we re-render the full document to avoid
    // artifacts. This is efficient because the layout is cached.
    const doc = this.state.document;
    this.renderer.render(doc);

    // Get canvas context for overlay drawing
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    // Draw selection
    const selection = this.state.selection;
    if (selection) {
      const selectionRects = this.layoutIndex.getSelectionRects(selection);
      this.selectionRenderer.setRects(selectionRects);
      this.selectionRenderer.draw(ctx);
    } else {
      this.selectionRenderer.clear();
    }

    // Draw caret (only when focused and not selecting)
    if (this.inputHandler?.isFocused) {
      const caretRect = this.layoutIndex.getCharacterRect(this.state.cursor);
      if (caretRect) {
        this.caretRenderer.setPosition(caretRect.x, caretRect.y, caretRect.height);
        this.caretRenderer.draw(ctx);
      }
    }
  }
}
