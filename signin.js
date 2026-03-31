const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, './config/config.json');

// 读取配置
function readConfig() {
    try {
        const config = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(config);
    } catch (error) {
        console.error('读取配置文件失败，将创建默认配置:', error.message);
        const defaultConfig = {
            "accounts": [
                {
                    "name": "账户 1",
                    "cookies": "在这里填入你的 cookie",
                    "csrfToken": "在这里填入页面中的 csrf token"
                },
                {
                    "name": "账户 2",
                    "cookies": "在这里填入你的 cookie",
                    "csrfToken": "在这里填入页面中的 csrf token"
                }
            ]
        };
        // 确保 config 目录存在
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        const config = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(config);
    }
}

// 解析cookie字符串为对象
function parseCookies(cookieString) {
    const cookies = {};
    cookieString.split(';').forEach(cookie => {
        const parts = cookie.trim().split('=');
        if (parts.length === 2) {
            cookies[parts[0]] = parts[1];
        }
    });
    return cookies;
}

// 创建带cookie的axios实例
function createAxiosInstance(config) {
    const jar = new CookieJar();
    const axiosInstance = wrapper(axios.create({
        jar,
        withCredentials: true,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Referer': 'https://www.minebbs.com/',
            'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 30000
    }));

    // 设置cookie
    if (config.cookies) {
        const cookies = parseCookies(config.cookies);
        Object.keys(cookies).forEach(key => {
            jar.setCookie(`${key}=${cookies[key]}`, 'https://www.minebbs.com');
        });
    }

    return axiosInstance;
}

// 检查是否已经签到
async function checkSigninStatus(axiosInstance) {
    try {
        console.log('正在检查签到状态...');
        const response = await axiosInstance.get('https://www.minebbs.com/');

        // 检查是否已签到
        const isSigned = response.data.includes('今日签到已完成') ||
            !response.data.includes('今日尚未签到');

        // 提取最新的csrf token（如果页面中有的话）
        const csrfMatch = response.data.match(/data-csrf="([^,]+),([^\"]+)"/);
        let csrfToken = null;
        if (csrfMatch && csrfMatch.length >= 3) {
            csrfToken = `${csrfMatch[1]},${csrfMatch[2]}`;
        }

        return { isSigned, csrfToken };
    } catch (error) {
        console.error('检查签到状态失败:', error.message);
        return { isSigned: false, csrfToken: null };
    }
}

// 执行签到
async function performSignin(axiosInstance, account) {
    try {
        console.log('正在执行签到...');
        const csrfToken = account.csrfToken;
        if (!csrfToken) {
            console.error('CSRF Token 缺失，无法执行签到');
            return { success: false, message: 'CSRF Token 缺失' };
        }

        const payload = new URLSearchParams();
        payload.append('_xfToken', csrfToken);
        payload.append('currency_ids[]', '1');
        payload.append('currency_ids[]', '5');

        const response = await axiosInstance.post('https://www.minebbs.com/credits/clock',
            payload.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        // 添加调试输出
        //console.log('服务器响应状态:', response.status);
        //console.log('服务器响应内容:', response.data);
        // 检查签到是否成功
        const success = response.status === 200 &&
            (response.data.includes('签到成功') ||
                response.data.includes('今日签到已完成') ||
                response.data.includes('已签到'));

        return { success, message: success ? '签到成功！' : '签到失败，请检查配置' };
    } catch (error) {
        console.error('签到请求失败:', error.message);
        return { success: false, message: error.message };
    }
}

/**
 * 生成随机延迟时间（1-5 分钟）
 * @returns {number} 延迟时间（毫秒）
 */
function getRandomDelay() {
    const minDelay = 60 * 1000; // 1 分钟
    const maxDelay = 5 * 60 * 1000; // 5 分钟
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    return delay;
}

/**
 * 延迟执行函数
 * @param {number} ms 延迟毫秒数
 * @returns {Promise}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 主签到函数
 * @param {Object} options 可选配置
 * @param {boolean} options.skipRandomDelay 是否跳过随机延迟（用于 WebUI 手动触发）
 * @param {Object} options.singleAccount 单账户模式下的账户信息（用于 Github Actions）
 */
async function signin(options = {}) {
    const { skipRandomDelay = false, singleAccount = null } = options;
    
    console.log('=== MineBBS 自动签到脚本 ===');
    console.log(`执行时间：${new Date().toLocaleString('zh-CN')}`);

    try {
        // 读取配置
        const config = readConfig();
        let accounts = config.accounts || [];
        
        // 单账户模式（用于 Github Actions）
        if (singleAccount) {
            accounts = [singleAccount];
            console.log('运行模式：单账户模式 (Github Actions)');
        } else {
            console.log('运行模式：多账户模式 (本地部署)');
        }

        // 检查是否有账户
        if (accounts.length === 0) {
            console.warn('警告：没有配置任何账户');
            return;
        }

        // 遍历每个账户
        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            console.log(`\n=== 处理账户 ${account.name} (${i + 1}/${accounts.length}) ===`);
            
            // 执行签到前随机延迟（跳过首次立即执行的情况）
            if (!skipRandomDelay && i === 0) {
                const delayTime = getRandomDelay();
                console.log(`[随机延迟] 将在 ${delayTime / 1000}秒 (${Math.floor(delayTime / 60000)}分${Math.floor((delayTime % 60000) / 1000)}秒) 后开始签到...`);
                await delay(delayTime);
                console.log('[随机延迟] 延迟结束，开始执行签到');
            }
            
            // 创建 axios 实例
            const axiosInstance = createAxiosInstance(account);
            // 检查签到状态
            const { isSigned, csrfToken } = await checkSigninStatus(axiosInstance);

            // 如果有新的 csrf token，使用新的
            if (csrfToken) {
                account.csrfToken = csrfToken;
            }

            // 处理签到逻辑
            if (isSigned) {
                console.log('[签到状态] 今天已经签到过了，无需重复签到');
            } else {
                const { success, message } = await performSignin(axiosInstance, account);
                console.log(`[签到结果] ${message}`);
                // 再次检查签到状态，确认是否成功
                if (success) {
                    const { isSigned: newStatus } = await checkSigninStatus(axiosInstance);
                    if (newStatus) {
                        console.log('[签到确认] 确认签到成功！');
                    } else {
                        console.error('[签到确认] 警告：签到响应成功但状态未更新');
                    }
                }
            }
            
            // 账户间延迟（最后一个账户不等待）
            if (i < accounts.length - 1) {
                const randomWait = Math.floor(Math.random() * 30000) + 30000;
                console.log(`[账户间隔] 等待${randomWait / 1000}秒后继续下一个账户...`);
                await delay(randomWait);
            }
        }
    } catch (error) {
        console.error('[严重错误] 脚本执行出错:', error.message);
        console.error('错误堆栈:', error.stack);
        throw error;
    }
    console.log('=== 脚本执行完毕 ===\n');
}
// 导出签到函数
module.exports = signin
// 如果直接运行此文件，则执行签到
if (require.main === module) {
    signin();
}