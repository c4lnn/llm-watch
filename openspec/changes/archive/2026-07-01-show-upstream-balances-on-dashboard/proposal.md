## Why

The dashboard currently shows each upstream relay's group rates but not the account balance or remaining quota behind that relay. Operators need this at-a-glance status to know which upstreams may run out of usable credit without opening each upstream service manually.

## What Changes

- Display an upstream-level balance or remaining quota indicator on each dashboard upstream card.
- Fetch balance data through the existing backend polling/auth flow so upstream credentials remain server-side.
- Support `sub2api` wallet balance from the authenticated user profile.
- Support `new-api` remaining quota from the authenticated self endpoint, normalized for display.
- Preserve current group rate polling behavior when balance retrieval fails.
- Do not add low-balance notifications, balance history charts, or a standalone manual balance refresh in this change.

## Capabilities

### New Capabilities

- `upstream-balance-display`: Dashboard visibility into each upstream relay's latest account balance or remaining quota.

### Modified Capabilities

- None.

## Impact

- Backend adapters gain optional account status fetching for supported upstream types.
- Polling stores latest upstream balance status alongside existing group snapshots.
- `/api/stats` includes latest balance status per upstream for dashboard rendering.
- Dashboard upstream cards show balance/quota state in their headers.
- Database schema gains storage for upstream balance snapshots or latest balance state.
