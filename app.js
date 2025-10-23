// 引入必要的模块
const schedule = require('node-schedule');
const signin = require('./signin.js');
const fs = require("fs");
const path = require("path");
const configPath = path.join(__dirname, "./config/config.json");

// 读取配置
function readConfig() {
    try {
        const raw = fs.readFileSync(configPath);
        return JSON.parse(raw);
    } catch (error) {
        console.error('读取配置文件失败，将创建默认配置:', error.message);
        const defaultConfig = {
            "executeTime": "08:00:00",
            "accounts": [
                {
                    "name": "账户1",
                    "cookies": "在这里填入你的cookie",
                    "csrfToken": "在这里填入页面中的csrf token"
                },
                {
                    "name": "账户2",
                    "cookies": "在这里填入你的cookie",
                    "csrfToken": "在这里填入页面中的csrf token"
                }
            ]
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        const raw = fs.readFileSync(configPath);
        return JSON.parse(raw);
    }
}

/**
 * 启动定时任务
 */
function startSchedule() {
    const config = readConfig();
    
    // 解析执行时间
    const [hour, minute, second] = config.executeTime.split(':').map(Number);

    // 创建定时任务 (每天的指定时间执行)
    const job = schedule.scheduleJob({
        hour: hour,
        minute: minute,
        second: second
    }, async () => {
        console.log('定时任务触发，开始执行签到...');
        await signin();
        console.log('签到任务完成');
    });

    console.log(`定时任务已启动，将在每天 ${config.executeTime} 执行`);
    console.log('定时任务ID:', job.name);

    // 返回任务对象，便于外部控制
    return job;
}

// 立即执行一次签到（可选）
async function runOnce() {
    console.log('立即执行签到任务...');
    await signin();
    console.log('立即签到完成');
}

// 主函数
async function main() {
    try {
        // 启动定时任务
        const job = startSchedule();
        
        // 程序持续运行
        console.log('定时任务已启动，程序将持续运行...');
        
        // 处理程序退出
        process.on('SIGINT', () => {
            console.log('\n正在停止定时任务...');
            job.cancel();
            console.log('定时任务已停止');
            process.exit(0);
        });
        
    } catch (error) {
        console.error('程序启动失败:', error);
        process.exit(1);
    }
    try {
        require('./server.js');
    } catch (error) {
        console.error('web管理界面启动失败:', error);
    }
}

// 导出函数
module.exports = { startSchedule, runOnce,main };

// 如果直接运行此文件，则启动主程序
if (require.main === module) {
    main();
}