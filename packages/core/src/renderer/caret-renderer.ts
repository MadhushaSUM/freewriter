/**
 * @freewriter/core — Caret Renderer
 *
 * Renders a blinking cursor (caret) on the canvas. The blink animation
 * is driven by requestAnimationFrame for smooth, battery-efficient
 * toggling.
 *
 * Follows standard editor behavior:
 * - Caret is visible immediately on any user input (resetBlink)
 * - Blinks at ~530ms intervals (matching typical OS cursors)
 * - Stops blinking when the editor loses focus
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface CaretStyle {
  /** Caret color (CSS color string). Default: '#1a1a2e' */
  color: string;

  /** Caret width in CSS pixels. Default: 1.5 */
  width: number;

  /** Blink interval in milliseconds. Default: 530 */
  blinkRate: number;
}

const DEFAULT_CARET_STYLE: Readonly<CaretStyle> = {
  color: "#1a1a2e",
  width: 1.5,
  blinkRate: 530,
} as const;

// ─── Caret Renderer ─────────────────────────────────────────────────

export class CaretRenderer {
  private readonly style: CaretStyle;

  /** Whether the caret is currently visible (blink state) */
  private visible = true;

  /** Timestamp of the last blink toggle */
  private lastToggle = 0;

  /** Whether the blink animation is active */
  private blinking = false;

  /** The requestAnimationFrame ID */
  private animationFrameId: number | null = null;

  /** Current caret position and dimensions (set externally before draw) */
  private caretX = 0;
  private caretY = 0;
  private caretHeight = 0;

  /** Callback invoked on each blink frame (triggers a re-draw) */
  onBlinkFrame: (() => void) | null = null;

  constructor(style?: Partial<CaretStyle>) {
    this.style = {...DEFAULT_CARET_STYLE, ...style};
  }

  // ─── Position ─────────────────────────────────────────────────────

  /**
   * Updates the caret's position and dimensions.
   * Does NOT trigger a re-draw — call draw() separately.
   */
  setPosition(x: number, y: number, height: number): void {
    this.caretX = x;
    this.caretY = y;
    this.caretHeight = height;
  }

  // ─── Animation ────────────────────────────────────────────────────

  /**
   * Starts the blink animation loop.
   * The caret will toggle visibility at the configured blink rate.
   */
  startBlinking(): void {
    if (this.blinking) return;

    this.blinking = true;
    this.visible = true;
    this.lastToggle = performance.now();

    const tick = (now: number): void => {
      if (!this.blinking) return;

      const elapsed = now - this.lastToggle;
      if (elapsed >= this.style.blinkRate) {
        this.visible = !this.visible;
        this.lastToggle = now;
        this.onBlinkFrame?.();
      }

      this.animationFrameId = requestAnimationFrame(tick);
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  /**
   * Stops the blink animation and hides the caret.
   */
  stopBlinking(): void {
    this.blinking = false;
    this.visible = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Resets the blink cycle — makes the caret solid (visible) for
   * one full blink period. Called on every user input so the caret
   * is always visible while typing.
   */
  resetBlink(): void {
    this.visible = true;
    this.lastToggle = performance.now();
  }

  // ─── Drawing ──────────────────────────────────────────────────────

  /**
   * Draws the caret onto the given canvas context if it's currently visible.
   * Should be called at the end of every render pass (after text drawing).
   */
  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.visible || this.caretHeight === 0) return;

    ctx.save();
    ctx.fillStyle = this.style.color;
    ctx.fillRect(
      this.caretX,
      this.caretY,
      this.style.width,
      this.caretHeight
    );
    ctx.restore();
  }

  // ─── Cleanup ──────────────────────────────────────────────────────

  /**
   * Disposes of the caret renderer, stopping all animations.
   */
  dispose(): void {
    this.stopBlinking();
    this.onBlinkFrame = null;
  }
}
