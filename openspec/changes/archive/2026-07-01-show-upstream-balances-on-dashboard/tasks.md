## 1. Data Model

- [x] 1.1 Add database schema support for upstream account status snapshots with upstream id, status, normalized values, raw data, error, and timestamp.
- [x] 1.2 Add helper queries for inserting account status snapshots and selecting the latest status per upstream.

## 2. Adapter Support

- [x] 2.1 Extend the adapter contract documentation with optional `fetchAccountStatus(baseUrl, authToken)`.
- [x] 2.2 Implement `sub2api.fetchAccountStatus` using `GET /api/v1/user/profile` and normalize `data.balance`.
- [x] 2.3 Implement `new-api.fetchAccountStatus` using `GET /api/user/self` and normalize `data.quota` as remaining quota.
- [x] 2.4 Return an unsupported account status for adapter types without account status support.

## 3. Polling Integration

- [x] 3.1 Reuse the existing authenticated polling flow to call account status fetching during each upstream poll.
- [x] 3.2 Persist successful, failed, and unsupported account status records without disrupting group snapshot persistence.
- [x] 3.3 Ensure authentication retry behavior still works for both group and account status requests.

## 4. Dashboard API

- [x] 4.1 Extend `/api/stats` to include latest account status data keyed by upstream id.
- [x] 4.2 Represent never-fetched upstream account status distinctly from failed and unsupported statuses.
- [x] 4.3 Ensure the stats response does not expose upstream credentials, auth tokens, or raw sensitive fields.

## 5. Dashboard UI

- [x] 5.1 Render account status in each upstream card header near the latest poll time.
- [x] 5.2 Format successful `sub2api` balance and `new-api` quota states with clear labels.
- [x] 5.3 Render failed, unsupported, and never-fetched states without hiding group rate data.
- [x] 5.4 Keep the dashboard layout stable on desktop and mobile viewports.

## 6. Verification

- [x] 6.1 Add or update backend tests for adapter normalization, account status persistence, and `/api/stats` response shape.
- [x] 6.2 Add or update frontend tests for dashboard account status rendering states where local test patterns exist.
- [x] 6.3 Run the relevant backend/frontend checks and manually verify the dashboard after polling supported upstreams.
