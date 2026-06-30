## Purpose

Defines layout readability requirements for the change history table.

## Requirements

### Requirement: Change type badge remains readable
The system SHALL display each change history type badge as a single readable token.

#### Scenario: Type label is displayed on one line
- **WHEN** the change history table contains rows with type labels such as "新增", "下线", or "变更"
- **THEN** each type badge displays its icon and label on one line without splitting the label across multiple lines

#### Scenario: Detail text is long
- **WHEN** a change history row has long detail text
- **THEN** the type badge remains readable and is not compressed into vertical text by the detail column

### Requirement: Change history table preserves existing information
The system SHALL preserve existing change history row content while fixing the type column layout.

#### Scenario: Existing row data is rendered
- **WHEN** the change history page renders existing change rows
- **THEN** the time, upstream, group, type, and detail fields remain visible with the same data semantics as before

#### Scenario: Existing filters are used
- **WHEN** the user filters change history by all, changed, available, or unavailable
- **THEN** filtering behavior remains unchanged
