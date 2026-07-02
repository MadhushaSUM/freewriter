# @freewriter/core — Architecture

> Pure TypeScript canvas-based word processor engine — zero runtime dependencies.
> **Status:** Phase 1 (Foundation) — static rendering, data model, DPR scaling.

---

## 1. High-Level Module Overview

The core package is split into three modules with a strict dependency hierarchy: the **model** defines data, the **measurement** reads the model to compute metrics, and the **renderer** orchestrates both to draw onto a canvas.

```mermaid
graph TD
    subgraph "@freewriter/core"
        INDEX["index.ts<br/><i>Barrel Exports</i>"]

        subgraph "model/"
            M_DOC["document.ts<br/><i>Interfaces & Defaults</i>"]
            M_IDX["index.ts"]
        end

        subgraph "measurement/"
            MS_TM["text-measurer.ts<br/><i>TextMeasurer class</i>"]
            MS_IDX["index.ts"]
        end

        subgraph "renderer/"
            R_CR["canvas-renderer.ts<br/><i>CanvasRenderer class</i>"]
            R_IDX["index.ts"]
        end
    end

    INDEX --> M_IDX
    INDEX --> MS_IDX
    INDEX --> R_IDX

    M_IDX --> M_DOC
    MS_IDX --> MS_TM
    R_IDX --> R_CR

    MS_TM -->|"imports types & defaults"| M_DOC
    R_CR -->|"imports types & defaults"| M_DOC
    R_CR -->|"imports TextMeasurer & resolveStyle"| MS_TM

    style INDEX fill:#6c63ff,color:#fff,stroke:#5a52d5
    style M_DOC fill:#34d399,color:#1a1a2e,stroke:#2ab383
    style MS_TM fill:#f59e0b,color:#1a1a2e,stroke:#d97706
    style R_CR fill:#ef4444,color:#fff,stroke:#dc2626
```

### Dependency Direction

```
model/  ← (no deps, pure data)
  ↑
measurement/  ← depends on model
  ↑
renderer/  ← depends on model + measurement
```

> [!IMPORTANT]
> The dependency flow is strictly **unidirectional**. `model/` has zero imports from other modules, making it the foundation layer. This design enables future migration of the layout engine to Rust/WASM without touching the data layer.

---

## 2. Document Data Model

The model layer ([document.ts](file:///home/madhusha-laksitha/Desktop/freewriter/packages/core/src/model/document.ts)) defines a hierarchical document tree with four levels:

```mermaid
classDiagram
    class FreewriterDocument {
        +title?: string
        +paragraphs: Paragraph[]
        +pageSettings?: PageSettings
        +defaultStyle?: Partial~TextStyle~
    }

    class Paragraph {
        +runs: TextRun[]
        +alignment?: ParagraphAlignment
        +lineHeight?: number
        +spaceBefore?: number
        +spaceAfter?: number
        +firstLineIndent?: number
    }

    class TextRun {
        +text: string
        +style?: Partial~TextStyle~
    }

    class TextStyle {
        +fontFamily: string
        +fontSize: number
        +fontWeight: FontWeight
        +fontStyle: FontStyle
        +color: string
        +textDecoration: TextDecoration
        +letterSpacing: number
    }

    class PageSettings {
        +width: number
        +height: number
        +marginTop: number
        +marginBottom: number
        +marginLeft: number
        +marginRight: number
    }

    FreewriterDocument "1" *-- "0..*" Paragraph : paragraphs
    FreewriterDocument "1" o-- "0..1" PageSettings : pageSettings
    FreewriterDocument "1" o-- "0..1" TextStyle : defaultStyle
    Paragraph "1" *-- "1..*" TextRun : runs
    TextRun "1" o-- "0..1" TextStyle : style
```

### Type Aliases

| Type | Values | Used By |
|------|--------|---------|
| `FontWeight` | `"normal"` \| `"bold"` | `TextStyle.fontWeight` |
| `FontStyle` | `"normal"` \| `"italic"` | `TextStyle.fontStyle` |
| `TextDecoration` | `"none"` \| `"underline"` \| `"line-through"` | `TextStyle.textDecoration` |
| `ParagraphAlignment` | `"left"` \| `"center"` \| `"right"` \| `"justify"` | `Paragraph.alignment` |

### Default Constants

| Constant | Key Defaults |
|----------|-------------|
| `DEFAULT_TEXT_STYLE` | Inter, 12pt, normal weight, `#1a1a2e` color |
| `DEFAULT_PARAGRAPH_PROPS` | left-aligned, 1.5× line height, 8pt space after |
| `DEFAULT_PAGE_SETTINGS` | US Letter (612×792 pt), 1-inch (72pt) margins |

---

## 3. Measurement Engine

The measurement layer ([text-measurer.ts](file:///home/madhusha-laksitha/Desktop/freewriter/packages/core/src/measurement/text-measurer.ts)) wraps the Canvas 2D `measureText()` API with caching and style resolution.

```mermaid
classDiagram
    class TextMeasurer {
        -ctx: CanvasRenderingContext2D
        -fontCache: Map~string, string~
        +constructor(ctx: CanvasRenderingContext2D)
        +getFontString(style: TextStyle): string
        +applyFont(style: TextStyle): void
        +measure(text: string, style: TextStyle): TextMeasurement
        +measureWords(text: string, style: TextStyle): Array
        +clearCache(): void
        -getCacheKey(style: TextStyle): string
    }

    class TextMeasurement {
        +width: number
        +ascent: number
        +descent: number
        +height: number
    }

    TextMeasurer ..> TextMeasurement : returns
    TextMeasurer ..> TextStyle : consumes
```

### Standalone Functions

| Function | Purpose |
|----------|---------|
| `resolveStyle(partial?)` | Merges a `Partial<TextStyle>` over `DEFAULT_TEXT_STYLE` |
| `buildFontString(style)` | Builds a CSS font shorthand — e.g. `"italic bold 16px Inter"` |

### Font Cache Strategy

The `TextMeasurer` maintains an in-memory `Map<string, string>` keyed by `fontFamily|fontSize|fontWeight|fontStyle`. This avoids rebuilding the CSS font string for repeated style combinations during layout and rendering passes.

---

## 4. Canvas Renderer

The renderer ([canvas-renderer.ts](file:///home/madhusha-laksitha/Desktop/freewriter/packages/core/src/renderer/canvas-renderer.ts)) is the largest module. It orchestrates a **layout → paginate → draw** pipeline.

```mermaid
classDiagram
    class CanvasRenderer {
        -canvas: HTMLCanvasElement
        -ctx: CanvasRenderingContext2D
        -measurer: TextMeasurer
        -config: RendererConfig
        -dpr: number
        -_totalHeight: number
        +constructor(canvas, config?)
        +get totalHeight(): number
        +setupDPR(width, height): void
        +render(doc: FreewriterDocument): void
        -resolveRunStyle(run, docDefault?): TextStyle
        -tokenizeParagraph(paragraph, docDefault?): StyledWord[]
        -wrapLines(words, contentWidth, paragraph): LayoutLine[]
        -buildLayoutLine(words, totalWidth, multiplier): LayoutLine
        -layout(doc): LayoutPage[]
        -drawBackground(width, height): void
        -drawPageRect(x, y, width, height): void
        -drawLine(line, x, baselineY): void
    }

    class RendererConfig {
        +backgroundColor: string
        +pageColor: string
        +pageShadow: ShadowConfig
        +pageGap: number
        +canvasPadding: number
    }

    class StyledWord {
        +text: string
        +style: TextStyle
        +width: number
    }

    class LayoutLine {
        +words: StyledWord[]
        +totalWidth: number
        +ascent: number
        +descent: number
        +lineHeight: number
    }

    class LayoutPage {
        +lines: LayoutLine[]
        +pageIndex: number
    }

    CanvasRenderer o-- RendererConfig
    CanvasRenderer *-- TextMeasurer : owns
    CanvasRenderer ..> LayoutPage : produces
    LayoutPage *-- LayoutLine
    LayoutLine *-- StyledWord
```

### Internal Layout Types

These types are internal to the renderer (not exported) and represent the intermediate layout state:

| Type | Purpose |
|------|---------|
| `StyledWord` | A single word token with resolved `TextStyle` and measured pixel width |
| `LayoutLine` | A sequence of `StyledWord`s that fit within the content width, with computed ascent/descent/lineHeight |
| `LayoutPage` | A collection of `LayoutLine`s assigned to a single page, with a page index |

---

## 5. Render Pipeline — Data Flow

The `render()` method orchestrates a multi-phase pipeline. The document model flows through layout, pagination, and finally draw calls:

```mermaid
flowchart TB
    DOC["FreewriterDocument"] --> RESOLVE["Style Resolution<br/><i>resolveRunStyle()</i>"]
    RESOLVE --> TOKEN["Tokenization<br/><i>tokenizeParagraph()</i>"]
    TOKEN --> WORDS["StyledWord[]<br/><i>words with resolved styles & widths</i>"]
    WORDS --> WRAP["Line Wrapping<br/><i>wrapLines() — greedy algorithm</i>"]
    WRAP --> LINES["LayoutLine[]<br/><i>lines that fit content width</i>"]
    LINES --> PAGINATE["Pagination<br/><i>layout() — page break detection</i>"]
    PAGINATE --> PAGES["LayoutPage[]<br/><i>lines assigned to pages</i>"]
    PAGES --> DPR["DPR Scaling<br/><i>setupDPR()</i>"]
    DPR --> DRAW_BG["Draw Background<br/><i>drawBackground()</i>"]
    DRAW_BG --> DRAW_PAGE["Draw Page Rects<br/><i>drawPageRect() — paper + shadow</i>"]
    DRAW_PAGE --> DRAW_LINE["Draw Text Lines<br/><i>drawLine() — fillText per word</i>"]
    DRAW_LINE --> CANVAS["Canvas Output 🖼️"]

    style DOC fill:#34d399,color:#1a1a2e
    style WORDS fill:#f59e0b,color:#1a1a2e
    style LINES fill:#f59e0b,color:#1a1a2e
    style PAGES fill:#f59e0b,color:#1a1a2e
    style CANVAS fill:#6c63ff,color:#fff
```

### Pipeline Phases in Detail

#### Phase A: Style Resolution
Each `TextRun.style` (partial) is merged with the document's `defaultStyle` and the global `DEFAULT_TEXT_STYLE` to produce a fully-resolved `TextStyle`.

#### Phase B: Tokenization
Paragraphs are split into word-level tokens. Each run's text is split by spaces (preserving spaces as separate tokens). Each token is measured using `TextMeasurer.measureWords()`.

#### Phase C: Line Wrapping (Greedy)
A greedy word-wrap algorithm fits `StyledWord`s into lines within the content width (`pageWidth - marginLeft - marginRight`). First-line indent is applied on the first line of each paragraph.

#### Phase D: Pagination
Lines are assigned to pages. When accumulated line heights exceed the content height (`pageHeight - marginTop - marginBottom`), a new page is started. Paragraph spacing (`spaceBefore`, `spaceAfter`) is accounted for.

#### Phase E: Drawing
1. **`setupDPR()`** — Configures the canvas backing store to `width × DPR` physical pixels, sets CSS dimensions, and applies a DPR scale transform.
2. **`drawBackground()`** — Fills the entire canvas with `backgroundColor`.
3. **`drawPageRect()`** — For each page, draws a white rectangle with a drop shadow (Google Docs-style paper).
4. **`drawLine()`** — For each line, iterates over words and calls `ctx.fillText()` with the word's style and color.

---

## 6. DPR (Device Pixel Ratio) Scaling

```mermaid
flowchart LR
    subgraph "CSS Pixels (Logical)"
        CSS["width × height"]
    end

    subgraph "Physical Pixels (Backing Store)"
        PHYS["width × DPR  ×  height × DPR"]
    end

    CSS -->|"canvas.width = round(w × dpr)"| PHYS
    PHYS -->|"ctx.setTransform(dpr, 0, 0, dpr, 0, 0)"| DRAW["All draw calls in CSS px"]

    style CSS fill:#3b82f6,color:#fff
    style PHYS fill:#ef4444,color:#fff
    style DRAW fill:#34d399,color:#1a1a2e
```

The canvas element's CSS size stays unchanged, but the internal resolution is multiplied by `window.devicePixelRatio`. A scale transform maps all drawing coordinates back to CSS pixel space, producing crisp text on Retina/HiDPI displays.

---

## 7. Public API Surface

Everything exported from [index.ts](file:///home/madhusha-laksitha/Desktop/freewriter/packages/core/src/index.ts):

### Type Exports

| Export | From | Description |
|--------|------|-------------|
| `TextStyle` | model | Full styling for a text run |
| `FontWeight` | model | `"normal"` \| `"bold"` |
| `FontStyle` | model | `"normal"` \| `"italic"` |
| `TextDecoration` | model | `"none"` \| `"underline"` \| `"line-through"` |
| `TextRun` | model | Atomic unit of styled text |
| `Paragraph` | model | Array of runs with paragraph formatting |
| `ParagraphAlignment` | model | `"left"` \| `"center"` \| `"right"` \| `"justify"` |
| `PageSettings` | model | Page dimensions and margins |
| `FreewriterDocument` | model | Top-level document |
| `TextMeasurement` | measurement | Result of measuring text |
| `RendererConfig` | renderer | Renderer appearance configuration |

### Value Exports

| Export | From | Description |
|--------|------|-------------|
| `DEFAULT_TEXT_STYLE` | model | Fallback text style constant |
| `DEFAULT_PARAGRAPH_PROPS` | model | Fallback paragraph properties |
| `DEFAULT_PAGE_SETTINGS` | model | US Letter page defaults |
| `TextMeasurer` | measurement | Measurement class |
| `buildFontString` | measurement | CSS font shorthand builder |
| `resolveStyle` | measurement | Partial → full `TextStyle` resolver |
| `CanvasRenderer` | renderer | Main rendering engine class |

---

## 8. File Tree

```
packages/core/
├── package.json                    # @freewriter/core — v0.0.1, zero deps
├── tsconfig.json                   # Extends ../../tsconfig.base.json
├── src/
│   ├── index.ts                    # Barrel re-exports from all modules
│   ├── model/
│   │   ├── index.ts                # Re-exports from document.ts
│   │   └── document.ts             # FreewriterDocument, Paragraph, TextRun, TextStyle,
│   │                               # PageSettings, and all default constants
│   ├── measurement/
│   │   ├── index.ts                # Re-exports from text-measurer.ts
│   │   └── text-measurer.ts        # TextMeasurer class, buildFontString(), resolveStyle()
│   └── renderer/
│       ├── index.ts                # Re-exports from canvas-renderer.ts
│       └── canvas-renderer.ts      # CanvasRenderer class — layout engine + draw calls
└── dist/                           # Compiled output (tsc)
```

---

## 9. Integration: How Core Is Consumed

```mermaid
graph TB
    subgraph "packages/core"
        CORE["@freewriter/core<br/><i>Engine</i>"]
    end

    subgraph "packages/react"
        REACT["@freewriter/react<br/><i>FreewriterCanvas component</i>"]
    end

    subgraph "apps/playground"
        PLAY["Next.js 16 App<br/><i>Visual testing</i>"]
    end

    CORE -->|"imported by"| REACT
    REACT -->|"imported by"| PLAY

    style CORE fill:#6c63ff,color:#fff
    style REACT fill:#3b82f6,color:#fff
    style PLAY fill:#34d399,color:#1a1a2e
```

- **`@freewriter/react`** imports `CanvasRenderer` and model types to create a `<FreewriterCanvas />` React component that manages the canvas lifecycle, resize observation, and DPR change detection.
- **`apps/playground`** imports the React wrapper and renders a hardcoded sample document for visual testing.

---

## 10. Design Principles & Constraints

| Principle | Detail |
|-----------|--------|
| **Zero runtime deps** | `package.json` has only `devDependencies` (TypeScript). The engine is fully self-contained. |
| **Strict TypeScript** | `noUnusedLocals`, `noUncheckedIndexedAccess`, full strict mode via `tsconfig.base.json`. |
| **Stateless rendering** | `render()` reads the document and produces canvas commands — no model mutation. |
| **CRDT-compatible model** | `TextRun[]` array structure designed for future Yjs/Automerge integration. |
| **WASM-migration ready** | Pure TS engine with no DOM dependencies in model/measurement layers. |
| **Canvas-only rendering** | All text drawn via `ctx.fillText()`. No DOM text nodes, no `contenteditable`. |

---

## 11. Current Limitations (Phase 1)

- **No user input** — No caret, selection, or keyboard handling
- **Greedy word-wrap only** — Knuth-Plass line breaking planned for Phase 3
- **No undo/redo** — Command pattern planned for Phase 4
- **No collaboration** — CRDT integration planned for Phase 5
- **No export** — PDF/HTML export planned for Phase 5
- **Left-alignment only** — `alignment` property exists in the model but center/right/justify are not yet implemented in the renderer
- **No text decoration rendering** — `textDecoration` is modeled but underline/strikethrough are not drawn
