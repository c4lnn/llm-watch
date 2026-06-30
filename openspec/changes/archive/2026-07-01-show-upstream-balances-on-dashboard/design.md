## Context

The monitoring service currently polls each configured upstream relay, authenticates with the upstream adapter, stores group snapshots, detects group changes, and exposes dashboard data through `/api/stats`. The dashboard groups `latest_rates` by upstream and renders one card per upstream.

Balance data is an upstream-account concern rather than a group concern. The supported upstream systems expose it differently:

- `sub2api` exposes wallet balance on `GET /api/v1/user/profile` as `data.balance`.
- `new-api` exposes remaining quota on `GET /api/user/self` as `data.quota`; its internal default conversion is `QuotaPerUnit = 500000` quota units per displayed USD unit.

The monitor must keep upstream credentials server-side and reuse the existing authentication flow.

## Goals / Non-Goals

**Goals:**

- Show each upstream's latest balance or remaining quota on the dashboard card for that upstream.
- Fetch balance/quota using the existing backend adapter and poller flow.
- Store enough status to distinguish success, unsupported, failed, and never-fetched states.
- Keep group rate polling useful even if balance retrieval fails.
- Avoid exposing upstream credentials or auth tokens to the browser.

**Non-Goals:**

- No low-balance notifications.
- No balance history chart.
- No standalone manual balance refresh separate from existing polling.
- No upstream admin-channel balance support.
- No changes to how group rate changes are detected or pushed.

## Decisions

### Add optional account status fetching to adapters

Add an optional adapter method:

```js
fetchAccountStatus(baseUrl, authToken) -> {
  balance: number | null,
  display_value: number | null,
  display_unit: string,
  label: string,
  kind: 'balance' | 'quota',
  raw: object
}
```

Rationale: adapters already own upstream-specific authentication and response normalization. Keeping account status there avoids leaking upstream API differences into the poller or frontend.

Alternatives considered:

- Fetch from the frontend: rejected because it would expose upstream auth details and duplicate CORS/session handling.
- Add separate service-specific pollers: rejected because it would duplicate the current adapter pattern.

### Store balance snapshots separately from group snapshots

Create a separate balance status storage path, preferably a `upstream_balance_snapshots` table with:

- `upstream_id`
- `balance`
- `display_value`
- `display_unit`
- `kind`
- `label`
- `raw_data`
- `status`
- `error`
- `created_at`

Rationale: balance is not tied to a group snapshot row and may later support history without schema churn. For this change, `/api/stats` only needs the latest row per upstream.

Alternatives considered:

- Add columns directly to `upstreams`: simpler for latest-only display, but loses failure history and mixes configuration with poll result state.
- Store balance inside group snapshot raw data: rejected because the balance is upstream-level, not group-level.

### Poll balance independently from group rates

During normal upstream polling, after authentication succeeds, call `fetchGroups` and `fetchAccountStatus` using the same auth token. If balance retrieval fails, persist a failed balance status but do not fail the whole group poll when groups were fetched successfully.

Rationale: dashboard rates are still valuable even when the account-status endpoint is temporarily unavailable.

### Normalize display semantics by upstream type

For `sub2api`, treat `data.balance` as wallet balance and display it as `余额`.

For `new-api`, treat `data.quota` as remaining quota. Normalize to a display value using `quota / 500000` for a first implementation and label it as `额度`, while keeping the raw quota in `raw_data`.

Rationale: `new-api` exposes quota rather than wallet balance. Labeling it as quota avoids pretending it is exactly the same as `sub2api` wallet balance.

### Extend `/api/stats` rather than add a dashboard-only endpoint

Include latest balance status in `/api/stats`, either as an `upstream_balances` array keyed by `upstream_id`, or embedded into each latest-rate/upstream grouping payload if the response is refactored.

Rationale: the dashboard already fetches `/api/stats`; extending this response keeps the UI simple and avoids an extra request.

## Risks / Trade-offs

- `new-api` display units can be customized upstream. Using the default `500000` conversion may differ from a customized deployment. Mitigation: label it as quota and keep raw quota available; a later change can fetch remote display settings if needed.
- Balance endpoint failure could create noisy logs or misleading UI. Mitigation: store and render explicit `获取失败` state with the latest error available server-side.
- Adding polling work increases per-upstream latency. Mitigation: reuse existing auth token and timeout settings; run account status fetch in the same poll cycle and keep failures isolated.
- Existing databases need migration. Mitigation: add schema creation/migration in `server/db.js` using the existing startup migration style.
