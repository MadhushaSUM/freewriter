/**
 * @freewriter/core — Text Measurement Engine
 *
 * Provides a precise wrapper around the Canvas 2D `measureText()` API.
 * This is the foundation for accurate line wrapping, caret positioning,
 * and hit testing. The class caches font strings to avoid re-computing
 * them on every measurement call.
 */

import type {TextStyle} from "../model/document.js";
import {DEFAULT_TEXT_STYLE} from "../model/document.js";

/**
 * Result of measuring a single segment of text.
 */
export interface TextMeasurement {
  /** Total advance width of the measured text in CSS pixels */
  width: number;

  /**
   * Distance from the baseline to the top of the tallest glyph (positive upward).
   * Uses `actualBoundingBoxAscent` when available.
   */
  ascent: number;

  /**
   * Distance from the baseline to the bottom of the lowest glyph (positive downward).
   * Uses `actualBoundingBoxDescent` when available.
   */
  descent: number;

  /** Total height = ascent + descent */
  height: number;
}

/**
 * Resolves partial style overrides against the default text style.
 */
export function resolveStyle(partial?: Partial<TextStyle>): TextStyle {
  return {...DEFAULT_TEXT_STYLE, ...partial};
}

/**
 * Builds a CSS font shorthand string from a resolved TextStyle.
 *
 * Format: "[style] [weight] [size]px [family]"
 * Example: "italic bold 16px Inter"
 */
export function buildFontString(style: TextStyle): string {
  const parts: string[] = [];

  if (style.fontStyle === "italic") {
    parts.push("italic");
  }

  if (style.fontWeight === "bold") {
    parts.push("bold");
  }

  parts.push(`${style.fontSize}px`);
  parts.push(style.fontFamily);

  return parts.join(" ");
}

/**
 * TextMeasurer — a stateful wrapper around a CanvasRenderingContext2D
 * for precise text measurement with font-string caching.
 */
export class TextMeasurer {
  private readonly ctx: CanvasRenderingContext2D;

  /** Cache: serialized style key → CSS font string */
  private readonly fontCache = new Map<string, string>();

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /**
   * Gets (or creates and caches) the CSS font string for a given style.
   */
  getFontString(style: TextStyle): string {
    const key = this.getCacheKey(style);
    let font = this.fontCache.get(key);
    if (font === undefined) {
      font = buildFontString(style);
      this.fontCache.set(key, font);
    }
    return font;
  }

  /**
   * Applies a resolved TextStyle's font to the canvas context.
   */
  applyFont(style: TextStyle): void {
    this.ctx.font = this.getFontString(style);
  }

  /**
   * Measures a string of text using the given style.
   * Sets the context font, calls measureText, and returns structured metrics.
   */
  measure(text: string, style: TextStyle): TextMeasurement {
    this.applyFont(style);
    const metrics = this.ctx.measureText(text);

    // Modern browsers provide actual bounding box metrics.
    // Fall back to font-size-based heuristics if unavailable.
    const ascent =
      metrics.actualBoundingBoxAscent ?? style.fontSize * 0.8;
    const descent =
      metrics.actualBoundingBoxDescent ?? style.fontSize * 0.2;

    return {
      width: metrics.width,
      ascent,
      descent,
      height: ascent + descent,
    };
  }

  /**
   * Measures the width of each word in a string (split by spaces).
   * Returns an array of { word, width } pairs.
   * Spaces are measured separately for accurate wrapping.
   */
  measureWords(
    text: string,
    style: TextStyle
  ): Array<{ word: string; width: number }> {
    this.applyFont(style);
    const results: Array<{ word: string; width: number }> = [];

    // Split keeping spaces as separate tokens
    const tokens = text.split(/( )/);

    for (const token of tokens) {
      if (token === "") continue;
      const metrics = this.ctx.measureText(token);
      results.push({word: token, width: metrics.width});
    }

    return results;
  }

  /**
   * Clears the font cache. Call this if you change the underlying
   * canvas context or need to force re-computation.
   */
  clearCache(): void {
    this.fontCache.clear();
  }

  /**
   * Generates a deterministic cache key for a resolved TextStyle.
   * Only the properties that affect font selection are included.
   */
  private getCacheKey(style: TextStyle): string {
    return `${style.fontFamily}|${style.fontSize}|${style.fontWeight}|${style.fontStyle}`;
  }
}
