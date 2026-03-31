# 仓库保活说明

## 为什么需要保活？

根据 Github 的政策，如果仓库在 **60 天内没有任何提交活动**，Github Actions 可能会被自动禁用。为了避免这种情况，我们添加了自动保活工作流。

## 保活工作流

### 工作原理

1. **定时检查**: 每天 UTC 00:00 自动运行
2. **智能判断**: 只有在距离上次提交超过 **30 天** 时才会执行提交
3. **自动提交**: 更新保活文件并推送到仓库

### 相关文件

- `.github/workflows/keep-alive.yml` - 保活工作流配置
- `.github/KEEP_ALIVE.md` - 保活记录文件（自动生成）
- `.github/KEEP_ALIVE_TIMESTAMP` - 时间戳文件（自动生成）

### 日志输出示例

```
Days since last keep-alive: 35
Kept alive by workflow: keep-alive
```

或

```
Days since last keep-alive: 15
Less than 30 days since last update, nothing to do.
```

## 配置说明

### 触发条件

```yaml
on:
  schedule:
    - cron: '0 0 * * *'  # 每天 UTC 00:00
  workflow_dispatch:      # 支持手动触发
```

### 权限要求

```yaml
permissions:
  contents: write  # 需要写入权限以推送提交
```

### 时间间隔

```bash
MIN_DAYS: "30"  # 每 30 天提交一次
```

你可以根据需要修改这个值，建议设置为 30 天（远小于 60 天的限制）。

## 手动触发

如果需要立即执行保活，可以：

1. 进入仓库的 `Actions` 标签页
2. 选择 `Keep-Alive` 工作流
3. 点击 `Run workflow` 按钮
4. 点击 `Run workflow` 执行

## 注意事项

1. **首次运行**: 第一次运行时会创建保活文件
2. **权限设置**: 确保工作流有写入权限
3. **分支保护**: 如果有分支保护规则，需要允许 Actions 推送

## 相关文件结构

```
.github/
├── workflows/
│   ├── signin.yml         # 签到工作流
│   └── keep-alive.yml     # 保活工作流
├── KEEP_ALIVE.md          # 保活记录（自动生成）
└── KEEP_ALIVE_TIMESTAMP   # 时间戳（自动生成）
```

## 禁用保活

如果需要禁用保活工作流，可以：

1. 删除 `.github/workflows/keep-alive.yml` 文件
2. 或在 Actions 页面禁用该工作流

**注意**: 禁用后请确保定期手动提交，否则 Actions 可能被禁用。

## 参考

- [Github Actions 使用限制文档](https://docs.github.com/en/actions/learn-github-actions/usage-limits-billing-and-administration)
- [Cron 表达式语法](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#onschedule)
