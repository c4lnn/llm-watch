## Context

`client/src/components/ChangeHistory.jsx` renders the change history view as a full-width table. The detail column can contain long text, while the type column contains short badges such as "新增", "下线", and "变更". Because the table uses automatic layout and the badge text is allowed to wrap, long detail content can compress the type column until the badge label breaks onto multiple lines.

## Goals / Non-Goals

**Goals:**

- Keep type badges readable on one line.
- Preserve the current table content, filters, and data source.
- Make the layout stable when detail text is long.
- Avoid introducing new UI dependencies or changing backend data.

**Non-Goals:**

- Redesigning the change history page.
- Changing change type names, icons, or colors.
- Changing `/api/changes` or stored change data.
- Adding pagination, virtualization, or new filtering behavior.

## Decisions

### Keep type badge content non-wrapping

Render the badge as an inline flex element with `items-center`, `gap-1`, and `whitespace-nowrap`.

Rationale: the icon and text form one compact status token. They should be treated as a unit rather than normal prose that can wrap between Chinese characters.

Alternative considered: abbreviate labels to icons only. Rejected because the text label improves scanability and avoids relying only on color/icon meaning.

### Reserve width for the type column

Add a stable width or minimum width to the type header/cell so the table allocator does not collapse it below the badge size.

Rationale: `whitespace-nowrap` protects the badge text, but reserving the column prevents unnecessary pressure on neighboring columns and reduces layout jitter.

Alternative considered: use `table-fixed` for the whole table. Rejected for now because the group and detail columns have variable content and the existing automatic sizing is otherwise acceptable.

### Allow table overflow instead of compressing compact columns

Use a horizontal overflow container and a reasonable table minimum width if needed.

Rationale: on narrow viewports or with very long details, horizontal scrolling is better than making metadata badges unreadable.

Alternative considered: truncate detail text. Rejected because the change history view is primarily for inspecting exact changes, and hiding detail text would reduce utility.

## Risks / Trade-offs

- Horizontal scrolling on very narrow screens -> Mitigation: only apply enough minimum width to preserve readability and keep existing responsive behavior otherwise.
- Long detail text may still wrap within the detail column -> Mitigation: this is acceptable; only compact metadata badges must remain single-line.
- CSS-only change could miss a regression without visual testing -> Mitigation: verify with a browser view or screenshot after implementation, plus production build.
