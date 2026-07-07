/**
 * @freewriter/core — Keyboard Shortcuts
 *
 * Implements the Strategy pattern for keyboard shortcut handling.
 * Provides a registry of keyboard actions and a resolver that matches
 * incoming KeyboardEvent objects to registered actions.
 *
 * Easily extensible: future phases can add formatting shortcuts
 * (Ctrl+B for bold, Ctrl+I for italic) without modifying existing code.
 */

import type {EditorState} from "../state/editor-state.js";
import type {LayoutIndex} from "../layout/layout-index.js";

// ─── Types ───────────────────────────────────────────────────────────

/** A keyboard action binding */
export interface KeyboardAction {
  /** The key value (e.g., 'ArrowLeft', 'a', 'Backspace') */
  key: string;

  /** Whether Ctrl (or Cmd on Mac) must be pressed */
  ctrl?: boolean;

  /** Whether Shift must be pressed */
  shift?: boolean;

  /** Whether Alt must be pressed */
  alt?: boolean;

  /** The action to execute when the shortcut matches */
  action: (state: EditorState, layoutIndex: LayoutIndex) => void;

  /** If true, prevent the browser's default behavior */
  preventDefault?: boolean;
}

// ─── Default Shortcuts ───────────────────────────────────────────────

/**
 * The default keyboard shortcut map for Phase 2.
 * Covers cursor movement, selection, deletion, and paragraph breaks.
 */
export const DEFAULT_SHORTCUTS: KeyboardAction[] = [
  // ── Cursor Movement ──
  {
    key: "ArrowLeft",
    action: (state) => state.moveCursor("left"),
    preventDefault: true,
  },
  {
    key: "ArrowRight",
    action: (state) => state.moveCursor("right"),
    preventDefault: true,
  },
  {
    key: "ArrowUp",
    action: (state, layoutIndex) => {
      const rect = layoutIndex.getCharacterRect(state.cursor);
      const preferredX = state.preferredX ?? rect?.x ?? 0;
      const above = layoutIndex.getPositionAbove(state.cursor, preferredX);
      if (above) {
        state.setCursor(above);
        state.setPreferredX(preferredX);
      }
    },
    preventDefault: true,
  },
  {
    key: "ArrowDown",
    action: (state, layoutIndex) => {
      const rect = layoutIndex.getCharacterRect(state.cursor);
      const preferredX = state.preferredX ?? rect?.x ?? 0;
      const below = layoutIndex.getPositionBelow(state.cursor, preferredX);
      if (below) {
        state.setCursor(below);
        state.setPreferredX(preferredX);
      }
    },
    preventDefault: true,
  },

  // ── Selection Extending ──
  {
    key: "ArrowLeft",
    shift: true,
    action: (state) => state.extendSelection("left"),
    preventDefault: true,
  },
  {
    key: "ArrowRight",
    shift: true,
    action: (state) => state.extendSelection("right"),
    preventDefault: true,
  },
  {
    key: "ArrowUp",
    shift: true,
    action: (state, layoutIndex) => {
      const rect = layoutIndex.getCharacterRect(state.cursor);
      const preferredX = state.preferredX ?? rect?.x ?? 0;
      const above = layoutIndex.getPositionAbove(state.cursor, preferredX);
      if (above) {
        state.extendSelectionTo(above);
        state.setPreferredX(preferredX);
      }
    },
    preventDefault: true,
  },
  {
    key: "ArrowDown",
    shift: true,
    action: (state, layoutIndex) => {
      const rect = layoutIndex.getCharacterRect(state.cursor);
      const preferredX = state.preferredX ?? rect?.x ?? 0;
      const below = layoutIndex.getPositionBelow(state.cursor, preferredX);
      if (below) {
        state.extendSelectionTo(below);
        state.setPreferredX(preferredX);
      }
    },
    preventDefault: true,
  },

  // ── Home / End ──
  {
    key: "Home",
    action: (state, layoutIndex) => {
      const lineStart = layoutIndex.getLineStart(state.cursor);
      state.setCursor(lineStart);
    },
    preventDefault: true,
  },
  {
    key: "End",
    action: (state, layoutIndex) => {
      const lineEnd = layoutIndex.getLineEnd(state.cursor);
      state.setCursor(lineEnd);
    },
    preventDefault: true,
  },
  {
    key: "Home",
    shift: true,
    action: (state, layoutIndex) => {
      const lineStart = layoutIndex.getLineStart(state.cursor);
      state.extendSelectionTo(lineStart);
    },
    preventDefault: true,
  },
  {
    key: "End",
    shift: true,
    action: (state, layoutIndex) => {
      const lineEnd = layoutIndex.getLineEnd(state.cursor);
      state.extendSelectionTo(lineEnd);
    },
    preventDefault: true,
  },

  // ── Deletion ──
  {
    key: "Backspace",
    action: (state) => state.deleteBackward(),
    preventDefault: true,
  },
  {
    key: "Delete",
    action: (state) => state.deleteForward(),
    preventDefault: true,
  },

  // ── Paragraph Break ──
  {
    key: "Enter",
    action: (state) => state.insertParagraphBreak(),
    preventDefault: true,
  },

  // ── Select All ──
  {
    key: "a",
    ctrl: true,
    action: (state) => state.selectAll(),
    preventDefault: true,
  },
];

// ─── Shortcut Resolver ───────────────────────────────────────────────

/**
 * Resolves keyboard events against a registry of shortcuts.
 * Uses the Strategy pattern — the resolver is parameterized by
 * the list of actions, making it easy to swap or extend shortcuts.
 */
export class ShortcutResolver {
  private readonly shortcuts: KeyboardAction[];

  constructor(shortcuts: KeyboardAction[] = DEFAULT_SHORTCUTS) {
    this.shortcuts = shortcuts;
  }

  /**
   * Attempts to match a KeyboardEvent to a registered shortcut.
   * Returns the matching action, or null if no match is found.
   *
   * Matching logic:
   * - Key must match exactly (case-insensitive for single characters)
   * - Modifier keys (Ctrl/Cmd, Shift, Alt) must match exactly
   * - More specific shortcuts (with more modifiers) are matched first
   */
  match(event: KeyboardEvent): KeyboardAction | null {
    const isCtrl = event.ctrlKey || event.metaKey; // Cmd on Mac
    const isShift = event.shiftKey;
    const isAlt = event.altKey;

    // Find all matching shortcuts, preferring more specific matches
    let bestMatch: KeyboardAction | null = null;
    let bestSpecificity = -1;

    for (const shortcut of this.shortcuts) {
      // Key must match
      if (shortcut.key.toLowerCase() !== event.key.toLowerCase()) continue;

      // Modifier matching: each required modifier must be present,
      // and each unrequired modifier must be absent
      const ctrlRequired = shortcut.ctrl ?? false;
      const shiftRequired = shortcut.shift ?? false;
      const altRequired = shortcut.alt ?? false;

      if (ctrlRequired !== isCtrl) continue;
      if (shiftRequired !== isShift) continue;
      if (altRequired !== isAlt) continue;

      // Calculate specificity (more modifiers = more specific)
      let specificity = 0;
      if (ctrlRequired) specificity++;
      if (shiftRequired) specificity++;
      if (altRequired) specificity++;

      if (specificity > bestSpecificity) {
        bestSpecificity = specificity;
        bestMatch = shortcut;
      }
    }

    return bestMatch;
  }
}
