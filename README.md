# MineBBS 自动签到脚本

这是一个用于 MineBBS 我的世界中文论坛的自动签到脚本，使用 Node.js 编写，可以帮助用户自动完成每日签到任务，获取论坛金粒等奖励。

## 功能特点

- 自动检测签到状态
- 自动执行签到操作
- 配置简单，使用方便
- 支持自定义检查间隔
- **支持 Github Actions 自动签到**
- **随机延迟机制降低风控风险**
- **完善的日志记录和错误处理**
- **本地部署支持多账户 + WebUI 管理**

## 安装步骤

1. 确保你的电脑上已安装 [Node.js](https://nodejs.org/zh-cn/)

2. 克隆本项目到本地

```bash
git clone https://github.com/lingran7031/MineBBSAutoSignin.git
cd MineBBSAutoSignin
```

3. 打开命令行工具，进入项目目录

4. 安装依赖包

```bash
npm install
```

## 部署方式

### 方法一：本地部署（多用户 + WebUI）

适合有本地服务器的用户，支持多账户管理和 Web 界面。

1. 配置 `config/config.json` 文件
2. 运行 `npm start` 启动定时任务和 WebUI
3. 访问 `http://localhost:3000` 管理账户和设置

### 方法二：Github Actions（推荐）

通过 Github Actions 实现云端自动签到，无需本地服务器。

详细配置请参考：[Github Actions 配置指南](GITHUB_ACTIONS_GUIDE.md)

#### 快速配置

1. 在 Github 仓库 Settings 中配置 Secrets：
   - `MINEBBS_COOKIES`: 你的论坛 Cookie
   - `MINEBBS_CSRF_TOKEN`: 你的 CSRF Token
   - `MINEBBS_ACCOUNT_NAME`: 账户名称（可选）

2. 工作流会自动运行：
   - 北京时间每天 08:00 自动执行
   - 支持手动触发
   - 包含 1-5 分钟随机延迟

### 方法三：系统定时任务

如果你希望脚本定期自动运行，可以设置系统定时任务：

#### Windows 系统

1. 打开任务计划程序

2. 创建基本任务，设置每日运行时间

3. 操作选择"启动程序"

4. 程序或脚本选择 `node.exe`，添加参数为 `signin.js`，起始于为脚本所在目录

#### Linux/Mac 系统

使用 cron 定时任务：

```bash
crontab -e
```

添加以下行（每天上午 8 点运行）：

```
0 8 * * * cd /path/to/MineBBSAutoSignin && npm start
```

## 配置说明

### 本地部署配置

配置文件 `config/config.json` 支持多账户配置，格式为账户对象数组：

```json
{
  "executeTime": "08:00:00",
  "accounts": [
    {
      "name": "账户 1",
      "cookies": "你的第一个账户 cookie",
      "csrfToken": "你的第一个账户 csrfToken"
    },
    {
      "name": "账户 2",
      "cookies": "你的第二个账户 cookie",
      "csrfToken": "你的第二个账户 csrfToken"
    }
  ]
}
```

### Github Actions 配置

在 Github 仓库的 Settings -> Secrets and variables -> Actions 中配置：

- `MINEBBS_COOKIES` (必填): 完整的 Cookie 字符串
- `MINEBBS_CSRF_TOKEN` (必填): CSRF Token
- `MINEBBS_ACCOUNT_NAME` (可选): 账户名称，默认为 "Github Actions 账户"
- `MINEBBS_SKIP_DELAY` (可选): 是否跳过随机延迟，设置为 `true` 可跳过 1-5 分钟延迟（用于测试），默认为 `false`

### 获取 Cookie 和 CSRF Token 的方法

1. 使用浏览器（推荐 Chrome 或 Firefox）访问 [MineBBS 论坛](https://www.minebbs.com/)

2. 登录你的账号

3. 按 `F12` 打开开发者工具，切换到 `网络` 或 `Network` 选项卡

4. 刷新页面，找到一个请求（通常是第一个请求），查看其 `请求头` 或 `Request Headers`

5. 复制 `Cookie` 字段的完整内容，粘贴到配置文件的 `cookies` 字段中

6. 切换到 `元素` 或 `Elements` 选项卡，查找 HTML 标签中的 `data-csrf` 属性，复制其完整值，粘贴到 `csrfToken` 字段中

   通常可以在 `<html>` 标签中找到，格式类似于：`data-csrf="123456789,abcdef1234567890"`

## 使用方法

安装依赖并配置完成后，可以通过以下命令运行脚本：

```bash
# 本地部署模式（启动 WebUI + 定时任务）
npm start

# 手动执行一次签到
npm run signin

# 启动 Web 管理界面
npm run web

# Github Actions 模式（需要配置环境变量）
npm run signin:github
```

## 随机延迟机制

为了降低被风控系统检测的风险，所有签到方式都支持随机延迟：

- **延迟范围**: 1-5 分钟（60-300 秒）
- **应用场景**:
  - Github Actions 自动签到
  - 本地部署定时任务
  - 手动执行签到

延迟时间会在每次签到前随机生成，并在日志中显示。

## 重试机制

为应对临时网络问题，Github Actions 版本内置了自动重试机制：

- **最大重试次数**: 3 次
- **重试间隔**: 指数退避（2 秒、4 秒、8 秒、最多 10 秒）
- **适用场景**: 网络请求失败时自动重试

## 签到逻辑

Github Actions 版本采用**直接签到**策略：

- **不预先检查**: 避免误判导致跳过签到
- **直接执行**: 调用签到接口完成签到
- **自动重试**: 遇到网络问题自动重试最多 3 次

## 日志输出示例

```
=== MineBBS 自动签到脚本 ===
执行时间：2024/1/1 08:01:23
运行模式：多账户模式 (本地部署)

=== 处理账户 账户 1 (1/2) ===
[随机延迟] 将在 187 秒 (3 分 7 秒) 后开始签到...
[随机延迟] 延迟结束，开始执行签到
[状态检查] 正在检查签到状态...
[执行签到] 正在执行签到操作...
[签到结果] 签到成功！
[签到确认] 确认签到成功！
[账户间隔] 等待 45 秒后继续下一个账户...

=== 处理账户 账户 2 (2/2) ===
...
=== 脚本执行完毕 ===
```

## 注意事项

1. Cookie 和 CSRF Token 可能会过期，过期后需要重新获取并更新配置

2. 不要频繁运行脚本，以免被论坛服务器识别为异常行为

3. 使用本脚本请遵守论坛规则，合理使用自动化工具

4. 脚本仅供学习和个人使用，请勿用于商业用途

5. 如论坛网站结构或签到机制发生变化，脚本可能需要更新

## 问题排查

如果签到失败，请检查以下几点：

1. Cookie 是否正确且未过期
2. CSRF Token 是否正确
3. 网络连接是否正常
4. 是否已经签到过了

如有其他问题，请查看控制台输出的错误信息。

## 相关文档

- [Github Actions 配置指南](GITHUB_ACTIONS_GUIDE.md) - 详细的 Github Actions 配置说明
- [项目 License](LICENSE) - MIT License

## 免责声明

使用本脚本产生的一切后果由使用者自行承担，作者不承担任何责任。
