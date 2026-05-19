# HR Platform

Unified HR automation platform — Saudi Arabia, multi-entity, ~1,250 employees.

**Read `CLAUDE.md` first.** It is the project guide: architecture, conventions,
and locked decisions.

## Foundation status

| Slice | State |
|---|---|
| `docs/specs/` — data model, workflow engine, leave API, events, a11y, tokens, ADRs | ✅ written |
| `packages/design-tokens` — W3C tokens → CSS/RN/Figma, builds clean | ✅ working |
| `services/leave` — reference module, 9 tests green | ✅ working |
| All other apps/services | ⛔ not built — see CLAUDE.md §11 |

## Quick start

```bash
pnpm install
pnpm tokens:build              # → packages/design-tokens/build/
pnpm --filter @hr/leave test   # 9 passing tests
```

## Where to go next

`docs/specs/` is the source of truth for every module. New modules copy
`services/leave` structure exactly. Open decisions tracked in
`docs/specs/adr/`.
