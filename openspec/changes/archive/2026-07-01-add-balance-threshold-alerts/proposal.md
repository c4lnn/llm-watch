## Why

The system now collects and displays upstream account balances, but operators are not warned when an upstream balance or remaining quota becomes too low. Adding threshold alerts turns the existing balance data into an operational signal without requiring users to manually watch the dashboard.

## What Changes

- Check each upstream's account balance after a successful balance fetch during polling.
- Send a notification once when an upstream transitions from normal balance to low balance.
- Avoid repeated low-balance spam by persisting alert state and applying a configurable cooldown.
- Optionally send a recovery notification when an upstream transitions from low balance back to normal.
- Allow users to configure the minimum balance/quota threshold from the frontend.
- Persist per-upstream balance alert state in SQLite so restarts do not repeat the same alert.
- Treat `new-api` quota values carefully: `/api/user/self` returns raw quota units, and display/threshold comparison should use the normalized display value derived by dividing by `QuotaPerUnit` (`500000` by default).

## Capabilities

### New Capabilities

- `balance-threshold-alerts`: Sends low-balance and optional recovery notifications based on configured thresholds, cooldown, and persisted alert state.
- `balance-alert-settings`: Lets users configure minimum balance thresholds and alert behavior from the frontend.

### Modified Capabilities

- None.

## Impact

- `server/poller.js` will check balance alert state after successful account status fetches.
- `server/db.js` will add persistent balance alert state/settings storage.
- `server/index.js` will expose balance alert settings APIs.
- `server/notifier.js` will be reused for low-balance and recovery notifications.
- `server/adapters.js` new-api quota normalization must remain aligned with new-api's `QuotaPerUnit`.
- `client/src/components/Dashboard.jsx` or a settings component will expose minimum threshold configuration.
- Tests should cover transition alerts, cooldown suppression, recovery behavior, and `new-api` quota normalization.
