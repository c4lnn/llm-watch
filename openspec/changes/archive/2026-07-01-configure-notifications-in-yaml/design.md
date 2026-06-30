## Context

The system already treats upstream relays as server-managed configuration loaded from `config.yaml`. Notification channels are different today: they are created, edited, enabled, disabled, and deleted from the frontend, with channel config stored in the SQLite `notification_config` table.

The requested behavior is to move push channel definitions into `config.yaml`, while keeping the frontend page as an operational control surface for enabling and disabling channels. Deletion is no longer part of the UI workflow.

## Goals / Non-Goals

**Goals:**

- Define notification channels in `config.yaml`.
- Default configured notification channels to enabled.
- Keep the notification settings page visible.
- Allow the frontend to toggle configured notification channels enabled/disabled.
- Remove delete behavior from the frontend and API workflow.
- Avoid exposing mutable creation/deletion of push secrets through the browser.

**Non-Goals:**

- No new notification provider type beyond existing Bark support unless already supported by current notifier code.
- No frontend editing of notification server/key fields.
- No UI-driven creation of new notification channel definitions.
- No migration tool that rewrites existing DB notification config into `config.yaml`.

## Decisions

### Use `config.yaml` as the notification source of truth

Add a top-level `notifications` array to `config.yaml`:

```yaml
notifications:
  - id: bark-main
    type: bark
    enabled: true
    config:
      server: https://api.day.app
      key: your-bark-key
```

Rationale: this mirrors the existing upstream configuration model and makes deployment repeatable. The `id` gives each configured channel a stable key for storing frontend enable/disable overrides.

Alternatives considered:

- Keep DB as the source of truth and only seed it from YAML: rejected because it leaves two mutable sources for channel definitions.
- Remove the frontend page entirely: rejected because the user explicitly wants to keep enable/disable controls.

### Store only runtime enabled overrides in the database

Keep channel type and config from YAML. Persist only mutable runtime state, such as `enabled`, keyed by config channel id. If no override exists, use the YAML `enabled` value, defaulting to `true` when omitted.

Rationale: operators can temporarily disable push without editing the YAML file, while sensitive channel configuration remains server-managed.

### Make create/delete unsupported for configured channels

The frontend should not show add or delete controls. Backend create/delete routes should be removed or return an error for config-managed notifications. Toggle routes should accept only enabled changes.

Rationale: config-managed resources should not be removed from the UI, and the user specifically requested that deletion be removed.

### Keep test-send for existing configured channels

The frontend can test a configured notification channel by id, or the existing test endpoint can be adapted to use config-backed channel data. It should not require entering a key in a modal.

Rationale: testing remains useful, but the test should exercise the configured channel rather than ad hoc browser-provided secrets.

## Risks / Trade-offs

- Existing DB notification rows will no longer be the source of channel definitions. Mitigation: document the new YAML format in `config.example.yaml`; legacy rows can be ignored or used only during a transition if implementation chooses.
- A YAML typo can disable notifications at startup. Mitigation: validate notification entries during config loading and log clear errors with the entry index/id.
- Runtime toggle state can diverge from YAML `enabled`. Mitigation: define precedence clearly: DB override wins when present; otherwise YAML value/default applies.
- Removing add/delete may surprise users used to UI management. Mitigation: keep the page and show config-backed channel details plus enable/disable controls.
