# ADR-0001: Build vs Buy vs Hybrid

Status: **Open** — must be resolved before payroll work starts (CLAUDE.md §14)

## Context

KSA compliance (WPS/Mudad, GOSI, Qiwa, Muqeem, CCHI, Saudization) is heavy and
changes with regulation. Localized vendors (Jisr, ZenHR, Bayzat) handle these
natively. Custom build owns the differentiated layers but must reimplement
commodity compliance.

## Options

1. **Full custom** — max control, 6–12 mo to payroll, owns all compliance risk.
2. **Localized SaaS** — 4–8 wk live, native compliance, limited customization,
   vendor lock-in.
3. **Hybrid** — localized engine for payroll/compliance commodity layers +
   custom HRIS shell and differentiated workflows on top.

## Decision

**Deferred.** Current repo assumes custom (option 1) so the architecture isn't
blocked. Re-evaluate before the payroll service is scoped. Decision criteria:
- <300 employees, single entity, standard process → lean toward SaaS/hybrid.
- Differentiated process or productizing HR → custom.

## Consequences

Until resolved, do not build the payroll service beyond its API contract and
event schema. The leave/letters/people services are safe to build under any
option — they are the differentiated layer.

---

# ADR template (copy for new decisions)

```
# ADR-NNNN: Title
Status: Proposed | Accepted | Superseded by ADR-XXXX
## Context
What forces this decision. Constraints, requirements.
## Options
Enumerated, with trade-offs.
## Decision
What we chose and why.
## Consequences
What becomes easier/harder. What this blocks or unblocks.
```
