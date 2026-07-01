## ADDED Requirements

### Requirement: 同轮询同分组字段变更合并显示
系统 SHALL 将同一次轮询结果中同一中转分组的多个字段级变更显示为一条变动记录。

#### Scenario: 同一次轮询中多个字段变更
- **WHEN** one poll result records two or more `changed` rows with the same `created_at`, `upstream_id`, and `group_id`
- **THEN** 变动记录表格为该中转分组显示一条 `changed` 记录
- **AND** 该记录详情包含每个变更字段的字段名、旧值和新值

#### Scenario: 同一次轮询中单个字段变更
- **WHEN** one poll result records exactly one `changed` row for an upstream group
- **THEN** 变动记录表格显示一条 `changed` 记录，并包含该字段的旧值和新值

#### Scenario: 字段变更属于不同分组或不同轮询
- **WHEN** `changed` rows have different `created_at`, `upstream_id`, or `group_id` values
- **THEN** 变动记录表格将它们显示为不同记录

#### Scenario: 存在上线或下线变更
- **WHEN** the change history includes `available` or `unavailable` rows
- **THEN** 这些记录保持现有一条变更显示一行的语义，并且不会合并进字段变更记录

#### Scenario: 使用字段变更筛选
- **WHEN** the user filters the change history to field changes
- **THEN** 筛选结果使用与未筛选表格相同的合并字段变更记录
