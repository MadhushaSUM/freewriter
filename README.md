<p align="center">
  <img src="https://img.shields.io/badge/status-Phase%201-6c63ff?style=flat-square" alt="Status: Phase 1" />
  <img src="https://img.shields.io/badge/canvas-2D%20API-1a1a2e?style=flat-square" alt="Canvas 2D API" />
  <img src="https://img.shields.io/badge/typescript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript Strict" />
  <img src="https://img.shields.io/badge/license-open--source-34d399?style=flat-square" alt="Open Source" />
</p>

# Freewriter

A fully featured, pixel-perfect, open-source front-end word processor library built entirely on the **HTML5 Canvas 2D API**. It aims to provide rendering consistency across all browsers and devices — similar to how Google Docs works internally.

> **⚠️ Early Development** — Freewriter is in **Phase 1** (Foundation). The canvas rendering pipeline is functional, but user input, editing, and advanced typography are not yet implemented.

---

## Why Canvas?

Traditional web editors use `contenteditable` divs, which render differently across browsers. Freewriter takes a different approach: every character, cursor, and selection is drawn directly onto a `<canvas>` element using `ctx.fillText()` and `ctx.measureText()`. This gives us **complete control over every pixel**, enabling true cross-browser consistency.

---

## Architecture

Freewriter is organized as a **pnpm monorepo** with **Turborepo** for task orchestration:

```
freewriter/
├── packages/
│   ├── core/          → @freewriter/core   (pure TypeScript engine, zero deps)
│   └── react/         → @freewriter/react   (React wrapper component)
├── apps/
│   └── playground/    → Next.js 16 app for visual testing
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

### `@freewriter/core`

The pure TypeScript engine with **zero runtime dependencies**. Designed for future migration to Rust/WebAssembly if needed.

| Module | Description |
|--------|-------------|
| `model/` | Document data model — `FreewriterDocument`, `Paragraph`, `TextRun` interfaces |
| `measurement/` | Precise `ctx.measureText()` wrapper with font-string caching |
| `renderer/` | Canvas renderer — DPR scaling, greedy word-wrap, paginated layout |

### `@freewriter/react`

A React wrapper (`<FreewriterCanvas />`) that manages the canvas lifecycle, resize observation, and DPR change detection.

### `playground`

A Next.js application for rapid visual testing. Renders a hardcoded sample document with mixed typography (bold, italic, monospace) to verify the rendering pipeline.

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **pnpm** ≥ 9

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/freewriter.git
cd freewriter

# Install dependencies
pnpm install

# Build the packages
pnpm --filter @freewriter/core build
pnpm --filter @freewriter/react build

# Start the playground
pnpm --filter playground dev
```

Then open **http://localhost:3000** to see the canvas rendering pipeline in action.

---

## Development Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| **Phase 1** | Data model, Canvas rendering, DPR scaling | ✅ Complete |
| **Phase 2** | Hidden textarea input, caret, selection, coordinate mapping | 🔜 Next |
| **Phase 3** | Line breaking (Knuth-Plass), pagination, rich text recalculation | ⏳ Planned |
| **Phase 4** | Command pattern (undo/redo), inline objects, tables | ⏳ Planned |
| **Phase 5** | CRDT collaboration (Yjs/Automerge), PDF/HTML export | ⏳ Planned |

---

## Core Design Decisions

- **Strict Canvas-only rendering** — All text drawn via `ctx.fillText()`. No DOM text nodes, no `contenteditable`, no HTML-in-Canvas.
- **DPR-aware** — Canvas backing store scaled by `window.devicePixelRatio` for crisp text on Retina/HiDPI displays.
- **CRDT-compatible model** — `TextRun[]` array structure designed for future Yjs/Automerge integration.
- **Zero runtime dependencies** in `@freewriter/core` — keeps the engine portable and WASM-migration-ready.
- **Strict TypeScript** — `noUnusedLocals`, `noUncheckedIndexedAccess`, and full strict mode across all packages.

---

## Tech Stack

| Tool | Purpose |
|------|---------|
| TypeScript (strict) | All application logic |
| HTML5 Canvas 2D | Document rendering |
| React 19 | UI component layer |
| Next.js 16 | Playground app framework |
| pnpm workspaces | Monorepo package management |
| Turborepo | Build orchestration |

---

## Project Structure

```
packages/core/src/
├── model/
│   └── document.ts          # FreewriterDocument, Paragraph, TextRun, TextStyle
├── measurement/
│   └── text-measurer.ts     # ctx.measureText() wrapper with caching
├── renderer/
│   └── canvas-renderer.ts   # Main render loop with DPR, layout, pagination
└── index.ts                 # Barrel exports

packages/react/src/
├── FreewriterCanvas.tsx     # React ↔ Canvas bridge component
└── index.ts

apps/playground/src/app/
├── layout.tsx               # Root layout (Inter + JetBrains Mono fonts)
├── globals.css              # Dark theme design system
└── page.tsx                 # Hardcoded sample document + FreewriterCanvas
```

---

## Contributing

This project is in early development. Contributions, ideas, and feedback are welcome! Please open an issue to discuss before submitting large changes.

---

## License

Open source — license TBD.
