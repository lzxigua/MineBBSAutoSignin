/**
 * MineBBS 自动签到脚本 - Github Actions 单用户版本
 * 通过环境变量获取用户凭据，支持单用户签到
 */

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

// 从环境变量获取配置
const MINEBBS_COOKIES = process.env.MINEBBS_COOKIES;
const MINEBBS_CSRF_TOKEN = process.env.MINEBBS_CSRF_TOKEN;
const MINEBBS_ACCOUNT_NAME = process.env.MINEBBS_ACCOUNT_NAME || 'Github Actions 账户';
// 跳过随机延迟的标志（用于测试）
const SKIP_RANDOM_DELAY = process.env.MINEBBS_SKIP_DELAY === 'true';

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
 * 带重试的延迟函数（用于重试机制中的间隔）
 * @param {number} attempt 当前重试次数
 * @returns {Promise}
 */
function retryDelay(attempt) {
    // 指数退避：第 1 次重试等待 2 秒，第 2 次 4 秒，第 3 次 8 秒
    const delayTime = Math.min(2000 * Math.pow(2, attempt), 10000);
    return delay(delayTime);
}

/**
 * 解析 cookie 字符串为对象
 * @param {string} cookieString cookie 字符串
 * @returns {Object} cookie 对象
 */
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

/**
 * 创建带 cookie 的 axios 实例
 * @param {Object} config 配置对象
 * @returns {AxiosInstance}
 */
function createAxiosInstance(config) {
    const jar = new CookieJar();
    
    // 设置 cookie 到 CookieJar
    if (config.cookies) {
        const cookies = parseCookies(config.cookies);
        console.log(`[Cookie] 准备设置 ${Object.keys(cookies).length} 个 Cookie`);
        
        // 设置到 CookieJar
        Object.keys(cookies).forEach(key => {
            try {
                jar.setCookie(`${key}=${cookies[key]}`, 'https://www.minebbs.com');
            } catch (err) {
                console.error(`[Cookie] 设置 Cookie 失败 ${key}:`, err.message);
            }
        });
    }
    
    const axiosInstance = wrapper(axios.create({
        jar,
        withCredentials: true,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Referer': 'https://www.minebbs.com/',
            'Origin': 'https://www.minebbs.com',
            'Sec-Ch-Ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-User': '?1',
            'Sec-Fetch-Dest': 'document',
            'Cache-Control': 'max-age=0'
        },
        timeout: 30000,
        maxRedirects: 10,
        validateStatus: function (status) {
            return status >= 200 && status < 300;
        }
    }));

    return axiosInstance;
}

/**
 * 获取 CSRF Token（带重试）
 * @param {AxiosInstance} axiosInstance axios 实例
 * @param {number} maxRetries 最大重试次数
 * @returns {Promise<string|null>} CSRF Token
 */
async function getCsrfToken(axiosInstance, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`[获取 Token] 第 ${attempt} 次重试...`);
                await retryDelay(attempt);
            }
            console.log('[获取 Token] 正在获取 CSRF Token...');
            const response = await axiosInstance.get('https://www.minebbs.com/');

            // 提取最新的 csrf token
            const csrfMatch = response.data.match(/data-csrf="([^,]+),([^\"]+)"/);
            let csrfToken = null;
            if (csrfMatch && csrfMatch.length >= 3) {
                csrfToken = `${csrfMatch[1]},${csrfMatch[2]}`;
                console.log('[获取 Token] 成功获取 CSRF Token');
            } else {
                console.error('[获取 Token] 未在页面中找到 CSRF Token');
            }

            if (attempt > 0) {
                console.log('[获取 Token] 重试成功');
            }
            return csrfToken;
        } catch (error) {
            lastError = error;
            console.error(`[获取 Token] 获取失败 (尝试 ${attempt + 1}/${maxRetries}):`, error.message);
        }
    }
    
    console.error('[获取 Token] 达到最大重试次数，放弃获取');
    return null;
}

/**
 * 执行签到（带重试）
 * @param {AxiosInstance} axiosInstance axios 实例
 * @param {Object} account 账户信息
 * @param {number} maxRetries 最大重试次数
 * @returns {Promise<Object>} 签到结果
 */
async function performSignin(axiosInstance, account, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`[执行签到] 第 ${attempt} 次重试...`);
                await retryDelay(attempt);
            }
            console.log('[执行签到] 正在执行签到操作...');
            const csrfToken = account.csrfToken;
            if (!csrfToken) {
                console.error('[执行签到] CSRF Token 缺失，无法执行签到');
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

            // 调试输出：服务器响应
            console.log('[执行签到] 服务器响应状态码:', response.status);
            console.log('[执行签到] 服务器响应类型:', typeof response.data);
            
            // 检查签到是否成功
            const hasSignInSuccess = response.data.includes('签到成功');
            const hasSignInComplete = response.data.includes('今日签到已完成');
            const hasSignInDone = response.data.includes('已签到');
            
            console.log('[执行签到] 响应内容分析:');
            console.log(`  - 包含"签到成功": ${hasSignInSuccess}`);
            console.log(`  - 包含"今日签到已完成": ${hasSignInComplete}`);
            console.log(`  - 包含"已签到": ${hasSignInDone}`);
            
            const success = response.status === 200 && (hasSignInSuccess || hasSignInComplete || hasSignInDone);
            
            if (!success) {
                console.error('[执行签到] 签到失败，服务器响应内容:');
                // 截取前 500 个字符作为调试信息
                const preview = typeof response.data === 'string' ? 
                    response.data.substring(0, 500) : JSON.stringify(response.data).substring(0, 500);
                console.error(preview);
            }

            if (attempt > 0) {
                console.log('[执行签到] 重试成功');
            }
            return { success, message: success ? '签到成功！' : '签到失败，请查看上方详细错误信息' };
        } catch (error) {
            lastError = error;
            console.error(`[执行签到] 签到失败 (尝试 ${attempt + 1}/${maxRetries}):`, error.message);
        }
    }
    
    console.error('[执行签到] 达到最大重试次数，放弃签到');
    return { success: false, message: lastError ? lastError.message : '未知错误' };
}

/**
 * 主函数
 */
async function main() {
    console.log('========================================');
    console.log('=== MineBBS 自动签到 (Github Actions) ===');
    console.log('========================================');
    console.log(`执行时间：${new Date().toLocaleString('zh-CN')}`);
    console.log(`账户名称：${MINEBBS_ACCOUNT_NAME}`);
    console.log('========================================');

    // 验证必要的环境变量
    if (!MINEBBS_COOKIES) {
        console.error('[严重错误] 缺少必要的环境变量：MINEBBS_COOKIES');
        console.error('请确保已在 Github Secrets 中配置 MINEBBS_COOKIES');
        process.exit(1);
    }

    if (!MINEBBS_CSRF_TOKEN) {
        console.error('[严重错误] 缺少必要的环境变量：MINEBBS_CSRF_TOKEN');
        console.error('请确保已在 Github Secrets 中配置 MINEBBS_CSRF_TOKEN');
        process.exit(1);
    }

    try {
        // 执行随机延迟（如果未设置跳过）
        if (SKIP_RANDOM_DELAY) {
            console.log('[跳过延迟] 检测到 MINEBBS_SKIP_DELAY=true，跳过随机延迟');
        } else {
            const delayTime = getRandomDelay();
            console.log(`[随机延迟] 将在 ${delayTime / 1000}秒 (${Math.floor(delayTime / 60000)}分${Math.floor((delayTime % 60000) / 1000)}秒) 后开始签到...`);
            await delay(delayTime);
            console.log('[随机延迟] 延迟结束，开始执行签到');
        }

        // 创建账户对象
        const account = {
            name: MINEBBS_ACCOUNT_NAME,
            cookies: MINEBBS_COOKIES,
            csrfToken: MINEBBS_CSRF_TOKEN
        };

        // 创建 axios 实例
        const axiosInstance = createAxiosInstance(account);

        // 直接从环境变量获取 CSRF Token，如果没有则尝试从页面获取
        let csrfToken = MINEBBS_CSRF_TOKEN;
        if (!csrfToken) {
            console.log('[提示] 未设置 MINEBBS_CSRF_TOKEN，尝试从页面获取...');
            csrfToken = await getCsrfToken(axiosInstance, 3);
            
            if (!csrfToken) {
                console.error('[严重错误] 无法获取 CSRF Token，请手动配置 MINEBBS_CSRF_TOKEN');
                process.exit(1);
            }
            // 更新账户的 CSRF Token
            account.csrfToken = csrfToken;
        }

        // 直接执行签到（带重试）
        const { success, message } = await performSignin(axiosInstance, account, 3);
        console.log(`[签到结果] ${message}`);
        
        // 如果签到成功，确认签到状态
        if (success) {
            console.log('[签到确认] 正在确认签到结果...');
            const confirmToken = await getCsrfToken(axiosInstance, 3);
            if (confirmToken) {
                console.log('[签到确认] 成功获取页面 Token，签到流程结束');
            }
            console.log('[完成] 签到流程结束');
            process.exit(0);
        } else {
            console.error('[完成] 签到失败，请检查配置和网络连接');
            process.exit(1);
        }
    } catch (error) {
        console.error('[严重错误] 脚本执行出错:', error.message);
        console.error('错误堆栈:', error.stack);
        process.exit(1);
    }
    
    console.log('========================================');
}

// 执行主函数
main();
