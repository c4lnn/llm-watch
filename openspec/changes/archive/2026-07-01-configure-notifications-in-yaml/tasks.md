## 1. Configuration Model

- [x] 1.1 Add `notifications` examples to `config.example.yaml`.
- [x] 1.2 Extend `server/config.js` to parse and validate notification entries with stable `id`, `type`, `config`, and default `enabled: true`.
- [x] 1.3 Expose sanitized notification config accessors for API responses and full config accessors for server-side sending.

## 2. Runtime State Persistence

- [x] 2.1 Define how enabled overrides are stored in SQLite keyed by YAML notification id.
- [x] 2.2 Add migration or compatibility handling for the existing `notification_config` table.
- [x] 2.3 Ensure YAML config remains the source of channel type/config while DB state only controls runtime enabled status.

## 3. Notification API

- [x] 3.1 Update `GET /api/notifications` to return config-managed channels with effective enabled state.
- [x] 3.2 Update `PUT /api/notifications/:id` to allow enabled toggles only.
- [x] 3.3 Remove or reject `POST /api/notifications` creation for config-managed notifications.
- [x] 3.4 Remove or reject `DELETE /api/notifications/:id` deletion for config-managed notifications.
- [x] 3.5 Update notification test-send API to send through a configured channel by id without browser-supplied secrets.

## 4. Notification Sending

- [x] 4.1 Update notification dispatch to use configured channels from `config.yaml`.
- [x] 4.2 Apply runtime enabled overrides before sending notifications.
- [x] 4.3 Preserve existing Bark send behavior for enabled Bark channels.

## 5. Frontend Settings Page

- [x] 5.1 Remove add notification button, form, and modal from `NotificationSettings.jsx`.
- [x] 5.2 Remove delete button and delete handler from `NotificationSettings.jsx`.
- [x] 5.3 Keep enable/disable controls and wire them to the updated toggle API.
- [x] 5.4 Update test-send UI to test an existing configured channel.
- [x] 5.5 Render an empty/config-missing state that tells users to add channels in `config.yaml`.

## 6. Verification

- [x] 6.1 Add or update backend tests for YAML notification parsing, default enabled behavior, toggles, create/delete rejection, and send filtering.
- [x] 6.2 Add or update frontend coverage where local test patterns exist, or verify through production build if no frontend test harness exists.
- [x] 6.3 Run relevant automated tests and build checks.
