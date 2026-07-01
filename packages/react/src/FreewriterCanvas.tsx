/**
 * @freewriter/react — FreewriterCanvas Component
 *
 * A React component that bridges the pure-TS @freewriter/core engine
 * with the React component lifecycle. It manages:
 * - Canvas element ref and 2D context initialization
 * - CanvasRenderer instantiation
 * - Window resize observation for responsive re-renders
 * - DPR-aware re-rendering on document or size changes
 */

"use client";

import {type CSSProperties, useCallback, useEffect, useRef,} from "react";

import type {FreewriterDocument, RendererConfig} from "@freewriter/core";
import {CanvasRenderer} from "@freewriter/core";

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
}

// ─── Component ─────────────────────────────────────────────────────

export function FreewriterCanvas({
                                   document,
                                   rendererConfig,
                                   className,
                                   style,
                                 }: FreewriterCanvasProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);

  /**
   * Performs a full render pass: re-draws the document onto the canvas.
   */
  const renderDocument = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Initialize renderer lazily
    if (!rendererRef.current) {
      rendererRef.current = new CanvasRenderer(canvas, rendererConfig);
    }

    const renderer = rendererRef.current;

    // Set canvas CSS width to fill its container
    canvas.style.width = `${container.clientWidth}px`;

    // Render the document
    renderer.render(document);
  }, [document, rendererConfig]);

  /**
   * Effect: re-render when the document changes.
   */
  useEffect(() => {
    renderDocument();
  }, [renderDocument]);

  /**
   * Effect: observe container resize and re-render.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      // Re-create renderer on resize to handle DPR changes
      rendererRef.current = null;
      renderDocument();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [renderDocument]);

  /**
   * Effect: listen for DPR changes (e.g., moving window between monitors).
   */
  useEffect(() => {
    const mediaQuery = window.matchMedia(
      `(resolution: ${window.devicePixelRatio}dppx)`
    );

    const handleDPRChange = (): void => {
      rendererRef.current = null;
      renderDocument();
    };

    mediaQuery.addEventListener("change", handleDPRChange);

    return () => {
      mediaQuery.removeEventListener("change", handleDPRChange);
    };
  }, [renderDocument]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        overflow: "auto",
        width: "100%",
        height: "100%",
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          margin: "0 auto",
        }}
      />
    </div>
  );
}
