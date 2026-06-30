## Context

The system already fetches upstream account status during each poll and stores snapshots in `upstream_balance_snapshots`. The dashboard displays the latest balance/quota, and notification dispatch already supports configured push channels. There is no current low-balance alert state, threshold setting, cooldown, or recovery notification.

Important `new-api` finding: `new-api/controller/user.go` returns `user.Quota` from `/api/user/self` as raw quota units. `new-api/common/constants.go` defines `QuotaPerUnit = 500 * 1000.0`, and the new-api frontend formats quota by dividing raw quota by `quotaPerUnit`. `llm-watch` already mirrors this with `NEWAPI_QUOTA_PER_DISPLAY_UNIT = 500000` and `displayValue: quota / NEWAPI_QUOTA_PER_DISPLAY_UNIT`. Threshold comparisons for `new-api` should therefore use `displayValue`, not raw `balance`.

## Goals / Non-Goals

**Goals:**

- Alert when a successfully fetched upstream balance/quota falls below its configured threshold.
- Notify only on meaningful state transitions by default: normal to low balance, and optionally low balance to recovered.
- Persist alert state per upstream so restarts do not resend the same low-balance alert.
- Suppress repeated low-balance notifications using cooldown.
- Let users configure minimum thresholds from the frontend.
- Use normalized display values for comparisons so `sub2api` balances and `new-api` quotas are compared in the same units shown on the dashboard.

**Non-Goals:**

- No new notification provider type.
- No prediction of future exhaustion based on burn rate.
- No alerting on unsupported balance fetchers.
- No UI-driven changes to notification channel secrets.
- No migration that backfills historical alert state from old snapshots.

## Decisions

### Store global and per-upstream settings in SQLite

Add SQLite-backed alert settings because the threshold must be configurable from the page. A simple model is:

- Global/default settings:
  - `enabled` default true
  - `default_threshold` default null or 0 until configured
  - `cooldown_minutes` default 360
  - `notify_recovery` default true
- Per-upstream settings:
  - `upstream_id`
  - optional `threshold`
  - optional `enabled` override

Rationale: UI-managed settings need runtime persistence without editing `config.yaml`. This also avoids mixing operational alert preferences into upstream credential configuration.

Alternative considered: put thresholds in `config.yaml`. Rejected for this change because the user explicitly requested page configuration.

### Store per-upstream alert state separately from snapshots

Add per-upstream state keyed by `upstream_id`, containing:

- `state`: `normal` or `low`
- `last_value`
- `threshold`
- `last_alert_at`
- `last_recovery_at`
- `updated_at`

Rationale: snapshots are append-only facts; alert state is a compact state machine. Separating them makes restart behavior and cooldown checks straightforward.

### Evaluate alerts immediately after successful account status fetch

`recordAccountStatus` already receives normalized adapter output and inserts the snapshot. After a successful status, evaluate the threshold using the same normalized value used by the dashboard:

- Prefer `displayValue` when finite.
- Fall back to `balance` for adapters that do not provide displayValue.
- Skip alert evaluation for `failed`, `unsupported`, or non-finite values.

Rationale: this keeps alerting close to the source data and avoids evaluating stale dashboard payloads.

### Use a small alert state machine

For each enabled upstream:

```text
normal -- value < threshold --> low      => send low-balance notification
low    -- value >= threshold --> normal  => send recovery notification if enabled
low    -- value < threshold and cooldown elapsed --> low => send reminder
low    -- value < threshold and cooldown active  --> low => no notification
```

Rationale: transition-based alerting avoids spam while still allowing reminders for long-running low-balance states.

### Normalize `new-api` quota before comparing thresholds

Confirmed behavior:

- `new-api /api/user/self` returns raw `quota`.
- `new-api` display conversion is `quota / QuotaPerUnit`.
- Current `llm-watch` conversion is `quota / 500000`.

Therefore threshold input should be interpreted in the dashboard display unit. For `new-api`, compare threshold against `displayValue`, not raw quota.

Example: raw quota `2,500,000` is display value `5`; threshold `10` should alert because `5 < 10`.

## Risks / Trade-offs

- Threshold unit confusion -> Mitigation: label UI as the same unit shown in the dashboard and compare against normalized display value.
- Repeated alerts after restart -> Mitigation: persist state and `last_alert_at` in SQLite.
- Missed recovery notification when balance fetch fails -> Mitigation: evaluate recovery only on successful finite values.
- Cooldown semantics may surprise users -> Mitigation: make cooldown visible and editable with a clear default.
- Multiple balance snapshots per poll could produce duplicate checks -> Mitigation: run one alert evaluation per upstream poll after the single account status fetch.
