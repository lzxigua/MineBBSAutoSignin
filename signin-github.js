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

    // 设置 cookie
    if (config.cookies) {
        const cookies = parseCookies(config.cookies);
        Object.keys(cookies).forEach(key => {
            jar.setCookie(`${key}=${cookies[key]}`, 'https://www.minebbs.com');
        });
    }

    return axiosInstance;
}

/**
 * 检查是否已经签到（带重试）
 * @param {AxiosInstance} axiosInstance axios 实例
 * @param {number} maxRetries 最大重试次数
 * @returns {Promise<Object>} 签到状态和 csrf token
 */
async function checkSigninStatus(axiosInstance, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`[状态检查] 第 ${attempt} 次重试...`);
                await retryDelay(attempt);
            }
            console.log('[状态检查] 正在检查签到状态...');
            const response = await axiosInstance.get('https://www.minebbs.com/');

            // 调试输出：检查页面关键内容
            const hasSignedInText = response.data.includes('今日签到已完成');
            const hasNotSignedInText = response.data.includes('今日尚未签到');
            const hasDailySigninText = response.data.includes('每日签到');
            
            console.log('[状态检查] === 页面内容分析 ===');
            console.log(`[状态检查] 包含"每日签到": ${hasDailySigninText}`);
            console.log(`[状态检查] 包含"今日签到已完成": ${hasSignedInText}`);
            console.log(`[状态检查] 包含"今日尚未签到": ${hasNotSignedInText}`);
            
            // 改进的判断逻辑：
            // 1. 如果明确包含"今日签到已完成"，说明已签到
            // 2. 如果包含"每日签到"和"今日尚未签到"，说明是签到按钮页面，即未签到
            // 3. 如果两个关键词都没有，可能是页面结构变化或未登录，保守判断为未签到
            let isSigned = false;
            if (hasSignedInText) {
                isSigned = true;
                console.log('[状态检查] 检测到"今日签到已完成"，判断为已签到');
            } else if (hasDailySigninText && hasNotSignedInText) {
                isSigned = false;
                console.log('[状态检查] 检测到"每日签到"和"今日尚未签到"，判断为未签到');
            } else {
                console.log('[状态检查] 警告：无法明确判断签到状态，默认判断为未签到');
                console.log('[状态检查] 可能原因：Cookie 失效、页面结构变化、或未登录');
                isSigned = false;
            }
            
            console.log(`[状态检查] 最终判断结果：${isSigned ? '已签到' : '未签到'}`);
            console.log('[状态检查] === 分析结束 ===');

            // 提取最新的 csrf token（如果页面中有的话）
            const csrfMatch = response.data.match(/data-csrf="([^,]+),([^\"]+)"/);
            let csrfToken = null;
            if (csrfMatch && csrfMatch.length >= 3) {
                csrfToken = `${csrfMatch[1]},${csrfMatch[2]}`;
            }

            if (attempt > 0) {
                console.log('[状态检查] 重试成功');
            }
            return { isSigned, csrfToken };
        } catch (error) {
            lastError = error;
            console.error(`[状态检查] 检查失败 (尝试 ${attempt + 1}/${maxRetries}):`, error.message);
        }
    }
    
    console.error('[状态检查] 达到最大重试次数，放弃检查');
    return { isSigned: false, csrfToken: null };
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

            // 检查签到是否成功
            const success = response.status === 200 &&
                (response.data.includes('签到成功') ||
                    response.data.includes('今日签到已完成') ||
                    response.data.includes('已签到'));

            if (attempt > 0) {
                console.log('[执行签到] 重试成功');
            }
            return { success, message: success ? '签到成功！' : '签到失败，请检查配置' };
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

        // 检查签到状态（带重试）
        const { isSigned, csrfToken } = await checkSigninStatus(axiosInstance, 3);

        // 如果有新的 csrf token，更新环境变量（但无法持久化）
        if (csrfToken) {
            console.log('[信息] 检测到新的 CSRF Token，建议更新 Github Secrets');
        }

        // 处理签到逻辑
        if (isSigned) {
            console.log('[签到状态] 今天已经签到过了，无需重复签到');
            console.log('[完成] 签到流程结束');
        } else {
            // 执行签到（带重试）
            const { success, message } = await performSignin(axiosInstance, account, 3);
            console.log(`[签到结果] ${message}`);
            
            // 再次检查签到状态，确认是否成功（带重试）
            if (success) {
                const { isSigned: newStatus } = await checkSigninStatus(axiosInstance, 3);
                if (newStatus) {
                    console.log('[签到确认] 确认签到成功！');
                    console.log('[完成] 签到流程结束');
                    process.exit(0);
                } else {
                    console.error('[签到确认] 警告：签到响应成功但状态未更新');
                }
            }
            
            if (!success) {
                console.error('[完成] 签到失败，请检查配置和网络连接');
                process.exit(1);
            }
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
