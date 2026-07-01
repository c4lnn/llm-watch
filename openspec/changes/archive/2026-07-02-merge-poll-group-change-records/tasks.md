## 1. 后端聚合

- [x] 1.1 添加变动记录聚合辅助函数，按 `created_at`、`upstream_id` 和 `group_id` 聚合 `changed` 行，同时保持 `available` 和 `unavailable` 行独立。
- [x] 1.2 更新 `GET /api/changes`，返回聚合后的展示记录，并为字段级变更提供 `field_changes` 数组。
- [x] 1.3 保留现有 `upstream_id` 筛选、时间倒序排序和参数化 SQL 用法。
- [x] 1.4 在聚合后应用请求的 `limit`，使限制数量按展示记录而不是原始字段行计算。

## 2. 前端渲染

- [x] 2.1 更新 `ChangeHistory`，在一条 `changed` 记录的详情单元格内渲染多个字段变更。
- [x] 2.2 保留旧单字段记录的回退渲染路径，兼容只包含 `field_name`、`old_value` 和 `new_value` 的记录。
- [x] 2.3 验证现有全部、字段变更、新增、下线筛选在聚合记录下继续正常工作。

## 3. 验证

- [x] 3.1 添加或更新测试，覆盖同轮询多字段聚合、单字段变更、不同分组或不同轮询分离，以及上线/下线记录不被合并。
- [x] 3.2 使用 `npm test` 运行相关 Node 测试套件。
- [x] 3.3 前端改动后运行 `npm run build`，验证 React 构建。
