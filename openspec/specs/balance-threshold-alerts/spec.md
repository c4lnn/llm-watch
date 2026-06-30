## Purpose

Defines low-balance and low-quota notification behavior for monitored upstreams.

## Requirements

### Requirement: Evaluate balance thresholds after successful balance polling
The system SHALL evaluate balance alert thresholds after each successful account balance or quota fetch.

#### Scenario: Successful finite balance is checked
- **WHEN** an upstream poll successfully fetches a finite account balance or quota value
- **THEN** the system evaluates that value against the effective balance alert threshold for that upstream

#### Scenario: Failed balance fetch is skipped
- **WHEN** an upstream poll fails to fetch account balance or quota
- **THEN** the system records the failed balance snapshot and does not send a low-balance or recovery alert for that failed fetch

#### Scenario: Unsupported balance fetch is skipped
- **WHEN** an upstream type does not support account status fetching
- **THEN** the system does not evaluate a balance threshold for that upstream

### Requirement: Send low-balance alert on normal-to-low transition
The system SHALL send a low-balance notification when an upstream transitions from normal balance to low balance.

#### Scenario: Balance drops below threshold
- **WHEN** an upstream was previously normal and its fetched value is below its effective threshold
- **THEN** the system sends one low-balance notification for that upstream
- **AND** stores the upstream alert state as low

#### Scenario: Balance remains normal
- **WHEN** an upstream was previously normal and its fetched value is greater than or equal to its effective threshold
- **THEN** the system does not send a low-balance notification
- **AND** stores or keeps the upstream alert state as normal

### Requirement: Suppress repeated low-balance alerts with cooldown
The system SHALL avoid repeated low-balance notifications while an upstream remains below threshold unless the configured cooldown has elapsed.

#### Scenario: Low balance persists during cooldown
- **WHEN** an upstream is already in low-balance state and the fetched value remains below threshold before cooldown elapses
- **THEN** the system does not send another low-balance notification

#### Scenario: Low balance persists after cooldown
- **WHEN** an upstream is already in low-balance state and the fetched value remains below threshold after cooldown elapses
- **THEN** the system sends another low-balance reminder notification
- **AND** updates the last alert timestamp

### Requirement: Optionally send recovery notification
The system SHALL support sending a recovery notification when an upstream recovers from low balance to normal balance.

#### Scenario: Recovery notifications enabled
- **WHEN** recovery notifications are enabled and an upstream in low-balance state fetches a value greater than or equal to its effective threshold
- **THEN** the system sends a recovery notification
- **AND** stores the upstream alert state as normal

#### Scenario: Recovery notifications disabled
- **WHEN** recovery notifications are disabled and an upstream in low-balance state fetches a value greater than or equal to its effective threshold
- **THEN** the system stores the upstream alert state as normal without sending a recovery notification

### Requirement: Persist alert state across restarts
The system SHALL persist per-upstream balance alert state in SQLite.

#### Scenario: Service restarts during low-balance state
- **WHEN** an upstream has already sent a low-balance alert and the service restarts
- **THEN** the next poll uses the persisted alert state and cooldown timestamps to decide whether another alert is allowed

### Requirement: Compare new-api thresholds using normalized display quota
The system SHALL compare `new-api` balance thresholds using the normalized quota value shown on the dashboard.

#### Scenario: new-api raw quota is converted before threshold comparison
- **WHEN** a `new-api` upstream returns raw quota from `/api/user/self`
- **THEN** the system compares the threshold against the normalized display value produced by dividing raw quota by `QuotaPerUnit`

#### Scenario: new-api quota below threshold after conversion
- **WHEN** a `new-api` upstream returns raw quota `2500000` and `QuotaPerUnit` is `500000`
- **AND** the effective threshold is `10`
- **THEN** the system treats the value as `5`
- **AND** sends or suppresses alerts according to the low-balance state machine
