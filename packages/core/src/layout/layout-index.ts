/**
 * @freewriter/core — Layout Index
 *
 * Builds a searchable index from rendered layout results, enabling
 * bidirectional coordinate mapping:
 *
 *   (x, y) canvas click  →  (paragraphIndex, charOffset)   [hit testing]
 *   (paragraphIndex, charOffset)  →  (x, y, width, height) [caret placement]
 *
 * Implements the Facade pattern — provides a simple API over the complex
 * layout data structures and character-entry arrays.
 *
 * Uses binary search for efficient hit-testing on the flattened character
 * entry list, which is sorted by (pageIndex, y, x).
 */

import type {PageSettings} from "../model/document.js";
import type {RendererConfig} from "../renderer/canvas-renderer.js";
import type {TextMeasurer} from "../measurement/text-measurer.js";
import type {
  CharacterEntry,
  CharacterRect,
  HitTestResult,
  LayoutLine,
  LayoutPage,
} from "./layout-types.js";
import type {DocumentPosition} from "../state/document-mutator.js";

// ─── Line Metadata ───────────────────────────────────────────────────

/** Metadata about a rendered line, used for line-based navigation */
interface LineInfo {
  /** Global line index (across all pages) */
  globalLineIndex: number;
  /** Page this line is on */
  pageIndex: number;
  /** Index within the page */
  lineInPage: number;
  /** Paragraph this line belongs to */
  paragraphIndex: number;
  /** Y top of this line in CSS px */
  y: number;
  /** Height of this line */
  height: number;
  /** The first character entry index in this line */
  firstEntryIndex: number;
  /** Number of character entries in this line */
  entryCount: number;
}

// ─── Layout Index ────────────────────────────────────────────────────

export class LayoutIndex {
  /** Flattened array of character entries, sorted by visual position */
  private entries: CharacterEntry[] = [];

  /** Line metadata for line-based navigation */
  private lineInfos: LineInfo[] = [];

  /**
   * Lookup: `paragraphIndex → charOffset → entryIndex`
   * for fast document-position → pixel-rect lookups.
   */
  private positionMap = new Map<string, number>();

  /** Whether the index has been built */
  private _isBuilt = false;

  get isBuilt(): boolean {
    return this._isBuilt;
  }

  /**
   * Builds the character-level index from layout results.
   *
   * This walks every line and every word, measuring individual characters
   * to produce per-character coordinate entries. Called after every layout pass.
   */
  build(
    pages: LayoutPage[],
    pageSettings: PageSettings,
    rendererConfig: RendererConfig,
    measurer: TextMeasurer,
    canvasWidth: number
  ): void {
    this.entries = [];
    this.lineInfos = [];
    this.positionMap.clear();

    const {canvasPadding, pageGap} = rendererConfig;

    // Center pages horizontally (matches the renderer)
    const pageX = Math.max(
      canvasPadding,
      (canvasWidth - pageSettings.width) / 2
    );

    let globalLineIndex = 0;

    for (const page of pages) {
      const pageY =
        canvasPadding +
        page.pageIndex * (pageSettings.height + pageGap);

      const contentX = pageX + pageSettings.marginLeft;
      let lineY = pageY + pageSettings.marginTop;

      for (let lineInPage = 0; lineInPage < page.lines.length; lineInPage++) {
        const line = page.lines[lineInPage]!;

        // Apply spaceBefore
        lineY += line.spaceBefore;

        const leading = (line.lineHeight - line.ascent - line.descent) / 2;
        const baselineY = lineY + leading + line.ascent;

        const lineStartEntryIndex = this.entries.length;

        // Walk each word and measure individual characters
        let cursorX = contentX;

        for (const word of line.words) {
          measurer.applyFont(word.style);

          for (let ci = 0; ci < word.text.length; ci++) {
            const char = word.text[ci]!;
            const charMetrics = measurer.measure(char, word.style);

            const entry: CharacterEntry = {
              paragraphIndex: line.paragraphIndex,
              charOffset: this.computeCharOffset(
                line, word, ci, page.lines, lineInPage
              ),
              x: cursorX,
              y: lineY,
              width: charMetrics.width,
              height: line.lineHeight,
              baseline: baselineY,
              pageIndex: page.pageIndex,
              lineIndex: globalLineIndex,
            };

            const posKey = `${entry.paragraphIndex}:${entry.charOffset}`;
            if (!this.positionMap.has(posKey)) {
              this.positionMap.set(posKey, this.entries.length);
            }
            this.entries.push(entry);

            cursorX += charMetrics.width;
          }
        }

        const entryCount = this.entries.length - lineStartEntryIndex;

        this.lineInfos.push({
          globalLineIndex,
          pageIndex: page.pageIndex,
          lineInPage,
          paragraphIndex: line.paragraphIndex,
          y: lineY,
          height: line.lineHeight,
          firstEntryIndex: lineStartEntryIndex,
          entryCount,
        });

        lineY += line.lineHeight;
        lineY += line.spaceAfter;

        globalLineIndex++;
      }
    }

    this._isBuilt = true;
  }

  /**
   * Computes the absolute character offset within a paragraph for a character
   * at position `charIndexInWord` of `word`, on line `lineInPage`.
   */
  private computeCharOffset(
    currentLine: LayoutLine,
    targetWord: { text: string; width: number },
    charIndexInWord: number,
    allLinesInPage: LayoutLine[],
    _lineInPage: number
  ): number {
    // Count characters in previous lines of the same paragraph
    // (across all pages, but we only have the current page's lines)
    // We need to count all words in the current line up to (but not including)
    // the target word, plus the charIndexInWord.

    let offset = 0;

    // Count characters from all lines of the same paragraph that appear
    // before the current line in the page
    for (const line of allLinesInPage) {
      if (line === currentLine) break;
      if (line.paragraphIndex !== currentLine.paragraphIndex) continue;
      for (const w of line.words) {
        offset += w.text.length;
      }
    }

    // Count characters in words on the current line before the target word
    for (const w of currentLine.words) {
      if (w === targetWord) break;
      offset += w.text.length;
    }

    offset += charIndexInWord;
    return offset;
  }

  // ─── Hit Testing ──────────────────────────────────────────────────

  /**
   * Translates (x, y) canvas coordinates into a document position.
   * Returns the closest character position.
   */
  hitTest(x: number, y: number): HitTestResult {
    if (this.entries.length === 0) {
      return {
        position: {paragraphIndex: 0, charOffset: 0},
        isAtLineEnd: true,
        isAtParagraphEnd: true,
      };
    }

    // Find the closest line by Y coordinate
    const lineInfo = this.findClosestLine(y);
    if (!lineInfo) {
      // Click below all content — go to end of document
      const lastEntry = this.entries[this.entries.length - 1]!;
      return {
        position: {
          paragraphIndex: lastEntry.paragraphIndex,
          charOffset: lastEntry.charOffset + 1,
        },
        isAtLineEnd: true,
        isAtParagraphEnd: true,
      };
    }

    // If the line has no entries (empty line), return its paragraph position
    if (lineInfo.entryCount === 0) {
      return {
        position: {
          paragraphIndex: lineInfo.paragraphIndex,
          charOffset: 0,
        },
        isAtLineEnd: true,
        isAtParagraphEnd: true,
      };
    }

    // Find the closest character within this line
    const startIdx = lineInfo.firstEntryIndex;
    const endIdx = startIdx + lineInfo.entryCount;

    // Click before the first character
    const firstEntry = this.entries[startIdx]!;
    if (x <= firstEntry.x) {
      return {
        position: {
          paragraphIndex: firstEntry.paragraphIndex,
          charOffset: firstEntry.charOffset,
        },
        isAtLineEnd: false,
        isAtParagraphEnd: false,
      };
    }

    // Click after the last character
    const lastEntry = this.entries[endIdx - 1]!;
    if (x >= lastEntry.x + lastEntry.width) {
      return {
        position: {
          paragraphIndex: lastEntry.paragraphIndex,
          charOffset: lastEntry.charOffset + 1,
        },
        isAtLineEnd: true,
        isAtParagraphEnd: false,
      };
    }

    // Find which character the click falls on
    for (let i = startIdx; i < endIdx; i++) {
      const entry = this.entries[i]!;
      if (x >= entry.x && x < entry.x + entry.width) {
        // Determine if we're closer to the left or right edge of the character
        const midpoint = entry.x + entry.width / 2;
        const charOffset = x < midpoint ? entry.charOffset : entry.charOffset + 1;
        return {
          position: {
            paragraphIndex: entry.paragraphIndex,
            charOffset,
          },
          isAtLineEnd: false,
          isAtParagraphEnd: false,
        };
      }
    }

    // Fallback — click is between characters (shouldn't happen but be safe)
    return {
      position: {
        paragraphIndex: lastEntry.paragraphIndex,
        charOffset: lastEntry.charOffset + 1,
      },
      isAtLineEnd: true,
      isAtParagraphEnd: false,
    };
  }

  /** Finds the line closest to the given Y coordinate */
  private findClosestLine(y: number): LineInfo | null {
    if (this.lineInfos.length === 0) return null;

    let closest: LineInfo | null = null;
    let closestDist = Infinity;

    for (const lineInfo of this.lineInfos) {
      // Check if y is within the line
      if (y >= lineInfo.y && y < lineInfo.y + lineInfo.height) {
        return lineInfo;
      }

      // Otherwise track the closest
      const lineCenter = lineInfo.y + lineInfo.height / 2;
      const dist = Math.abs(y - lineCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closest = lineInfo;
      }
    }

    return closest;
  }

  // ─── Position → Pixel Rect ────────────────────────────────────────

  /**
   * Converts a document position to a pixel rectangle on the canvas.
   * Returns null if the position is not in the current layout.
   */
  getCharacterRect(position: DocumentPosition): CharacterRect | null {
    if (!this._isBuilt || this.entries.length === 0) return null;

    const posKey = `${position.paragraphIndex}:${position.charOffset}`;
    const entryIndex = this.positionMap.get(posKey);

    if (entryIndex !== undefined) {
      const entry = this.entries[entryIndex]!;
      return {
        x: entry.x,
        y: entry.y,
        width: entry.width,
        height: entry.height,
        baseline: entry.baseline,
        pageIndex: entry.pageIndex,
      };
    }

    // Position is at the end of a line/paragraph — use the right edge of the
    // last character in that paragraph at the closest offset
    const lastCharPos = `${position.paragraphIndex}:${position.charOffset - 1}`;
    const lastEntryIndex = this.positionMap.get(lastCharPos);

    if (lastEntryIndex !== undefined) {
      const entry = this.entries[lastEntryIndex]!;
      return {
        x: entry.x + entry.width,
        y: entry.y,
        width: 0,
        height: entry.height,
        baseline: entry.baseline,
        pageIndex: entry.pageIndex,
      };
    }

    // Position is at the beginning of an empty paragraph
    // Find the line for this paragraph
    for (const lineInfo of this.lineInfos) {
      if (lineInfo.paragraphIndex === position.paragraphIndex) {
        if (lineInfo.entryCount > 0) {
          const firstEntry = this.entries[lineInfo.firstEntryIndex]!;
          return {
            x: firstEntry.x,
            y: firstEntry.y,
            width: 0,
            height: firstEntry.height,
            baseline: firstEntry.baseline,
            pageIndex: firstEntry.pageIndex,
          };
        }
        // Empty line — return the line's position
        return {
          x: 0, // Will be set by renderer
          y: lineInfo.y,
          width: 0,
          height: lineInfo.height,
          baseline: lineInfo.y + lineInfo.height * 0.8,
          pageIndex: lineInfo.pageIndex,
        };
      }
    }

    return null;
  }

  /**
   * Returns an array of rectangles covering the selection range.
   * Selection may span multiple lines, producing one rect per line.
   */
  getSelectionRects(range: {
    anchor: DocumentPosition;
    focus: DocumentPosition;
  }): CharacterRect[] {
    if (!this._isBuilt || this.entries.length === 0) return [];

    // Normalize so start < end
    const {anchor, focus} = range;
    let start: DocumentPosition;
    let end: DocumentPosition;

    if (
      anchor.paragraphIndex < focus.paragraphIndex ||
      (anchor.paragraphIndex === focus.paragraphIndex &&
        anchor.charOffset <= focus.charOffset)
    ) {
      start = anchor;
      end = focus;
    } else {
      start = focus;
      end = anchor;
    }

    const rects: CharacterRect[] = [];

    // Walk each line and find which entries fall within the selection
    for (const lineInfo of this.lineInfos) {
      if (lineInfo.entryCount === 0) continue;

      const lineFirstEntry = this.entries[lineInfo.firstEntryIndex]!;
      const lineLastEntry =
        this.entries[lineInfo.firstEntryIndex + lineInfo.entryCount - 1]!;

      // Does this line's paragraph range overlap with the selection?
      const lineStartPos: DocumentPosition = {
        paragraphIndex: lineFirstEntry.paragraphIndex,
        charOffset: lineFirstEntry.charOffset,
      };
      const lineEndPos: DocumentPosition = {
        paragraphIndex: lineLastEntry.paragraphIndex,
        charOffset: lineLastEntry.charOffset + 1,
      };

      // Skip lines entirely before the selection
      if (this.positionIsBefore(lineEndPos, start)) continue;
      // Skip lines entirely after the selection
      if (this.positionIsBefore(end, lineStartPos)) continue;

      // Find the X range within this line that's selected
      let rectX = lineFirstEntry.x;
      let rectRight = lineLastEntry.x + lineLastEntry.width;

      // Clip to selection start
      for (
        let i = lineInfo.firstEntryIndex;
        i < lineInfo.firstEntryIndex + lineInfo.entryCount;
        i++
      ) {
        const entry = this.entries[i]!;
        const entryPos: DocumentPosition = {
          paragraphIndex: entry.paragraphIndex,
          charOffset: entry.charOffset,
        };
        if (!this.positionIsBefore(entryPos, start)) {
          rectX = entry.x;
          break;
        }
      }

      // Clip to selection end
      for (
        let i = lineInfo.firstEntryIndex + lineInfo.entryCount - 1;
        i >= lineInfo.firstEntryIndex;
        i--
      ) {
        const entry = this.entries[i]!;
        const entryPos: DocumentPosition = {
          paragraphIndex: entry.paragraphIndex,
          charOffset: entry.charOffset + 1,
        };
        if (!this.positionIsBefore(end, entryPos)) {
          rectRight = entry.x + entry.width;
          break;
        }
      }

      if (rectRight > rectX) {
        rects.push({
          x: rectX,
          y: lineFirstEntry.y,
          width: rectRight - rectX,
          height: lineFirstEntry.height,
          baseline: lineFirstEntry.baseline,
          pageIndex: lineFirstEntry.pageIndex,
        });
      }
    }

    return rects;
  }

  /** Returns true if position `a` is strictly before position `b` */
  private positionIsBefore(a: DocumentPosition, b: DocumentPosition): boolean {
    if (a.paragraphIndex < b.paragraphIndex) return true;
    if (a.paragraphIndex > b.paragraphIndex) return false;
    return a.charOffset < b.charOffset;
  }

  // ─── Line Navigation ─────────────────────────────────────────────

  /** Gets the position at the start of the line containing `position` */
  getLineStart(position: DocumentPosition): DocumentPosition {
    const lineInfo = this.findLineForPosition(position);
    if (!lineInfo || lineInfo.entryCount === 0) {
      return {paragraphIndex: position.paragraphIndex, charOffset: 0};
    }
    const firstEntry = this.entries[lineInfo.firstEntryIndex]!;
    return {
      paragraphIndex: firstEntry.paragraphIndex,
      charOffset: firstEntry.charOffset,
    };
  }

  /** Gets the position at the end of the line containing `position` */
  getLineEnd(position: DocumentPosition): DocumentPosition {
    const lineInfo = this.findLineForPosition(position);
    if (!lineInfo || lineInfo.entryCount === 0) {
      return position;
    }
    const lastEntry =
      this.entries[lineInfo.firstEntryIndex + lineInfo.entryCount - 1]!;
    return {
      paragraphIndex: lastEntry.paragraphIndex,
      charOffset: lastEntry.charOffset + 1,
    };
  }

  /**
   * Gets the position on the line above, at the given preferred X coordinate.
   * Returns null if already on the first line.
   */
  getPositionAbove(
    position: DocumentPosition,
    preferredX: number
  ): DocumentPosition | null {
    const lineInfo = this.findLineForPosition(position);
    if (!lineInfo || lineInfo.globalLineIndex === 0) return null;

    const aboveLine = this.lineInfos[lineInfo.globalLineIndex - 1];
    if (!aboveLine) return null;

    return this.findPositionOnLineAtX(aboveLine, preferredX);
  }

  /**
   * Gets the position on the line below, at the given preferred X coordinate.
   * Returns null if already on the last line.
   */
  getPositionBelow(
    position: DocumentPosition,
    preferredX: number
  ): DocumentPosition | null {
    const lineInfo = this.findLineForPosition(position);
    if (!lineInfo) return null;

    const belowLine = this.lineInfos[lineInfo.globalLineIndex + 1];
    if (!belowLine) return null;

    return this.findPositionOnLineAtX(belowLine, preferredX);
  }

  /** Finds the line that contains the given document position */
  private findLineForPosition(position: DocumentPosition): LineInfo | null {
    // Use positionMap to find the entry, then its lineIndex
    const posKey = `${position.paragraphIndex}:${position.charOffset}`;
    const entryIndex = this.positionMap.get(posKey);

    if (entryIndex !== undefined) {
      const entry = this.entries[entryIndex]!;
      return this.lineInfos[entry.lineIndex] ?? null;
    }

    // Try the character before (cursor at end of text)
    if (position.charOffset > 0) {
      const prevKey = `${position.paragraphIndex}:${position.charOffset - 1}`;
      const prevEntryIndex = this.positionMap.get(prevKey);
      if (prevEntryIndex !== undefined) {
        const entry = this.entries[prevEntryIndex]!;
        return this.lineInfos[entry.lineIndex] ?? null;
      }
    }

    // Find by paragraph index (for empty paragraphs)
    for (const lineInfo of this.lineInfos) {
      if (lineInfo.paragraphIndex === position.paragraphIndex) {
        return lineInfo;
      }
    }

    return null;
  }

  /** Finds the document position on a line closest to the given X coordinate */
  private findPositionOnLineAtX(
    lineInfo: LineInfo,
    x: number
  ): DocumentPosition {
    if (lineInfo.entryCount === 0) {
      return {paragraphIndex: lineInfo.paragraphIndex, charOffset: 0};
    }

    const startIdx = lineInfo.firstEntryIndex;
    const endIdx = startIdx + lineInfo.entryCount;

    // Before first char
    const firstEntry = this.entries[startIdx]!;
    if (x <= firstEntry.x) {
      return {
        paragraphIndex: firstEntry.paragraphIndex,
        charOffset: firstEntry.charOffset,
      };
    }

    // After last char
    const lastEntry = this.entries[endIdx - 1]!;
    if (x >= lastEntry.x + lastEntry.width) {
      return {
        paragraphIndex: lastEntry.paragraphIndex,
        charOffset: lastEntry.charOffset + 1,
      };
    }

    // Find closest character
    let closest: CharacterEntry | null = null;
    let closestDist = Infinity;

    for (let i = startIdx; i < endIdx; i++) {
      const entry = this.entries[i]!;
      const mid = entry.x + entry.width / 2;
      const dist = Math.abs(x - mid);
      if (dist < closestDist) {
        closestDist = dist;
        closest = entry;
      }
    }

    if (closest) {
      const mid = closest.x + closest.width / 2;
      const offset = x < mid ? closest.charOffset : closest.charOffset + 1;
      return {
        paragraphIndex: closest.paragraphIndex,
        charOffset: offset,
      };
    }

    return {paragraphIndex: lineInfo.paragraphIndex, charOffset: 0};
  }
}
