# Design Tokens Spec

Status: stable · Source of truth is `/packages/design-tokens/src/*.json`
(W3C Design Tokens format). Style Dictionary compiles to CSS, React Native,
and Figma variables (CLAUDE.md §7).

## Two layers — non-negotiable

1. **Primitives** — raw values. No semantic meaning. `--blue-600`, `--space-4`.
2. **Semantic** — purpose-bound, reference primitives. `--color-action-primary`.

**Components reference semantic tokens ONLY.** A component that uses
`--blue-600` directly is a bug. This is what makes dark mode, density modes, and
rebrands a token change instead of a component rewrite.

## Mode swaps

Override **semantic tokens only**, never primitives:
- `[data-theme="dark"]` — dark mode
- `[data-density="compact"]` — HR ops; comfortable is default (ESS)

## Arabic adjustment

Arabic needs ~105–110% of the Latin size for equal visual weight. Token it:
`--font-size-arabic-adjust: 1.075`. Components multiply base size by the active
adjust token; never hardcode per-language sizes.

## Primitive set (summary — see src for full scale)

```
color:   blue|gray|red|green|orange  × 50…900/1000
space:   1=4px 2=8px 3=12px 4=16px 5=24px 6=32px 7=48px 8=64px 9=96px
radius:  sm=4 md=8 lg=12 xl=16 full=999
font:    family-en, family-ar, size xs…3xl, weight 400/500/600/700,
         line-height tight=1.2 normal=1.5, arabic-adjust=1.075
elev:    0…3 (shadow tuples)
motion:  instant=80 fast=150 medium=250 slow=400 ms; ease-out, ease-emphasized
```

## Semantic set (summary)

```
text:    primary secondary tertiary disabled inverse success warning danger link
bg:      canvas surface surface-raised surface-sunken overlay
         success-soft warning-soft danger-soft
border:  subtle default strong focus danger
action:  primary primary-hover primary-active destructive
space:   component-{xs,sm,md,lg}  layout-{sm,md,lg}
```

## Distribution

`pnpm --filter design-tokens build` → emits:
- `build/tokens.css` (web, CSS custom properties)
- `build/tokens.native.js` (React Native)
- `build/tokens.figma.json` (Figma Variables import)

One source, all platforms. Never hand-edit `build/`.
