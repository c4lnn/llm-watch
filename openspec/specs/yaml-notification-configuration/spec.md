## Purpose

Defines server-managed notification channels loaded from `config.yaml`.

## Requirements

### Requirement: Load notification channels from YAML
The system SHALL load notification channel definitions from `config.yaml`.

#### Scenario: Valid notification config is loaded
- **WHEN** `config.yaml` contains a valid `notifications` array
- **THEN** the system exposes those notification channels as configured channels

#### Scenario: Enabled defaults to true
- **WHEN** a notification channel omits the `enabled` field
- **THEN** the system treats the channel as enabled unless a stored runtime override disables it

### Requirement: Preserve frontend enable and disable control
The system SHALL allow users to enable or disable configured notification channels from the frontend.

#### Scenario: User disables a configured channel
- **WHEN** a user disables a configured notification channel from the notification settings page
- **THEN** the system persists the disabled runtime state without modifying `config.yaml`

#### Scenario: User enables a configured channel
- **WHEN** a user enables a configured notification channel from the notification settings page
- **THEN** the system persists the enabled runtime state without modifying `config.yaml`

### Requirement: Remove frontend channel deletion
The system SHALL NOT provide notification channel deletion as a frontend workflow.

#### Scenario: Notification settings page renders configured channels
- **WHEN** the notification settings page displays configured notification channels
- **THEN** each channel has enable or disable controls and no delete control

#### Scenario: Delete API is attempted
- **WHEN** a client attempts to delete a config-managed notification channel
- **THEN** the system rejects the delete attempt and leaves the configured channel available

### Requirement: Remove frontend channel creation
The system SHALL NOT provide notification channel creation as a frontend workflow when notifications are config-managed.

#### Scenario: Notification settings page loads
- **WHEN** the notification settings page loads
- **THEN** it does not show an add notification form or modal trigger

### Requirement: Send notifications using config-managed channels
The system SHALL send push notifications through enabled channels loaded from `config.yaml`.

#### Scenario: Enabled configured channel receives notification
- **WHEN** a group change notification is sent and a configured channel is enabled
- **THEN** the system sends the push through that configured channel

#### Scenario: Disabled configured channel is skipped
- **WHEN** a group change notification is sent and a configured channel is disabled by runtime state
- **THEN** the system does not send the push through that channel

### Requirement: Test configured notification channels
The system SHALL allow users to test configured notification channels without entering channel secrets in the frontend.

#### Scenario: User tests configured channel
- **WHEN** a user triggers a test send for a configured notification channel
- **THEN** the system sends the test using the server-side configured channel data
