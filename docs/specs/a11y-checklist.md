# Accessibility Checklist

Target: **WCAG 2.2 AA** across the platform (CLAUDE.md §10). AAA where
reasonable. This is a gate, not a guideline — the A11y specialist owns sign-off
(see docs/raci.xlsx).

## Forms (highest-leverage area in HR)
- [ ] Every input has a programmatic `<label>`. Placeholder is not a label.
- [ ] Required fields: `*` **and** `aria-required="true"`.
- [ ] Errors associated via `aria-describedby`, announced on submit.
- [ ] Error text is clear, actionable, in the user's language.
- [ ] Related fields grouped with `<fieldset>` / `<legend>`.
- [ ] Tab order matches visual order, including in RTL.
- [ ] No auto-advance focus on type.
- [ ] Date pickers fully keyboard-operable (arrows, PageUp/Down, Home/End).
- [ ] File upload announces progress + completion.

## Tables (HR ops density)
- [ ] `<thead>`/`<tbody>`, `<th scope="col">`.
- [ ] Sortable columns announce sort state + direction.
- [ ] Row selection announces count.
- [ ] Bulk actions keyboard-reachable, with confirmation.
- [ ] Sticky headers don't break SR linearization.

## Approval flows
- [ ] State changes announced via `aria-live="polite"`.
- [ ] Every swipe gesture has a keyboard equivalent.
- [ ] Decline-with-note moves focus to the note field.
- [ ] Action buttons labelled (not icon-only, or `aria-label` provided).

## Navigation
- [ ] Skip link to main content.
- [ ] Landmarks: `header`, `nav`, `main`, `aside`, `footer`.
- [ ] Logical heading hierarchy, no level jumps.
- [ ] Focus always visible — never `outline:none` without replacement.
- [ ] Focus trap in modals; Esc closes.
- [ ] Active nav: `aria-current="page"`.

## Colour & contrast
- [ ] Body text ≥ 4.5:1, large text ≥ 3:1, UI/graphics ≥ 3:1.
- [ ] Status never colour-only — pair icon + label.
- [ ] Tested in light, dark, Windows high-contrast.

## Internationalization
- [ ] `lang` on root + inline language switches.
- [ ] `dir` toggled at root; logical CSS properties throughout.
- [ ] Numbers/dates/currencies via `Intl`, locale-aware.
- [ ] Hijri alternative where relevant.

## Motion
- [ ] Respect `prefers-reduced-motion`.
- [ ] No flashing > 3 Hz.
- [ ] No auto-play / auto-advancing carousels.

## Documents (HR-specific)
- [ ] Generated PDFs are **tagged** with a text layer (not scanned images).
- [ ] Document viewer keyboard-operable, page-jump + zoom.
- [ ] Meaningful images have alt text; decorative ones `aria-hidden`.

## Mobile
- [ ] Touch targets ≥ 44×44 CSS px.
- [ ] Pinch-zoom never disabled.
- [ ] Portrait + landscape supported.
- [ ] VoiceOver (iOS) + TalkBack (Android) tested per flow.

## Testing program
- [ ] `axe-core` in CI; Lighthouse a11y gate.
- [ ] Keyboard-only pass per major flow each release.
- [ ] Screen reader: NVDA, VoiceOver (mac+iOS), TalkBack — rotate quarterly.
- [ ] Inclusive beta cohort before launch.
- [ ] External audit before any major launch.

## Frequent failures in HR platforms (check these first)
- Letter PDFs that are scanned images with no text layer.
- Approval cards with no keyboard path for swipe.
- Date pickers that trap focus.
- Toasts that auto-dismiss before SR announces them.
- Bulk-confirm dialogs without focus management.
- Letter generation ignoring `lang` on Arabic content.
