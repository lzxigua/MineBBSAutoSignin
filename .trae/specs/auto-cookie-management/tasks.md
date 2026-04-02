# Tasks

- [x] Task 1: 创建 AES 加密/解密模块
  - [x] SubTask 1.1: 创建 `cookie-encrypt.js` - 使用公钥加密 Cookie
  - [x] SubTask 1.2: 创建 `cookie-decrypt.js` - 使用私钥解密 Cookie
  - [x] SubTask 1.3: 添加错误处理和日志输出

- [x] Task 6: 创建 AES 密钥生成工具
  - [x] SubTask 6.1: 创建 `generate-aes-keys.js` 脚本
  - [x] SubTask 6.2: 添加使用说明文档

- [x] Task 2: 创建自动登录 Action 脚本
  - [x] SubTask 2.1: 集成现有 `minebbs-login.js`
  - [x] SubTask 2.2: 添加时间检测逻辑（30 天判断）
  - [x] SubTask 2.3: 添加 Cookie 加密和提交功能
  - [x] SubTask 2.4: 添加 WAF 检测集成

- [x] Task 3: 创建 Cookie 管理模块
  - [x] SubTask 3.1: 创建 `cookie-manager.js` - 统一管理 Cookie 的读取、加密、解密
  - [x] SubTask 3.2: 添加时间戳管理功能
  - [x] SubTask 3.3: 添加 Cookie 有效性检测

- [x] Task 4: 修改 Github Actions 工作流
  - [x] SubTask 4.1: 更新 `signin.yml` 添加新的 Secrets
  - [x] SubTask 4.2: 集成自动登录步骤
  - [x] SubTask 4.3: 添加 Git 推送权限配置
  - [x] SubTask 4.4: 添加错误处理和重试机制

- [x] Task 5: 修改签到脚本集成 Cookie 解密
  - [x] SubTask 5.1: 更新 `signin-github.js` 支持从文件读取 Cookie
  - [x] SubTask 5.2: 集成 Cookie 解密功能
  - [x] SubTask 5.3: 添加 Cookie 失效时重新登录逻辑

- [ ] Task 7: 更新文档
  - [ ] SubTask 7.1: 更新 `README.md` 添加新配置说明
  - [ ] SubTask 7.2: 更新 `GITHUB_ACTIONS_GUIDE.md`
  - [ ] SubTask 7.3: 创建 `AUTO_LOGIN_GUIDE.md` 详细指南

- [ ] Task 8: 测试和验证
  - [ ] SubTask 8.1: 测试完整登录流程
  - [ ] SubTask 8.2: 测试 Cookie 加密/解密
  - [ ] SubTask 8.3: 测试 30 天自动更新逻辑
  - [ ] SubTask 8.4: 测试 Cookie 失效自动重新登录

# Task Dependencies
- Task 1 不依赖其他任务 ✅
- Task 6 不依赖其他任务 ✅
- Task 2 依赖 Task 1（需要加密模块）
- Task 3 依赖 Task 1（需要加密/解密模块）
- Task 4 依赖 Task 2 和 Task 3（需要登录和 Cookie 管理）
- Task 5 依赖 Task 3（需要 Cookie 管理）
- Task 7 依赖 Task 4 和 Task 5（需要功能完成）
- Task 8 依赖所有其他任务
