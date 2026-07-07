/**
 * @freewriter/react — FreewriterCanvas Component
 *
 * A React component that bridges the pure-TS @freewriter/core engine
 * with the React component lifecycle. It manages:
 * - Canvas element ref and Editor initialization
 * - Editor lifecycle (mount/destroy) synced with React effects
 * - Window resize observation for responsive re-renders
 * - DPR-aware re-rendering on document or size changes
 * - Document prop syncing to the Editor's state
 *
 * Phase 2: Uses the Editor facade instead of directly managing the
 * CanvasRenderer, enabling interactive editing (typing, caret,
 * selection) out of the box.
 */

"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  FreewriterDocument,
  RendererConfig,
  DocumentPosition,
} from "@freewriter/core";
import {Editor} from "@freewriter/core";

// ─── Props ─────────────────────────────────────────────────────────

export interface FreewriterCanvasProps {
  /** The document model to render */
  document: FreewriterDocument;

  /** Optional renderer configuration overrides */
  rendererConfig?: Partial<RendererConfig>;

  /** Optional CSS class for the scroll container */
  className?: string;

  /** Optional inline styles for the scroll container */
  style?: CSSProperties;

  /**
   * Callback fired when the cursor position changes.
   * Useful for status bar updates (e.g., "Paragraph 3, Char 42").
   */
  onCursorChange?: (cursor: DocumentPosition) => void;

  /**
   * Callback fired when the document is modified by user input.
   * Receives the updated document.
   */
  onDocumentChange?: (document: FreewriterDocument) => void;
}

// ─── Component ─────────────────────────────────────────────────────

export function FreewriterCanvas({
  document,
  rendererConfig,
  className,
  style,
  onCursorChange,
  onDocumentChange,
}: FreewriterCanvasProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [, setRenderTick] = useState(0);

  /**
   * Effect: Initialize the Editor once the canvas is mounted.
   * The Editor manages its own lifecycle (input handlers, caret animation, etc.)
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas CSS width to fill its container
    const container = containerRef.current;
    if (container) {
      canvas.style.width = `${container.clientWidth}px`;
    }

    const editor = new Editor({
      canvas,
      document,
      rendererConfig,
    });

    editor.mount();
    editorRef.current = editor;

    // Wire up optional callbacks
    const subscriptions: Array<() => void> = [];

    if (onCursorChange) {
      subscriptions.push(
        editor.state.events.on("cursor-change", ({cursor}) => {
          onCursorChange(cursor);
        })
      );
    }

    if (onDocumentChange) {
      subscriptions.push(
        editor.state.events.on("document-change", ({document: doc}) => {
          onDocumentChange(doc);
        })
      );
    }

    return () => {
      for (const unsub of subscriptions) {
        unsub();
      }
      editor.destroy();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendererConfig]);

  /**
   * Effect: Sync document prop changes to the editor.
   * Only applies when the document reference changes externally.
   */
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setDocument(document);
    }
  }, [document]);

  /**
   * Handles resize: force the editor to re-render when the container size changes.
   */
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const editor = editorRef.current;
    if (!canvas || !container || !editor) return;

    canvas.style.width = `${container.clientWidth}px`;
    editor.requestRender();
    setRenderTick((t) => t + 1);
  }, []);

  /**
   * Effect: observe container resize.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [handleResize]);

  /**
   * Effect: listen for DPR changes (e.g., moving window between monitors).
   */
  useEffect(() => {
    const mediaQuery = window.matchMedia(
      `(resolution: ${window.devicePixelRatio}dppx)`
    );

    const handleDPRChange = (): void => {
      editorRef.current?.requestRender();
    };

    mediaQuery.addEventListener("change", handleDPRChange);

    return () => {
      mediaQuery.removeEventListener("change", handleDPRChange);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        overflow: "auto",
        width: "100%",
        height: "100%",
        position: "relative",
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          margin: "0 auto",
          cursor: "text",
        }}
      />
    </div>
  );
}
