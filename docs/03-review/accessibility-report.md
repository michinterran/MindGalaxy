# Accessibility Report

## Scope

Reviewed the workspace shell, sidebar navigation, capture drawer, search panel, export panel, view switch, and list interactions.

## Improvements Completed

- Sidebar navigation now uses real click handlers and active state instead of inert buttons.
- New material opens the reusable capture panel as a drawer even when captures already exist.
- Search, export, and capture side panels have roles, labels, close buttons, and Escape handling.
- Icon-only controls now have accessible labels where they trigger actions.
- Recent captures and capture search results move users to the list view and highlight the selected capture.
- Settings/archive controls were removed from the MVP surface.
- Korean UI copy was cleaned up to remove user-facing technical English where not a brand or standard file format.

## Remaining Risks

- Full keyboard traversal and screen-reader verification were not run in a real browser session during this pass.
- Touch target sizing was improved for icon buttons, but mobile viewport QA should still verify spacing in the signed-in app.
- Galaxy beta remains visually rich and needs additional non-visual affordances before it becomes a primary navigation mode.

## Recommendations

- Add Playwright keyboard smoke for sidebar, search panel, capture drawer, and export panel.
- Add manual VoiceOver/NVDA pass before production launch.
- Keep the list view as the accessible fallback for graph exploration.
