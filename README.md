# MineBBS自动签到脚本

这是一个用于MineBBS我的世界中文论坛的自动签到脚本，使用Node.js编写，可以帮助用户自动完成每日签到任务，获取论坛金粒等奖励。

## 功能特点

- 自动检测签到状态
- 自动执行签到操作
- 配置简单，使用方便
- 支持自定义检查间隔

## 安装步骤

1. 确保你的电脑上已安装[Node.js](https://nodejs.org/zh-cn/)

2. 下载或克隆本项目到本地

3. 打开命令行工具，进入项目目录

4. 安装依赖包

```bash
npm install
```

## 配置方法

1. 首次运行脚本会自动生成默认配置文件 `config.json`

2. 编辑 `config.json` 文件，填入必要的信息

## 配置说明

配置文件 `config.json` 支持多账户配置，格式为账户对象数组：

```json
[
  {
    "name": "账户1",
    "cookies": "你的第一个账户cookie",
    "csrfToken": "你的第一个账户csrfToken",
    "checkInterval": 3600000
  },
  {
    "name": "账户2",
    "cookies": "你的第二个账户cookie",
    "csrfToken": "你的第二个账户csrfToken",
    "checkInterval": 3600000
  }
]
```

### 配置参数说明
- `name`: 账户名称（用于日志区分，可选）
- `cookies`: 用户登录cookie（必填）
- `csrfToken`: CSRF令牌（必填）
### 获取Cookie和CSRF Token的方法

1. 使用浏览器（推荐Chrome或Firefox）访问 [MineBBS论坛](https://www.minebbs.com/)

2. 登录你的账号

3. 按 `F12` 打开开发者工具，切换到 `网络` 或 `Network` 选项卡

4. 刷新页面，找到一个请求（通常是第一个请求），查看其 `请求头` 或 `Request Headers`

5. 复制 `Cookie` 字段的完整内容，粘贴到 `config.json` 的 `cookies` 字段中

6. 切换到 `元素` 或 `Elements` 选项卡，查找HTML标签中的 `data-csrf` 属性，复制其完整值，粘贴到 `config.json` 的 `csrfToken` 字段中

   通常可以在 `<html>` 标签中找到，格式类似于：`data-csrf="123456789,abcdef1234567890"`

## 使用方法

安装依赖并配置完成后，可以通过以下命令运行脚本：

```bash
npm start
```

## 设置定时任务（可选）

如果你希望脚本定期自动运行，可以设置系统定时任务：

### Windows系统

1. 打开任务计划程序

2. 创建基本任务，设置每日运行时间

3. 操作选择"启动程序"

4. 程序或脚本选择 `node.exe`，添加参数为 `signin.js`，起始于为脚本所在目录

### Linux/Mac系统

使用cron定时任务：

```bash
crontab -e
```

添加以下行（每天上午8点运行）：

```
0 8 * * * cd /path/to/MineBBSAutoSignin && npm start
```

## 注意事项

1. Cookie和CSRF Token可能会过期，过期后需要重新获取并更新配置文件

2. 不要频繁运行脚本，以免被论坛服务器识别为异常行为

3. 使用本脚本请遵守论坛规则，合理使用自动化工具

4. 脚本仅供学习和个人使用，请勿用于商业用途

5. 如论坛网站结构或签到机制发生变化，脚本可能需要更新

## 问题排查

如果签到失败，请检查以下几点：

1. Cookie是否正确且未过期
2. CSRF Token是否正确
3. 网络连接是否正常
4. 是否已经签到过了

如有其他问题，请查看控制台输出的错误信息

## 免责声明

使用本脚本产生的一切后果由使用者自行承担，作者不承担任何责任。