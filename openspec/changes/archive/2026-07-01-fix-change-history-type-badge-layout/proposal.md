## Why

The change history table currently allows the type badge column to shrink too far when detail text is long. This makes labels such as "新增" and "变更" wrap one character per line, which hurts scanability in the main audit view.

## What Changes

- Keep change type badges on one line in the change history table.
- Reserve enough width for the type column so icon and label remain readable.
- Prevent long detail text from compressing compact metadata columns.
- Preserve existing filters, data loading, and change detail content.

## Capabilities

### New Capabilities

- `change-history-table-layout`: Ensures the change history table keeps compact metadata columns readable while allowing long details to fit or scroll appropriately.

### Modified Capabilities

- None.

## Impact

- Affects `client/src/components/ChangeHistory.jsx`.
- No backend API or database changes.
- No dependency changes.
