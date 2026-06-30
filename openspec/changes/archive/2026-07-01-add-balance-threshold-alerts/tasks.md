## 1. Data Model

- [x] 1.1 Add SQLite tables for global balance alert settings, per-upstream overrides, and per-upstream alert state.
- [x] 1.2 Add DB helpers to read effective alert settings for an upstream.
- [x] 1.3 Add DB helpers to upsert alert state without deleting balance snapshots.

## 2. Alert Evaluation

- [x] 2.1 Implement balance alert evaluation using finite normalized values, preferring `displayValue` over raw `balance`.
- [x] 2.2 Implement the normal-to-low transition notification path.
- [x] 2.3 Implement cooldown-based low-balance reminder suppression.
- [x] 2.4 Implement optional low-to-normal recovery notifications.
- [x] 2.5 Skip alert evaluation for failed, unsupported, disabled, or non-finite balance status.
- [x] 2.6 Confirm `new-api` threshold checks compare against `quota / NEWAPI_QUOTA_PER_DISPLAY_UNIT`.

## 3. Poller Integration

- [x] 3.1 Call balance alert evaluation after successful account status snapshot insertion in `recordAccountStatus`.
- [x] 3.2 Ensure group-change notifications and balance-alert notifications both use existing configured notification channels.
- [x] 3.3 Ensure alert state persists across process restarts and prevents duplicate first alerts.

## 4. Settings API

- [x] 4.1 Add API to read global and per-upstream balance alert settings with effective thresholds.
- [x] 4.2 Add API to update global enabled, default threshold, cooldown, and recovery notification settings.
- [x] 4.3 Add API to update or clear per-upstream threshold and enabled overrides.
- [x] 4.4 Validate numeric thresholds and cooldown values with clear errors.

## 5. Frontend Settings

- [x] 5.1 Add UI controls for global balance alert enabled state, default threshold, cooldown, and recovery notification toggle.
- [x] 5.2 Add per-upstream threshold controls using the same units shown on the dashboard.
- [x] 5.3 Show each upstream's effective threshold and whether it comes from the default or an override.
- [x] 5.4 Preserve existing dashboard balance display behavior.

## 6. Verification

- [x] 6.1 Add backend tests for normal-to-low alert, cooldown suppression, cooldown reminder, and recovery behavior.
- [x] 6.2 Add backend tests proving `new-api` raw quota is converted with `NEWAPI_QUOTA_PER_DISPLAY_UNIT` before threshold comparison.
- [x] 6.3 Add API tests for reading/updating global settings and per-upstream overrides.
- [x] 6.4 Verify frontend behavior with production build and, where practical, browser inspection.
- [x] 6.5 Run relevant automated tests and build checks.
