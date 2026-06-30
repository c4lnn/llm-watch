## Purpose

Defines how users configure balance and quota alert thresholds from the frontend.

## Requirements

### Requirement: Configure default balance alert settings from the frontend
The system SHALL allow users to configure default balance alert settings from the frontend.

#### Scenario: User sets default threshold
- **WHEN** a user sets the default minimum balance threshold from the frontend
- **THEN** the system persists the threshold and uses it for upstreams without a per-upstream threshold override

#### Scenario: User disables balance alerts globally
- **WHEN** a user disables balance alerts globally from the frontend
- **THEN** the system persists the disabled setting and does not send low-balance or recovery notifications

#### Scenario: User updates cooldown
- **WHEN** a user updates the balance alert cooldown from the frontend
- **THEN** the system persists the cooldown and applies it to future repeated low-balance alert decisions

#### Scenario: User toggles recovery notifications
- **WHEN** a user enables or disables recovery notifications from the frontend
- **THEN** the system persists that preference and applies it to future recovery transitions

### Requirement: Configure per-upstream balance thresholds
The system SHALL allow users to configure per-upstream balance alert thresholds.

#### Scenario: User sets upstream-specific threshold
- **WHEN** a user sets a minimum threshold for a specific upstream
- **THEN** the system persists that upstream-specific threshold
- **AND** uses it instead of the default threshold for that upstream

#### Scenario: User clears upstream-specific threshold
- **WHEN** a user clears the threshold override for a specific upstream
- **THEN** the system falls back to the default threshold for that upstream

#### Scenario: User disables alerts for one upstream
- **WHEN** a user disables balance alerts for a specific upstream
- **THEN** the system skips low-balance and recovery notifications for that upstream while keeping global alerts available for other upstreams

### Requirement: Show effective alert configuration in the UI
The system SHALL show users the effective alert settings for monitored upstreams.

#### Scenario: Upstream uses default threshold
- **WHEN** an upstream has no threshold override
- **THEN** the frontend shows the default threshold as the effective threshold for that upstream

#### Scenario: Upstream uses override threshold
- **WHEN** an upstream has a threshold override
- **THEN** the frontend shows the override threshold as the effective threshold for that upstream

#### Scenario: Settings use dashboard display units
- **WHEN** the frontend displays or edits balance alert thresholds
- **THEN** the threshold unit matches the balance/quota unit shown on the dashboard for that upstream
