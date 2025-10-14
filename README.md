# monograph

A fast, minimal graphing calculator and function explorer for the web.
- Plot multiple functions with per-layer color/opacity
- Toggle first and second derivatives
- Overlay a morphing Taylor polynomial around a chosen center
- See roots and extrema detected from the sampled curve
- Add and drag manual points, trace along curves, and snap to features
- Uniform zoom and pan with axis lock

## Quick start

Prereqs:
- Node 18+ recommended

Install and run:
```bash
npm ci
npm run dev
```

Build:
```bash
npm run build
```

## Features

- Multiple function layers
  - Color and opacity per layer
  - Optional f′(x) and f″(x)
  - Optional Taylor overlay with degree and center
- Discontinuity-aware rendering
  - Paths break only at true step jumps (e.g., floor/ceil integer steps)
  - Non-finite gaps (NaN/∞) restart the path without extra markers
  - Blank or numerically flat-zero layers are hidden
- Feature detection
  - Numeric roots (sign changes or exact zeros in the sampled path)
  - Numeric extrema (sign changes in f′(x))
  - Manual points you can add, drag, and snap with Shift
- Interactions
  - Pan: left-drag inside the plot
  - Zoom: mouse wheel (uniform), keyboard `+` and `-`
  - Axis lock while dragging: hold Shift
  - Center view: press `C`
  - Toggle Settings: press `S`
  - Add manual point: Alt-click inside the plot
  - Trace along a curve by dragging near it; hold Shift to snap to roots/extrema/y-intercept

## Expression syntax

Powered by a hardened mathjs evaluator with light normalization.

- Variable
  - `x` is the independent variable
- Parameters
  - Single-letter parameters (like `a`, `b`, `c`, …) are auto-detected and get sliders
  - `x`, `e`, and `pi` are reserved (not treated as parameters)
- Constants
  - `pi` (or `π`) and `e` (Euler’s number)
- Absolute value
  - `abs(x)` or `|x|` (bars normalize to `abs(...)`)
- Common functions
  - `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sqrt`, `abs`, `exp`, `log`, `ln`, `floor`, `ceil`, etc. (mathjs defaults)
- Operators
  - `+ - * / ^` and parentheses `(...)`

Tip: Functions like `exp(x^2)` grow extremely fast; zoom near the origin to see the central region clearly.

## UI overview

- Settings drawer (press `S`)
  - Function input (plain text)
  - Graph opacity and color
  - Toggles for f′(x), f″(x), and Taylor
  - Taylor degree slider and center input
- Stage
  - Uniform axes and grid (same units per pixel on both axes)
  - Curves, derivative overlays, and optional Taylor curve
  - Step discontinuities marked with open-circle endpoints

## Architecture

- `src/components/Graph.jsx`
  - Sampling, curve construction, feature detection, interactions
  - Discontinuity-aware path builder:
    - Only integer step jumps break the path and get open-circle markers
    - NaN/Infinity gaps restart the path without markers
    - Blank/numerically flat-zero layers are hidden

- `src/lib/math.js`
  - Normalization:
    - `|x|` → `abs(x)`, `π` → `pi`
  - Robust compilation and evaluation with fallback
  - Coercion of mathjs values (`BigNumber`, `Fraction`, `Complex`) to plain JS numbers for plotting
  - Symbolic derivative with a numeric fallback

- `src/lib/taylor.js`
  - Builds Taylor polynomials of configurable degree about a center `a`

- `src/lib/plot.js`
  - Sizing and inner plot rect constants

- `src/lib/format.js`
  - Smart number formatting utilities

## Known issues / tips

- Certain functions not being plotted
  - We know that certain functions like `exp(x^2)` which are rapidly growing near origin aren't being plotted

These will be fixed soon :)

## Troubleshooting

- “Nothing draws”
  - Ensure the input isn’t blank and that you've enclosed 'x' with parenthesis
  - Try a simple function like `sin(x)`
  - Zoom in if the function grows fast
- “I only see scattered dots”
  - You may be far from the finite region; zoom in or press `C` to center

## Credits

[@suryanshzex](https://github.com/suryanshzex)