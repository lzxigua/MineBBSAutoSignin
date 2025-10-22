// 引入必要的模块
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { startSchedule, main } = require('./app');
const signin = require('./signin');

// 创建Express应用
const app = express();

// 设置视图引擎和静态文件目录
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// 设置中间件
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 设置session
app.use(session({
    secret: 'MineBBS_AutoSignin_Secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 24小时
    }
}));

// 管理员用户配置文件路径
const adminConfigPath = path.join(__dirname, 'admin_config.json');
const configPath = path.join(__dirname, 'config.json');

// 初始化管理员配置
function initAdminConfig() {
    try {
        if (!fs.existsSync(adminConfigPath)) {
            // 默认管理员密码: admin123 (请首次登录后修改)
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            const defaultConfig = {
                username: 'admin',
                password: hashedPassword
            };
            fs.writeFileSync(adminConfigPath, JSON.stringify(defaultConfig, null, 2));
            console.log('管理员配置文件已创建，请首次登录后修改密码');
        }
        return JSON.parse(fs.readFileSync(adminConfigPath, 'utf8'));
    } catch (error) {
        console.error('读取管理员配置文件失败:', error.message);
        process.exit(1);
    }
}

// 读取配置文件
function readConfig() {
    try {
        const raw = fs.readFileSync(configPath);
        return JSON.parse(raw);
    } catch (error) {
        console.error('读取配置文件失败:', error.message);
        const defaultConfig = {
            executeTime: '08:00:00',
            accounts: []
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
}

// 保存配置文件
function saveConfig(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error('保存配置文件失败:', error.message);
        return false;
    }
}

// 验证登录中间件
function isAuthenticated(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    }
    res.redirect('/login');
}

// 路由 - 登录页面
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// 路由 - 登录验证
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const adminConfig = initAdminConfig();
    
    if (username === adminConfig.username && bcrypt.compareSync(password, adminConfig.password)) {
        req.session.authenticated = true;
        res.redirect('/');
    } else {
        res.render('login', { error: '用户名或密码错误' });
    }
});

// 路由 - 登出
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// 路由 - 设置页面
app.get('/settings', isAuthenticated, (req, res) => {
    res.render('settings', {
        message: req.query.message || null,
        error: req.query.error || null
    });
});

// 路由 - 修改密码
app.post('/change-password', isAuthenticated, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const adminConfig = initAdminConfig();
    
    if (bcrypt.compareSync(currentPassword, adminConfig.password)) {
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        adminConfig.password = hashedPassword;
        fs.writeFileSync(adminConfigPath, JSON.stringify(adminConfig, null, 2));
        res.redirect('/settings?message=密码修改成功');
    } else {
        res.redirect('/settings?error=当前密码错误');
    }
});

// 路由 - 首页/账号管理
app.get('/', isAuthenticated, (req, res) => {
    const config = readConfig();
    res.render('index', {
        accounts: config.accounts,
        executeTime: config.executeTime,
        message: req.query.message || null,
        error: req.query.error || null
    });
});

// 路由 - 添加账号
app.post('/add-account', isAuthenticated, (req, res) => {
    const { name, cookies, csrfToken } = req.body;
    const config = readConfig();
    
    // 检查是否已存在同名账号
    const existingAccount = config.accounts.find(acc => acc.name === name);
    if (existingAccount) {
        return res.redirect('/?error=账号名称已存在');
    }
    
    config.accounts.push({
        name,
        cookies,
        csrfToken
    });
    
    if (saveConfig(config)) {
        res.redirect('/?message=账号添加成功');
    } else {
        res.redirect('/?error=账号添加失败');
    }
});

// 路由 - 编辑账号
app.post('/edit-account', isAuthenticated, (req, res) => {
    const { id, name, cookies, csrfToken } = req.body;
    const config = readConfig();
    
    if (id >= 0 && id < config.accounts.length) {
        config.accounts[id] = {
            name,
            cookies,
            csrfToken
        };
        
        if (saveConfig(config)) {
            res.redirect('/?message=账号更新成功');
        } else {
            res.redirect('/?error=账号更新失败');
        }
    } else {
        res.redirect('/?error=无效的账号ID');
    }
});

// 路由 - 删除账号
app.post('/delete-account', isAuthenticated, (req, res) => {
    const { id } = req.body;
    const config = readConfig();
    
    if (id >= 0 && id < config.accounts.length) {
        config.accounts.splice(id, 1);
        
        if (saveConfig(config)) {
            res.redirect('/?message=账号删除成功');
        } else {
            res.redirect('/?error=账号删除失败');
        }
    } else {
        res.redirect('/?error=无效的账号ID');
    }
});

// 路由 - 设置定时时间
app.post('/set-time', isAuthenticated, (req, res) => {
    const { executeTime } = req.body;
    const config = readConfig();
    
    // 验证时间格式 HH:MM:SS
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    if (!timeRegex.test(executeTime)) {
        return res.redirect('/?error=时间格式不正确，请使用HH:MM:SS格式');
    }
    
    config.executeTime = executeTime;
    
    if (saveConfig(config)) {
        // 重新启动定时任务
        try {
            startSchedule();
            res.redirect('/?message=定时时间设置成功，已重新启动定时任务');
        } catch (error) {
            res.redirect('/?error=定时任务重启失败: ' + error.message);
        }
    } else {
        res.redirect('/?error=定时时间设置失败');
    }
});

// 路由 - 手动执行签到
app.post('/manual-signin', isAuthenticated, async (req, res) => {
    try {
        await signin();
        res.redirect('/?message=手动签到执行成功');
    } catch (error) {
        res.redirect('/?error=手动签到执行失败: ' + error.message);
    }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Web管理界面已启动，访问 http://localhost:${PORT} 进行管理`);
    console.log('默认账号: admin, 默认密码: admin123 (请首次登录后修改)');
    main();
});

module.exports = app;