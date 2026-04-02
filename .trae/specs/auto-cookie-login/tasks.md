# Tasks

- [x] Task 1: 创建 AES 加密/解密工具模块
  - [x] Subtask 1.1: 创建 `login/crypto.js` 实现 AES-256-GCM 加密/解密
  - [x] Subtask 1.2: 实现加密函数（Cookie + 时间戳 → 加密数据）
  - [x] Subtask 1.3: 实现解密函数（加密数据 → Cookie + 时间戳验证）
  - [x] Subtask 1.4: 添加密钥生成工具函数

- [x] Task 2: 创建自动化登录脚本
  - [x] Subtask 2.1: 参考 `login/minebbs-login.js` 创建 `login/auto-login.js` 主登录流程
  - [x] Subtask 2.2: 集成 WAF 绕过（使用 `waf-handler.js`）
  - [x] Subtask 2.3: 实现账号密码登录（从环境变量获取）
  - [x] Subtask 2.4: 集成 TOTP 两步验证（从环境变量获取密钥）
  - [x] Subtask 2.5: 验证登录状态并提取 Cookie

- [x] Task 3: 创建 Cookie 管理脚本
  - [x] Subtask 3.1: 创建 `login/cookie-manager.js`
  - [x] Subtask 3.2: 实现加密 Cookie 并提交到 Git 仓库
  - [x] Subtask 3.3: 实现从 Git 仓库读取并解密 Cookie
  - [x] Subtask 3.4: 实现时间戳验证（30 天有效期检测）

- [x] Task 4: 更新 Github Actions 工作流
  - [x] Subtask 4.1: 修改 `.github/workflows/signin.yml` 集成自动登录
  - [x] Subtask 4.2: 添加登录步骤和条件判断
  - [x] Subtask 4.3: 配置 Git 推送权限
  - [x] Subtask 4.4: 添加错误处理和重试机制

- [x] Task 5: 更新签到脚本

  * [ ] Subtask 5.1: 修改 `signin-github.js` 使用 Cookie 管理器

  * [ ] Subtask 5.2: 移除 `MINEBBS_COOKIES` 依赖

  * [ ] Subtask 5.3: 集成解密后的 Cookie 使用

* [x] Task 6: 创建配置和文档
  - [x] Subtask 6.1: 创建 Github Secrets 配置说明
  - [x] Subtask 6.2: 更新 README.md 添加新部署方式
  - [x] Subtask 6.3: 创建快速开始指南

* [x] Task 7: 测试和验证
  - [x] Subtask 7.1: 测试完整登录流程
  - [x] Subtask 7.2: 测试加密/解密功能
  - [x] Subtask 7.3: 测试 30 天有效期检测
  - [x] Subtask 7.4: 端到端测试签到流程

# Task Dependencies

* \[Task 2] depends on \[Task 1] - 自动登录需要加密功能

* \[Task 3] depends on \[Task 1] - Cookie 管理需要加密/解密

* \[Task 4] depends on \[Task 2] - Actions 需要登录脚本

* \[Task 4] depends on \[Task 3] - Actions 需要 Cookie 管理

* \[Task 5] depends on \[Task 3] - 签到脚本需要 Cookie 管理器

* \[Task 7] depends on \[Task 4] - 测试需要完整的工作流

* \[Task 7] depends on \[Task 5] - 测试需要签到脚本集成

