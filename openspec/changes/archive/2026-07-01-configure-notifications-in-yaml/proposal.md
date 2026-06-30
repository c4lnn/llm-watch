## Why

Notification channel settings are currently managed from the UI and stored in the database, while upstream relay settings already use `config.yaml` as the source of truth. Moving push channel definitions into `config.yaml` makes deployment repeatable and keeps sensitive notification keys out of browser-driven create/delete flows.

## What Changes

- Load notification channel definitions from `config.yaml`.
- Treat configured notification channels as server-managed records.
- Keep the frontend notification settings page.
- Keep frontend enable/disable controls for configured notification channels, defaulting each channel to enabled unless explicitly disabled.
- Remove the frontend delete capability and stop supporting notification deletion as a user workflow.
- Stop using the frontend as the place to create notification channel definitions.
- Preserve test-send behavior for configured notification channels where possible.

## Capabilities

### New Capabilities

- `yaml-notification-configuration`: Server-managed notification channels defined in `config.yaml` with frontend enable/disable control only.

### Modified Capabilities

- None.

## Impact

- `config.yaml` and `config.example.yaml` gain notification channel configuration.
- `server/config.js` parses notification settings alongside upstreams.
- Notification APIs return config-backed channels and only allow supported mutable fields such as `enabled`.
- Notification sending uses config-backed channels plus stored enabled state.
- `client/src/components/NotificationSettings.jsx` removes add/delete management flows and keeps enable/disable plus test-send UI.
- Database usage for notification enabled overrides may change; existing DB notification rows need a migration/compatibility decision during implementation.
