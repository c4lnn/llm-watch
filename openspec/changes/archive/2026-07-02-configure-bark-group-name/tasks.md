## 1. 配置与展示

- [x] 1.1 更新 Bark 通知配置解析或使用逻辑，支持读取 `config.group`。
- [x] 1.2 更新 Bark 通知配置脱敏输出，让 `/api/notifications` 返回非敏感的 `group` 字段并继续隐藏完整 `key`。
- [x] 1.3 更新 `config.example.yaml`，在 Bark 示例中说明可选 `group` 字段。
- [x] 1.4 更新 `NotificationSettings`，在 Bark channel 摘要中显示当前 group 名。

## 2. Bark 发送

- [x] 2.1 更新 `sendBark`，使用配置的非空 `group` 作为 Bark 查询参数。
- [x] 2.2 在 `group` 未配置或为空时回退到默认值 `LLM Watch`。
- [x] 2.3 确保 `group` 查询参数经过 URL 编码，支持中文、空格和特殊字符。

## 3. 验证

- [x] 3.1 更新通知配置测试，覆盖 YAML 中加载并脱敏展示 Bark `group`。
- [x] 3.2 更新 Bark 发送测试，覆盖配置 `group` 与默认 `LLM Watch` 两种 URL 参数。
- [x] 3.3 运行 `npm test`。
