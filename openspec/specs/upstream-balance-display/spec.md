## Purpose

Defines polling, API exposure, and dashboard display for upstream account balance and quota status.

## Requirements

### Requirement: Poll upstream account status
The system SHALL fetch the latest account balance or remaining quota for supported upstream relay types during the existing upstream polling flow.

#### Scenario: sub2api balance is fetched
- **WHEN** a `sub2api` upstream is polled with valid credentials
- **THEN** the system fetches the authenticated user profile and records the returned balance as the upstream account status

#### Scenario: new-api quota is fetched
- **WHEN** a `new-api` upstream is polled with valid credentials
- **THEN** the system fetches the authenticated user self payload and records the returned quota as the upstream account status

### Requirement: Preserve group polling on account status failure
The system SHALL keep group rate polling independent from account status retrieval.

#### Scenario: balance fetch fails after groups succeed
- **WHEN** group rate fetching succeeds and account status fetching fails for the same upstream poll
- **THEN** the system records the group snapshots and records the account status as failed without marking the group poll as failed

### Requirement: Expose latest upstream account status in dashboard stats
The system SHALL include the latest account status for each upstream in the dashboard stats API response.

#### Scenario: stats include latest balance status
- **WHEN** the dashboard requests `/api/stats`
- **THEN** the response includes each upstream's latest account status with upstream identifier, status, display label, numeric value when available, and timestamp

#### Scenario: no account status exists yet
- **WHEN** the dashboard requests `/api/stats` before an upstream has any account status record
- **THEN** the response represents that upstream account status as not yet fetched

### Requirement: Display upstream account status on dashboard cards
The dashboard SHALL show each upstream's latest balance or quota state on that upstream's card.

#### Scenario: successful balance display
- **WHEN** an upstream has a successful latest account status
- **THEN** its dashboard card displays the status label and formatted value in the card header

#### Scenario: failed balance display
- **WHEN** an upstream's latest account status is failed
- **THEN** its dashboard card displays a clear failed state instead of hiding the account status area

#### Scenario: unsupported balance display
- **WHEN** an upstream type does not provide account status support
- **THEN** its dashboard card displays an unsupported state without affecting group rate display
