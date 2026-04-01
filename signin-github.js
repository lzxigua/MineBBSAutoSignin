/**
 * MineBBS 自动签到脚本 - Github Actions 单用户版本
 * 支持雷池 WAF 自动绕过，通过环境变量获取用户凭据
 */

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const wafModule = require('./waf-module');

// 从环境变量获取配置
const MINEBBS_COOKIES = process.env.MINEBBS_COOKIES;
const MINEBBS_CSRF_TOKEN = process.env.MINEBBS_CSRF_TOKEN;
const MINEBBS_ACCOUNT_NAME = process.env.MINEBBS_ACCOUNT_NAME || 'Github Actions 账户';
// 跳过随机延迟的标志（用于测试）
const SKIP_RANDOM_DELAY = process.env.MINEBBS_SKIP_DELAY === 'true';
// 是否启用 WAF 检测（默认启用）
const ENABLE_WAF = process.env.MINEBBS_ENABLE_WAF !== 'false';

const TARGET_URL = 'https://www.minebbs.com/';

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
 * @param {string} cookieString Cookie 字符串
 * @returns {AxiosInstance}
 */
function createAxiosInstance(cookieString) {
    const jar = new CookieJar();
    
    // 设置 cookie 到 CookieJar
    if (cookieString) {
        const cookies = parseCookies(cookieString);
        console.log(`[Cookie] 准备设置 ${Object.keys(cookies).length} 个 Cookie`);
        
        // 设置到 CookieJar
        Object.keys(cookies).forEach(key => {
            try {
                jar.setCookie(`${key}=${cookies[key]}`, TARGET_URL);
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
            'Referer': TARGET_URL,
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
            const response = await axiosInstance.get(TARGET_URL);

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
 * 检查是否已经签到（带重试）
 * @param {AxiosInstance} axiosInstance axios 实例
 * @param {number} maxRetries 最大重试次数
 * @returns {Promise<boolean>} 是否已签到
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
            const response = await axiosInstance.get(TARGET_URL);

            // 检查是否已签到
            const hasSignedInText = response.data.includes('今日签到已完成');
            const hasNotSignedInText = response.data.includes('今日尚未签到');
            const hasDailySigninText = response.data.includes('每日签到');
            
            console.log('[状态检查] === 页面内容分析 ===');
            console.log(`[状态检查] 包含"每日签到": ${hasDailySigninText}`);
            console.log(`[状态检查] 包含"今日签到已完成": ${hasSignedInText}`);
            console.log(`[状态检查] 包含"今日尚未签到": ${hasNotSignedInText}`);
            
            // 判断逻辑：
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

            if (attempt > 0) {
                console.log('[状态检查] 重试成功');
            }
            return isSigned;
        } catch (error) {
            lastError = error;
            console.error(`[状态检查] 检查失败 (尝试 ${attempt + 1}/${maxRetries}):`, error.message);
        }
    }
    
    console.error('[状态检查] 达到最大重试次数，放弃检查');
    return false;
}

/**
 * 执行签到（带重试）
 * @param {AxiosInstance} axiosInstance axios 实例
 * @param {string} csrfToken CSRF Token
 * @param {number} maxRetries 最大重试次数
 * @returns {Promise<Object>} 签到结果
 */
async function performSignin(axiosInstance, csrfToken, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`[执行签到] 第 ${attempt} 次重试...`);
                await retryDelay(attempt);
            }
            console.log('[执行签到] 正在执行签到操作...');
            
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
    console.log(`WAF 检测：${ENABLE_WAF ? '已启用' : '已禁用'}`);
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
        // 执行随机延迟
        if (SKIP_RANDOM_DELAY) {
            console.log('[跳过延迟] 检测到 MINEBBS_SKIP_DELAY=true，跳过随机延迟');
        } else {
            const delayTime = getRandomDelay();
            console.log(`[随机延迟] 将在 ${delayTime / 1000}秒 (${Math.floor(delayTime / 60000)}分${Math.floor((delayTime % 60000) / 1000)}秒) 后开始签到...`);
            await delay(delayTime);
            console.log('[随机延迟] 延迟结束，开始执行签到');
        }

        // 处理 WAF
        let fullCookieString = MINEBBS_COOKIES;
        
        if (ENABLE_WAF) {
            console.log('[WAF] 开始检测 WAF...');
            
            // 先检测是否有 WAF
            const hasWAF = await wafModule.detectWAF(TARGET_URL);
            
            if (hasWAF) {
                console.log('[WAF] 检测到 WAF，开始获取 WAF Cookie...');
                const userCookies = parseCookies(MINEBBS_COOKIES);
                fullCookieString = await wafModule.getFullCookieString(TARGET_URL, userCookies);
                
                if (!fullCookieString) {
                    console.error('[WAF] 获取 WAF Cookie 失败，尝试直接使用原始 Cookie');
                    fullCookieString = MINEBBS_COOKIES;
                }
            } else {
                console.log('[WAF] 未检测到 WAF，使用原始 Cookie');
            }
        }

        // 创建 axios 实例
        const axiosInstance = createAxiosInstance(fullCookieString);

        // 检查签到状态
        const isSigned = await checkSigninStatus(axiosInstance, 3);

        // 处理签到逻辑
        if (isSigned) {
            console.log('[签到状态] 今天已经签到过了，无需重复签到');
            console.log('[完成] 签到流程结束');
            process.exit(0);
        } else {
            // 执行签到
            const { success, message } = await performSignin(axiosInstance, MINEBBS_CSRF_TOKEN, 3);
            console.log(`[签到结果] ${message}`);
            
            if (success) {
                console.log('[完成] 签到流程结束');
                process.exit(0);
            } else {
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
