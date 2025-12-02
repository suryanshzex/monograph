# monograph

A small, single-page math graphing sandbox for playing with functions, derivatives, Taylor series, and special points. Built to feel like a minimal, high-frictionless graphing calculator.

## Features

- **Fast plotting**
  - Type functions like `sin(x)`, `x^3 - 2x`, `e^(x)`, `log(x)` etc.
  - Implicit multiplication: `2x`, `x(x+1)`, `3sin(x)` are all valid.
  - Parameterized functions with sliders: `a * sin(bx)` and more.

- **Command area (Cmd/Ctrl + K)**
  - `solve x^2 - 4 = 0`
  - `factor x^3 - 1`
  - `expand (x+1)^5`
  - `derivative sin(x)`
  - `integral x^2`
  - `integral from 0 to 1 of x^2`
  - `taylor e^x at 0 degree 5`
  - `plot x^2` — replaces the main plotted function

Results render inline with KaTeX. Long answers stay in a scrollable container, the input stays fixed.

- **Layers and styling**
  - Multiple function layers
  - Per-layer:
    - Color
    - Opacity
    - First derivative `f′(x)`
    - Second derivative `f″(x)`
    - Taylor series overlay with:
      - Center `a`
      - Degree slider
  - All layers share the same domain and y-range.

- **Smart sampling and ranges**
  - Adaptive sampling count based on display width
  - Robust y-range estimation that ignores extreme outliers
  - Auto-computed Taylor series sampled separately

- **Special points**
  - **Roots** of each function
  - **Extrema** using derivative sign changes
  - **Intersections** between functions
  - **Y-axis intercept** of the first function

All of the above can be toggled individually in the left panel.

- **Symbolic-friendly hovering**
  - Cursor HUD at bottom-right shows coordinates
  - For trig/log functions, coordinates try to display in terms of `π` / `e`
    - e.g. `π/2`, `-3π/4`, `e/2`, etc.
  - For non-trig/log functions, values are numeric

- **Manual points**
  - Alt-click on the graph to add a point
  - Drag points around
  - Drag + Shift to lock to an axis
  - Edit coordinates in the side panel
  - Points render as dark gray dots with white outlines

## Controls

### Mouse / touch

- **Pan**: click + drag (or touch drag)
- **Axis-locked pan**: drag + Shift
- **Zoom**: scroll wheel (zoom is centered around cursor)
- **Alt-click**: add a manual point at cursor
- **Drag manual point**: move it
- **Drag manual point + Shift**: lock motion to the nearest axis
- **Drag on curve**: pick a closest point on the first hit curve and trace it

### Keyboard

Global (when not focused in an input):

- `Cmd/Ctrl + K`: open/close command palette
- `S`: toggle settings drawer
- `C`: center view
- `+` / `-` or numpad `+` / `-`: zoom in/out

Inside the command palette:

- Esc: close palette
- The palette eats `Cmd/Ctrl + K` so it doesn’t re-trigger itself

## Settings drawer

Open via:

- Button: `settings`
- Shortcut: `S`

Per-function controls:

- Expression input (`sin(x)`, `x^2 + 1`, `a * sin(bx)`, …)
- Parameter sliders (auto-detected from identifiers like `a`, `b` that aren’t `x`)
- Graph opacity slider
- Graph color picker
- Toggles:
  - `f′(x)` — show first derivative
  - `f″(x)` — show second derivative
  - `show taylor` — show Taylor series overlay
- Taylor settings:
  - Degree slider
  - Center input (e.g. `0`, `pi/2`, `2`)

Global in the drawer:

- Add/remove function layers
- Validation errors for expressions

## Command palette details

Open via:

- `Cmd/Ctrl + K`
- `command` button in the header

The palette is a modal with an input box and a scrollable result area. It supports:

- Solving:
  - `solve x^2 - 4 = 0`
- Factoring:
  - `factor x^3 - 1`
- Expanding:
  - `expand (x+1)^5`
- Differentiation:
  - `derivative sin(x)`
- Integration:
  - `integral x^2`
  - `integral from 0 to 1 of x^2`
- Taylor:
  - `taylor e^x at 0 degree 5`
- Plotting:
  - `plot x^2` — applies to the primary graph

Some commands accept a `degree N` or `order N` suffix. If `N > 10`, the palette shows the message:

> `Max degree is 10`

and doesn’t try to over-approximate.

Rendering:

- All math is rendered with KaTeX
- The result area is scrollable; the input line stays in place
- Long LaTeX strings render inline without blowing up layout

## Coordinate display

The coordinate HUD and tooltips use a hybrid formatting:

- For trig/log functions (any layer whose expression mentions `sin`, `cos`, `tan`, `log`, `ln`, etc.):
  - Try to represent values as:
    - Rational multiples of `π` for x (e.g. `π/4`, `3π/2`, `-5π/6`)
    - Simple multiples/fractions of `e` for y
  - Fallback to numeric with 3 decimal places or exponential if very small/large

- For other functions:
  - Always numeric, 3 decimal places or exponential

Special cases:

- Origin: if the point is numerically “close enough” to `(0, 0)`, display exactly `(0, 0)`
- Axis intercepts:
  - X-axis: shown as roots
  - Y-axis: first function’s `f(0)` is sampled (if finite) and drawn in green at `(0, f(0))`

## Manual points panel

Left sidebar → “Manual points” section:

- Shows a list of custom points `P1`, `P2`, …
- Each row:
  - Tag: `P1`, `P2`, …
  - `x` input
  - `y` input
  - `remove` button
- Editing:
  - Inputs accept simple numeric expressions
  - Blur normalizes the value to a compact numeric string

Manual points are synced with the graph:

- Dragging a point updates the sidebar
- Sidebar edits update the rendered point

## Tech

- **Frontend**: React
- **Animation**: Framer Motion
- **Math rendering**: KaTeX
- **Expression parsing / evaluation**:
  - Custom expression pre-processing:
    - `e^x` → `exp(x)` when appropriate
    - Implicit multiplication
  - `buildMathFunctions` to compile:
    - `f(x)`
    - `f′(x)` (numeric derivative)
  - `taylorFromExpr` generates Taylor approximations

## Development

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Notes / quirks

- Y-axis intercept:
  - Always taken from the **first** function layer (if it exists and yields a finite `f(0)`)
- Taylor overlays:
  - Computed from the current layer’s expression, degree, and center
  - Rendered as a dashed curve on top of the function
- Command palette:
  - `plot ...` and math commands share the same pipeline
  - `plot` calls don’t stack new functions; they replace the primary one

## License

@suryanshzex
