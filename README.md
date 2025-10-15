# MineBBS自动签到脚本

MineBBS我的世界中文论坛自动签到脚本，支持多账户管理、定时签到和Web管理界面。

## 部署方式

### 方法一：本地部署

1. 确保已安装[Node.js](https://nodejs.org/zh-cn/)

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

5. 创建配置文件
```bash
# 复制示例配置文件并编辑
cp config.json.example config.json
# 编辑config.json添加您的账户信息
```

6. 启动应用
```bash
node app
```

7. 访问Web管理界面
```
http://localhost:3000
```

默认管理员账号：
- 用户名：admin
- 密码：admin123

**首次登录后请立即修改密码！**

### 方法二：使用Docker部署（容器内独立运行）

本方式在Docker容器内部拉取并运行项目，不需要映射本地目录到容器。

#### 前置要求
- 安装Docker
- 安装Docker Compose（可选）

#### 方式一：从Docker Hub直接拉取（推荐）

1. 拉取Docker镜像
```bash
docker pull lingran7031/minebbs-auto-signin:latest
```

2. 运行Docker容器
```bash
docker run -d \
  --name minebbs-autosignin \
  -p 3000:3000 \
  --restart unless-stopped \
  lingran7031/minebbs-auto-signin:latest
```

#### 方式二：本地构建并运行Docker容器

1. 确保Dockerfile已正确配置（已修改为在容器内拉取代码）

2. 构建Docker镜像
```bash
docker build -t minebbs-autosignin .
```

3. 运行Docker容器
```bash
docker run -d \
  --name minebbs-autosignin \
  -p 3000:3000 \
  --restart unless-stopped \
  minebbs-autosignin
```

#### 使用Docker Compose

1. 确保docker-compose.yml已正确配置（已移除卷挂载）

2. 使用Docker Compose构建和运行（本地构建方式）
```bash
docker-compose up -d
```

3. 或者修改docker-compose.yml使用Docker Hub镜像
```yaml
version: '3'

services:
  minebbs-autosignin:
    image: lingran7031/minebbs-auto-signin:latest
    container_name: minebbs-autosignin
    restart: unless-stopped
    ports:
      - "3000:3000"
    # 不使用卷挂载，所有数据在容器内运行
    # 环境变量
    environment:
      - NODE_ENV=production
```

#### 容器内配置说明
- 无论是从Docker Hub拉取还是本地构建的容器，启动时都会自动初始化应用环境
- 容器内预配置了必要的应用文件和默认配置
- 默认配置文件在容器内自动创建，包含默认的管理员账号和基础配置
- 配置文件和数据仅保存在容器内，容器删除后数据会丢失
- 如需使用自定义配置，可通过Web管理界面进行设置

#### 访问应用
1. 构建并运行容器后，访问：http://localhost:3000
2. 默认管理员账号：admin/admin123
3. 首次登录后请修改密码

#### 注意事项
- 如需持久化保存数据，请考虑使用Docker卷（不在本配置范围内）
- 从Docker Hub拉取的镜像已经预配置，无需额外的网络连接
- 使用本地构建方式时，确保容器内的Git可以访问GitHub（可能需要配置网络代理）
- 无论使用哪种方式，都可以通过Web界面进行配置和管理

### 配置文件说明

- `config.json`：签到配置文件，包含签到时间和账户信息
- `admin_config.json`：管理员账户配置文件

示例配置：
```json
{
  "executeTime": "08:00:00",
  "accounts": [
    {
      "name": "账户1",
      "cookies": "在这里填入你的cookie",
      "csrfToken": "在这里填入页面中的csrf token"
    }
  ]
}
```

### 查看日志

```bash
# 本地运行时查看日志
npm start # 直接在控制台查看

# Docker运行时查看日志
docker logs -f minebbs-autosignin

# Docker Compose运行时查看日志
docker-compose logs -f
```

## 使用说明

1. **添加签到账户**
   - 登录Web管理界面
   - 在设置页面添加您的MineBBS账户信息（cookie和csrf token）

2. **设置签到时间**
   - 在配置文件中修改`executeTime`字段，格式为"HH:mm:ss"

3. **手动触发签到**
   - 使用命令行：`npm run signin`
   - 通过Web管理界面的签到按钮

## 常见问题

1. **无法拉取Docker镜像**
   - 解决方案：使用本地部署方式、配置Docker镜像加速，或使用我们提供的Docker Hub镜像（lingran7031/minebbs-auto-signin:latest）

2. **签到失败**
   - 检查cookie和csrf token是否正确
   - 确认cookie是否过期，需要重新获取

3. **Web界面无法访问**
   - 检查端口是否被占用
   - 确认应用是否正常启动

## 配置方法

1. 首次运行脚本会自动生成默认配置文件 `config.json`

2. 编辑 `config.json` 文件，填入必要的信息

## 配置说明

配置文件 `config.json` 支持多账户配置，格式为账户对象数组：

```json
{
  "accounts": [
    {
      "name": "账户1",
      "cookies": "你的第一个账户cookie",
      "csrfToken": "你的第一个账户csrfToken"
    },
    {
      "name": "账户2",
      "cookies": "你的第二个账户cookie",
      "csrfToken": "你的第二个账户csrfToken"
    }
  ]
}
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