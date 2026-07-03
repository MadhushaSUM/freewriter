/**
 * @freewriter/core — Canvas Renderer
 *
 * The main rendering engine that draws a FreewriterDocument onto an
 * HTML5 Canvas. Handles:
 * - Device Pixel Ratio (DPR) scaling for crisp text on Retina/HiDPI
 * - Page layout with margins and page breaks
 * - Word-level line wrapping within the content area
 * - Multi-style text runs (bold, italic, different sizes/fonts)
 * - Page gap rendering (Google Docs-style paper on gray background)
 *
 * This renderer is stateless per render call — it reads the document
 * model and produces canvas draw commands. No mutation of the model.
 */

import type {FreewriterDocument, PageSettings, Paragraph, TextRun, TextStyle,} from "../model/document.js";
import {DEFAULT_PAGE_SETTINGS, DEFAULT_PARAGRAPH_PROPS,} from "../model/document.js";

import {resolveStyle, TextMeasurer} from "../measurement/text-measurer.js";

// ─── Layout Types ────────────────────────────────────────────────────

/** A single word token with its resolved style and measured width */
interface StyledWord {
  text: string;
  style: TextStyle;
  width: number;
}

/** A laid-out line: an array of styled words that fit within the content width */
interface LayoutLine {
  words: StyledWord[];
  totalWidth: number;
  ascent: number;
  descent: number;
  lineHeight: number;
  spaceBefore: number;
  spaceAfter: number;
}

/** A laid-out page containing lines and its vertical position */
interface LayoutPage {
  lines: LayoutLine[];
  pageIndex: number;
}

// ─── Renderer Configuration ──────────────────────────────────────────

export interface RendererConfig {
  /** Background color behind all pages */
  backgroundColor: string;

  /** Color of the page "paper" */
  pageColor: string;

  /** Page shadow settings */
  pageShadow: {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };

  /** Gap between pages in CSS pixels */
  pageGap: number;

  /** Padding around the entire canvas area (top of first page) */
  canvasPadding: number;
}

const DEFAULT_RENDERER_CONFIG: Readonly<RendererConfig> = {
  backgroundColor: "#e8e8ec",
  pageColor: "#ffffff",
  pageShadow: {
    color: "rgba(0, 0, 0, 0.15)",
    blur: 12,
    offsetX: 0,
    offsetY: 2,
  },
  pageGap: 24,
  canvasPadding: 32,
} as const;

// ─── Canvas Renderer ─────────────────────────────────────────────────

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private measurer: TextMeasurer;
  private config: RendererConfig;
  private dpr: number = 1;

  constructor(
    canvas: HTMLCanvasElement,
    config?: Partial<RendererConfig>
  ) {
    this.canvas = canvas;

    const ctx = canvas.getContext("2d", {alpha: false});
    if (!ctx) {
      throw new Error("Failed to get 2D rendering context from canvas");
    }

    this.ctx = ctx;
    this.measurer = new TextMeasurer(ctx);
    this.config = {...DEFAULT_RENDERER_CONFIG, ...config};
  }

  /** The total height of the rendered content (for scroll containers) */
  private _totalHeight: number = 0;

  /** The total rendered height in CSS pixels */
  get totalHeight(): number {
    return this._totalHeight;
  }

  // ─── DPR Scaling ─────────────────────────────────────────────────

  /**
   * Configures the canvas backing store for the current Device Pixel Ratio.
   * This is critical for crisp text on Retina / HiDPI displays.
   *
   * The canvas element's CSS size stays the same, but its internal
   * resolution is multiplied by the DPR. All drawing is then scaled
   * so coordinates remain in CSS pixels.
   */
  setupDPR(width: number, height: number): void {
    this.dpr = window.devicePixelRatio || 1;

    // Set the canvas backing store to physical pixels
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);

    // Set the CSS display size
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    // Scale all drawing operations by DPR
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Clear font cache since context was reset
    this.measurer.clearCache();
  }

  // ─── Style Resolution ────────────────────────────────────────────

  /**
   * Renders the entire document onto the canvas.
   *
   * Call this method whenever the document changes or the canvas
   * needs to be redrawn (resize, scroll, etc.).
   */
  render(doc: FreewriterDocument): void {
    const pageSettings: PageSettings = {
      ...DEFAULT_PAGE_SETTINGS,
      ...doc.pageSettings,
    };

    const {canvasPadding, pageGap} = this.config;

    // Layout the document into pages
    const pages = this.layout(doc);
    const pageCount = Math.max(pages.length, 1);

    // Calculate total canvas height
    const totalHeight =
      canvasPadding * 2 +
      pageCount * pageSettings.height +
      (pageCount - 1) * pageGap;

    this._totalHeight = totalHeight;

    // Get CSS width from the canvas element's layout
    const cssWidth = this.canvas.clientWidth || this.canvas.offsetWidth || 800;

    // Setup DPR-aware canvas
    this.setupDPR(cssWidth, totalHeight);

    // Clear and draw background
    this.drawBackground(cssWidth, totalHeight);

    // Center pages horizontally
    const pageX = Math.max(
      canvasPadding,
      (cssWidth - pageSettings.width) / 2
    );

    // Draw each page
    for (const page of pages) {
      const pageY =
        canvasPadding +
        page.pageIndex * (pageSettings.height + pageGap);

      // Draw the page paper rectangle
      this.drawPageRect(pageX, pageY, pageSettings.width, pageSettings.height);

      // Draw lines within this page
      const contentX = pageX + pageSettings.marginLeft;
      let lineY = pageY + pageSettings.marginTop;

      for (const line of page.lines) {
        // Add paragraph space before this line
        lineY += line.spaceBefore;

        // Position baseline: advance by ascent portion of line height
        const leading = (line.lineHeight - line.ascent - line.descent) / 2;
        const baselineY = lineY + leading + line.ascent;

        this.drawLine(line, contentX, baselineY);

        lineY += line.lineHeight;

        // Add paragraph space after this line
        lineY += line.spaceAfter;
      }
    }
  }

  // ─── Layout Engine ───────────────────────────────────────────────

  /**
   * Resolves a TextRun's style by merging:
   * document default → DEFAULT_TEXT_STYLE → run overrides
   */
  private resolveRunStyle(
    run: TextRun,
    docDefault?: Partial<TextStyle>
  ): TextStyle {
    return resolveStyle({...docDefault, ...run.style});
  }

  /**
   * Tokenizes a paragraph's runs into StyledWords.
   * Each word carries its resolved style and measured width.
   */
  private tokenizeParagraph(
    paragraph: Paragraph,
    docDefault?: Partial<TextStyle>
  ): StyledWord[] {
    const words: StyledWord[] = [];

    for (const run of paragraph.runs) {
      const style = this.resolveRunStyle(run, docDefault);
      const measured = this.measurer.measureWords(run.text, style);

      for (const {word, width} of measured) {
        words.push({text: word, style, width});
      }
    }

    return words;
  }

  /**
   * Wraps an array of StyledWords into LayoutLines that fit
   * within the given content width. Uses a simple greedy
   * word-wrap algorithm (Phase 1 — Knuth-Plass comes later).
   */
  private wrapLines(
    words: StyledWord[],
    contentWidth: number,
    paragraph: Paragraph
  ): LayoutLine[] {
    const lines: LayoutLine[] = [];
    let currentLine: StyledWord[] = [];
    let currentWidth = 0;

    const lineHeightMultiplier =
      paragraph.lineHeight ?? DEFAULT_PARAGRAPH_PROPS.lineHeight;

    const firstLineIndent =
      paragraph.firstLineIndent ?? DEFAULT_PARAGRAPH_PROPS.firstLineIndent;

    let effectiveWidth = contentWidth - firstLineIndent;

    for (const word of words) {
      // Skip leading spaces on a new line
      if (currentLine.length === 0 && word.text === " ") {
        continue;
      }

      const wouldExceed = currentWidth + word.width > effectiveWidth;

      if (wouldExceed && currentLine.length > 0) {
        // Finalize current line
        lines.push(
          this.buildLayoutLine(currentLine, currentWidth, lineHeightMultiplier)
        );
        currentLine = [];
        currentWidth = 0;

        effectiveWidth = contentWidth;

        // Skip space at start of new line
        if (word.text === " ") continue;
      }

      currentLine.push(word);
      currentWidth += word.width;
    }

    // Finalize last line
    if (currentLine.length > 0) {
      lines.push(
        this.buildLayoutLine(currentLine, currentWidth, lineHeightMultiplier)
      );
    }

    return lines;
  }

  /**
   * Constructs a LayoutLine from words, computing max ascent/descent
   * across all styled words in the line.
   */
  private buildLayoutLine(
    words: StyledWord[],
    totalWidth: number,
    lineHeightMultiplier: number
  ): LayoutLine {
    let maxAscent = 0;
    let maxDescent = 0;

    for (const word of words) {
      const measurement = this.measurer.measure(word.text, word.style);
      maxAscent = Math.max(maxAscent, measurement.ascent);
      maxDescent = Math.max(maxDescent, measurement.descent);
    }

    const naturalHeight = maxAscent + maxDescent;
    const lineHeight = naturalHeight * lineHeightMultiplier;

    return {
      words,
      totalWidth,
      ascent: maxAscent,
      descent: maxDescent,
      lineHeight,
      spaceBefore: 0,
      spaceAfter: 0,
    };
  }

  // ─── Drawing ─────────────────────────────────────────────────────

  /**
   * Full layout pass: converts a Document into paginated LayoutPages.
   */
  private layout(doc: FreewriterDocument): LayoutPage[] {
    const pageSettings: PageSettings = {
      ...DEFAULT_PAGE_SETTINGS,
      ...doc.pageSettings,
    };

    const contentWidth =
      pageSettings.width - pageSettings.marginLeft - pageSettings.marginRight;
    const contentHeight =
      pageSettings.height - pageSettings.marginTop - pageSettings.marginBottom;

    const pages: LayoutPage[] = [];
    let currentPageLines: LayoutLine[] = [];
    let currentY = 0; // Y position within current page's content area

    const startNewPage = (): void => {
      pages.push({lines: currentPageLines, pageIndex: pages.length});
      currentPageLines = [];
      currentY = 0;
    };

    for (const paragraph of doc.paragraphs) {
      const spaceBefore =
        paragraph.spaceBefore ?? DEFAULT_PARAGRAPH_PROPS.spaceBefore;
      const spaceAfter =
        paragraph.spaceAfter ?? DEFAULT_PARAGRAPH_PROPS.spaceAfter;

      // Tokenize and wrap
      const words = this.tokenizeParagraph(paragraph, doc.defaultStyle);
      const lines = this.wrapLines(words, contentWidth, paragraph);

      // Attach paragraph spacing to the first and last lines
      const firstLine = lines[0];
      const lastLine = lines[lines.length - 1];
      if (firstLine) firstLine.spaceBefore = spaceBefore;
      if (lastLine) lastLine.spaceAfter = spaceAfter;

      for (const line of lines) {
        // Check if this line would overflow the current page
        if (currentY + line.spaceBefore + line.lineHeight > contentHeight && currentPageLines.length > 0) {
          startNewPage();
        }

        currentPageLines.push(line);
        currentY += line.spaceBefore + line.lineHeight + line.spaceAfter;
      }
    }

    // Push final page
    if (currentPageLines.length > 0) {
      pages.push({lines: currentPageLines, pageIndex: pages.length});
    }

    return pages;
  }

  /**
   * Draws the full background fill.
   */
  private drawBackground(width: number, height: number): void {
    this.ctx.fillStyle = this.config.backgroundColor;
    this.ctx.fillRect(0, 0, width, height);
  }

  /**
   * Draws a single page rectangle (paper + shadow).
   */
  private drawPageRect(
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const {pageShadow, pageColor} = this.config;

    // Shadow
    this.ctx.save();
    this.ctx.shadowColor = pageShadow.color;
    this.ctx.shadowBlur = pageShadow.blur;
    this.ctx.shadowOffsetX = pageShadow.offsetX;
    this.ctx.shadowOffsetY = pageShadow.offsetY;

    // Page paper
    this.ctx.fillStyle = pageColor;
    this.ctx.fillRect(x, y, width, height);

    this.ctx.restore();
  }

  // ─── Main Render ─────────────────────────────────────────────────

  /**
   * Draws a single line of text at the given position.
   */
  private drawLine(
    line: LayoutLine,
    x: number,
    baselineY: number
  ): void {
    let cursorX = x;

    for (const word of line.words) {
      this.measurer.applyFont(word.style);
      this.ctx.fillStyle = word.style.color;
      this.ctx.fillText(word.text, cursorX, baselineY);
      cursorX += word.width;
    }
  }
}
