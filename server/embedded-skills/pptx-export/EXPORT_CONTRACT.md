# Project PPTX Export Contract

This project-owned contract defines how the server-side agent exports the current HTML deck to PPTX.

## Goal

Create an editable-first PowerPoint deck from the supplied HTML deck. Use `pptxgenjs` as the generation library and write the final `.pptx` file to the exact path provided by the server prompt.

## Required Outputs

- Write the final PPTX to `export.pptx` or the exact path in the prompt.
- Write `export-summary.json` next to the PPTX with:
  - `summary`: concise Chinese summary of what was exported.
  - `slideCount`: number of slides exported when known.
  - `fallbacks`: optional list of non-editable fallback choices.

## Conversion Rules

- Prioritize editable-first output.
- Convert text to native PowerPoint text boxes with `addText`.
- Convert obvious rectangles, lines, and simple decorative blocks to native shapes.
- Convert identifiable tables to native tables when feasible.
- Convert simple charts or metric groups to native chart/table/shape compositions when feasible.
- Convert images to `addImage` using file paths or data URLs extracted from the HTML.
- Preserve slide order, slide dimensions, major layout relationships, colors, typography, and hierarchy.
- Treat animation as a static final visual state. Do not try to recreate browser animation timelines.
- Do not use a full-slide screenshot as the normal implementation. Use screenshot-like raster fallback only for elements that cannot reasonably be rebuilt as editable objects.
- Keep speaker-facing status and summary text in Chinese.

## Implementation Notes

- Read the current deck HTML from the path provided in the prompt.
- Use Node.js scripts inside the sandbox workspace.
- The repository has `pptxgenjs` available as a dependency.
- If CSS parsing is incomplete, infer layout from DOM attributes, inline styles, class names, and stable deck dimensions.
- Avoid reading local or global Claude/agent skill directories. This embedded contract is the authoritative source.
