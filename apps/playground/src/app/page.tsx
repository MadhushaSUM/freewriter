"use client";

import {useEffect, useState} from "react";
import {FreewriterCanvas} from "@freewriter/react";
import type {FreewriterDocument} from "@freewriter/core";

/**
 * Hardcoded sample document to verify the canvas rendering pipeline.
 * Contains multiple paragraphs with mixed styling (bold, italic,
 * different sizes) to exercise the layout engine thoroughly.
 */
const sampleDocument: FreewriterDocument = {
  title: "Freewriter — Rendering Pipeline Test",
  pageSettings: {
    width: 612,
    height: 792,
    marginTop: 72,
    marginBottom: 72,
    marginLeft: 72,
    marginRight: 72,
  },
  defaultStyle: {
    fontFamily: "Inter",
    fontSize: 13,
    color: "#1a1a2e",
  },
  paragraphs: [
    // ── Title ──
    {
      runs: [
        {
          text: "The Art of Canvas Typography",
          style: {
            fontSize: 28,
            fontWeight: "bold",
            color: "#0f0f14",
          },
        },
      ],
      alignment: "left",
      lineHeight: 1.3,
      spaceBefore: 0,
      spaceAfter: 6,
    },
    // ── Subtitle ──
    {
      runs: [
        {
          text: "Building a Pixel-Perfect Word Processor from Scratch",
          style: {
            fontSize: 15,
            color: "#6c63ff",
            fontStyle: "italic",
          },
        },
      ],
      alignment: "left",
      lineHeight: 1.4,
      spaceBefore: 0,
      spaceAfter: 24,
    },
    // ── Body paragraph 1 ──
    {
      runs: [
        {
          text: "Freewriter is an ambitious open-source project that renders documents entirely on an ",
          style: {fontSize: 13},
        },
        {
          text: "HTML5 Canvas",
          style: {fontSize: 13, fontWeight: "bold"},
        },
        {
          text: " using the 2D rendering context. Unlike traditional web editors that rely on ",
          style: {fontSize: 13},
        },
        {
          text: "contenteditable",
          style: {fontSize: 13, fontStyle: "italic"},
        },
        {
          text: " divs or DOM manipulation, Freewriter draws every character, cursor, and selection rectangle directly onto the canvas — achieving pixel-perfect consistency across all browsers and devices.",
          style: {fontSize: 13},
        },
      ],
      lineHeight: 1.65,
      spaceAfter: 14,
    },
    // ── Section heading ──
    {
      runs: [
        {
          text: "Why Canvas?",
          style: {
            fontSize: 18,
            fontWeight: "bold",
            color: "#1a1a2e",
          },
        },
      ],
      lineHeight: 1.3,
      spaceBefore: 8,
      spaceAfter: 10,
    },
    // ── Body paragraph 2 ──
    {
      runs: [
        {
          text: "The DOM is inherently inconsistent. Different browsers render fonts, line heights, and whitespace differently. The ",
          style: {fontSize: 13},
        },
        {
          text: "Canvas API",
          style: {fontSize: 13, fontWeight: "bold"},
        },
        {
          text: " gives us complete control over every pixel. We use ",
          style: {fontSize: 13},
        },
        {
          text: "ctx.measureText()",
          style: {
            fontSize: 12,
            fontFamily: "JetBrains Mono",
            color: "#6c63ff",
          },
        },
        {
          text: " to compute exact glyph widths, and ",
          style: {fontSize: 13},
        },
        {
          text: "ctx.fillText()",
          style: {
            fontSize: 12,
            fontFamily: "JetBrains Mono",
            color: "#6c63ff",
          },
        },
        {
          text: " to render each character at precisely the right position. This approach mirrors how professional desktop applications like Microsoft Word and Google Docs work internally.",
          style: {fontSize: 13},
        },
      ],
      lineHeight: 1.65,
      spaceAfter: 14,
    },
    // ── Section heading 2 ──
    {
      runs: [
        {
          text: "Architecture Overview",
          style: {
            fontSize: 18,
            fontWeight: "bold",
            color: "#1a1a2e",
          },
        },
      ],
      lineHeight: 1.3,
      spaceBefore: 8,
      spaceAfter: 10,
    },
    // ── Body paragraph 3 ──
    {
      runs: [
        {
          text: "The project is organized as a monorepo with three main packages. The ",
          style: {fontSize: 13},
        },
        {
          text: "@freewriter/core",
          style: {
            fontSize: 12,
            fontFamily: "JetBrains Mono",
            fontWeight: "bold",
            color: "#6c63ff",
          },
        },
        {
          text: " package contains the pure TypeScript engine — data models, mathematical layout calculations, and canvas rendering commands. It has zero runtime dependencies and is designed to be framework-agnostic.",
          style: {fontSize: 13},
        },
      ],
      lineHeight: 1.65,
      spaceAfter: 14,
    },
    // ── Body paragraph 4 ──
    {
      runs: [
        {
          text: "The document model follows a simple hierarchy: a ",
          style: {fontSize: 13},
        },
        {
          text: "Document",
          style: {fontSize: 13, fontWeight: "bold"},
        },
        {
          text: " contains an ordered list of ",
          style: {fontSize: 13},
        },
        {
          text: "Paragraphs",
          style: {fontSize: 13, fontWeight: "bold"},
        },
        {
          text: ", each of which contains one or more ",
          style: {fontSize: 13},
        },
        {
          text: "TextRuns",
          style: {fontSize: 13, fontWeight: "bold", fontStyle: "italic"},
        },
        {
          text: ". A TextRun is the atomic unit — a contiguous sequence of characters that share identical styling. This structure is intentionally compatible with ",
          style: {fontSize: 13},
        },
        {
          text: "CRDTs",
          style: {fontSize: 13, fontWeight: "bold"},
        },
        {
          text: " for future real-time collaboration support.",
          style: {fontSize: 13},
        },
      ],
      lineHeight: 1.65,
      spaceAfter: 14,
    },
    // ── Section heading 3 ──
    {
      runs: [
        {
          text: "Device Pixel Ratio & Crisp Text",
          style: {
            fontSize: 18,
            fontWeight: "bold",
            color: "#1a1a2e",
          },
        },
      ],
      lineHeight: 1.3,
      spaceBefore: 8,
      spaceAfter: 10,
    },
    // ── Body paragraph 5 ──
    {
      runs: [
        {
          text: "One of the first challenges in canvas rendering is achieving crisp, non-blurry text on high-DPI displays. Modern screens (Retina, 4K) have a device pixel ratio (DPR) greater than 1, meaning each CSS pixel maps to multiple physical pixels. Without proper handling, canvas text appears fuzzy and unprofessional.",
          style: {fontSize: 13},
        },
      ],
      lineHeight: 1.65,
      spaceAfter: 14,
    },
    // ── Body paragraph 6 ──
    {
      runs: [
        {
          text: "Freewriter solves this by scaling the canvas backing store by ",
          style: {fontSize: 13},
        },
        {
          text: "window.devicePixelRatio",
          style: {
            fontSize: 12,
            fontFamily: "JetBrains Mono",
            color: "#6c63ff",
          },
        },
        {
          text: " while keeping the CSS display size unchanged. All drawing operations are then scaled inversely, so coordinates remain in logical CSS pixels while the actual rendering happens at full physical resolution. The result is beautifully sharp text that rivals native applications.",
          style: {fontSize: 13},
        },
      ],
      lineHeight: 1.65,
      spaceAfter: 14,
    },
    // ── Closing note ──
    {
      runs: [
        {
          text: "This document is rendered entirely on Canvas — no DOM text nodes, no contenteditable, no HTML-in-Canvas tricks. Every word you see was drawn with fillText().",
          style: {
            fontSize: 12,
            fontStyle: "italic",
            color: "#9898a8",
          },
        },
      ],
      lineHeight: 1.5,
      spaceBefore: 12,
      spaceAfter: 0,
    },
  ],
};

export default function PlaygroundPage() {
  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    setDpr(window.devicePixelRatio || 1);
  }, []);

  return (
    <main className="app-shell" id="playground-main">
      {/* ── Top Bar ──────────────────────────────────────────────── */}
      <header className="topbar" id="topbar">
        <div className="topbar-left">
          <div className="topbar-logo">
            <div className="topbar-logo-icon" aria-hidden="true">
              Fw
            </div>
            <span className="topbar-logo-text">Freewriter</span>
          </div>
          <div className="topbar-divider" aria-hidden="true"/>
          <span className="topbar-doc-title">Rendering Pipeline Test</span>
        </div>
        <div className="topbar-right">
          <span className="topbar-badge">
            <span className="topbar-badge-dot" aria-hidden="true"/>
            Phase 1 — Canvas Foundation
          </span>
          <span className="topbar-status">
            <span className="topbar-status-dot" aria-hidden="true"/>
            Ready
          </span>
        </div>
      </header>

      {/* ── Canvas Editor Area ───────────────────────────────────── */}
      <section className="editor-area" id="editor-area">
        <div className="canvas-container">
          <FreewriterCanvas document={sampleDocument}/>
        </div>
      </section>

      {/* ── Bottom Bar ───────────────────────────────────────────── */}
      <footer className="bottombar" id="bottombar">
        <div className="bottombar-section">
          <span className="bottombar-item">
            {sampleDocument.paragraphs.length} paragraphs
          </span>
          <span className="bottombar-item">
            US Letter (8.5&quot; × 11&quot;)
          </span>
        </div>
        <div className="bottombar-section">
          <span className="bottombar-item bottombar-item--accent">
            Canvas 2D
          </span>
          <span className="bottombar-item">
            DPR: {dpr}×
          </span>
        </div>
      </footer>
    </main>
  );
}
