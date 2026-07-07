/**
 * @freewriter/core — Selection Renderer
 *
 * Draws semi-transparent highlight rectangles over selected text.
 * The selection color matches Google Docs' blue highlight.
 *
 * Selection rects are computed by the LayoutIndex and passed to this
 * renderer. Each rect covers one line (or portion of a line) of the
 * selection.
 */

import type {CharacterRect} from "../layout/layout-types.js";

// ─── Types ───────────────────────────────────────────────────────────

export interface SelectionStyle {
  /** Fill color for selection highlights. Default: Google Docs blue */
  color: string;
}

const DEFAULT_SELECTION_STYLE: Readonly<SelectionStyle> = {
  color: "rgba(66, 133, 244, 0.3)",
} as const;

// ─── Selection Renderer ─────────────────────────────────────────────

export class SelectionRenderer {
  private readonly style: SelectionStyle;

  /** The current selection rectangles to draw */
  private rects: CharacterRect[] = [];

  constructor(style?: Partial<SelectionStyle>) {
    this.style = {...DEFAULT_SELECTION_STYLE, ...style};
  }

  /**
   * Updates the selection rectangles to draw.
   */
  setRects(rects: CharacterRect[]): void {
    this.rects = rects;
  }

  /**
   * Clears all selection rectangles.
   */
  clear(): void {
    this.rects = [];
  }

  /**
   * Returns true if there are selection rectangles to draw.
   */
  hasSelection(): boolean {
    return this.rects.length > 0;
  }

  /**
   * Draws the selection highlight rectangles onto the given canvas context.
   * Should be called BEFORE text drawing so selection appears behind text.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.rects.length === 0) return;

    ctx.save();
    ctx.fillStyle = this.style.color;

    for (const rect of this.rects) {
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }

    ctx.restore();
  }
}
