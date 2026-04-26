/**
 * MineBBS 自动登录模块
 * 用于 Github Actions 自动获取 Cookie 和 CSRF Token
 * 支持 WAF 绕过、账密登录和 TOTP 两步验证
 */

const axios = require('axios');
const https = require('https');
const { getAllCookies, resetCookieJar, client } = require('./waf-handler');

let generateTOTP;

async function loadTOTPModule() {
    if (!generateTOTP) {
        const totpModule = await import('@rabbit-company/totp');
        generateTOTP = totpModule.generateTOTP;
    }
    return generateTOTP;
}

const BASE_URL = 'https://www.minebbs.com';

/**
 * 延时函数
 * @param {number} ms - 毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 从 HTML 中提取 data-csrf
 * XenForo 2.3+ 在 html 标签的 data-csrf 属性中
 */
function extractCsrfFromHtml(html) {
    const match = html.match(/data-csrf="([^"]+)"/);
    return match ? match[1] : null;
}

/**
 * 从 HTML 中提取 _xfToken
 * XenForo 的 form 中通常有 hidden input _xfToken
 */
function extractXfTokenFromHtml(html) {
    const match = html.match(/name="_xfToken" value="([^"]+)"/);
    return match ? match[1] : null;
}

/**
 * 生成 TOTP 验证码，如果有效期小于 5 秒则等待重新生成
 * @param {string} secret - Base32 编码的密钥
 * @returns {Promise<string>} TOTP 验证码
 */
async function generateTOTPCodeWithRetry(secret) {
    const timeStep = 30; // TOTP 时间步长（秒）
    const minRemainingTime = 5; // 最小剩余时间（秒）
    
    let code;
    let remainingTime;
    
    do {
        // 加载 TOTP 模块并生成验证码
        const totpFn = await loadTOTPModule();
        code = await totpFn(secret);
        
        // 计算当前时间步的剩余时间
        const currentTime = Math.floor(Date.now() / 1000);
        const currentStep = Math.floor(currentTime / timeStep);
        const nextStepTime = (currentStep + 1) * timeStep;
        remainingTime = nextStepTime - currentTime;
        
        // 如果剩余时间小于 5 秒，等待后重新生成
        if (remainingTime < minRemainingTime) {
            const waitTime = (minRemainingTime - remainingTime + 1) * 1000;
            console.log(`[TOTP] 验证码有效期仅剩 ${remainingTime}秒，等待 ${waitTime}ms 后重新生成...`);
            await sleep(waitTime);
        }
    } while (remainingTime < minRemainingTime);
    
    console.log(`[TOTP] 生成的验证码有效期剩余 ${remainingTime}秒`);
    return code;
}

/**
 * 第一步：登录（提交用户名和密码）
 */
async function submitLogin(email, password, cookies) {
    console.log('[登录] 正在获取 _xfToken...');
    
    const cookieString = Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    
    // 访问主页获取 HTML 中的 _xfToken
    const headers = {
        'Host': 'www.minebbs.com',
        'Cookie': cookieString,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    };
    
    const response = await client.get(BASE_URL, { headers });
    const xfToken = extractXfTokenFromHtml(response.data);
    
    if (!xfToken) {
        throw new Error('无法从 HTML 中获取 _xfToken');
    }
    
    console.log('[登录] 已获取 _xfToken');
    console.log('[登录] 正在提交登录信息...');
    
    // 构建请求体
    const requestBody = `_xfToken=${xfToken}&login=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&remember=1&_xfRedirect=${encodeURIComponent(BASE_URL + '/')}`;
    
    const loginHeaders = {
        'Host': 'www.minebbs.com',
        'Cookie': cookieString,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Origin': BASE_URL,
        'Referer': `${BASE_URL}/`,
        'Sec-Ch-Ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Upgrade-Insecure-Requests': '1'
    };

    try {
        const loginResponse = await client.post(`${BASE_URL}/login/login`, requestBody, {
            headers: loginHeaders,
            maxRedirects: 0
        });
        
        console.log(`[登录] 响应状态：${loginResponse.status}`);
        
        // 从响应中获取更新后的 Cookie
        const updatedCookies = { ...cookies };
        if (loginResponse.headers['set-cookie']) {
            for (const cookie of loginResponse.headers['set-cookie']) {
                const match = cookie.match(/^([^=]+)=([^;]+)/);
                if (match) {
                    updatedCookies[match[1]] = match[2];
                }
            }
        }
        
        // 检查是否需要两步验证
        if (loginResponse.status === 303 && loginResponse.headers.location?.includes('/login/two-step')) {
            console.log('[登录] 需要两步验证');
            return { requiresTwoStep: true, cookies: updatedCookies };
        }
        
        // 检查是否登录成功（不需要 2FA 的情况）
        // 登录成功后会重定向到 / 或首页
        if (loginResponse.status === 303) {
            const location = loginResponse.headers.location;
            if (location === '/' || location === '' || !location.includes('/login/two-step')) {
                console.log('[登录] 登录成功！');
                return { success: true, cookies: updatedCookies };
            }
        }
        
        console.log('[登录] 登录响应异常');
        console.log('[登录] 响应头 location:', loginResponse.headers.location);
        return { error: '登录响应异常', cookies: updatedCookies };
        
    } catch (error) {
        if (error.response && error.response.status === 303) {
            const location = error.response.headers.location;
            // 检查是否需要两步验证
            if (location?.includes('/login/two-step')) {
                console.log('[登录] 需要两步验证');
                // 从响应中获取更新后的 Cookie
                const updatedCookies = { ...cookies };
                if (error.response.headers['set-cookie']) {
                    for (const cookie of error.response.headers['set-cookie']) {
                        const match = cookie.match(/^([^=]+)=([^;]+)/);
                        if (match) {
                            updatedCookies[match[1]] = match[2];
                        }
                    }
                }
                return { requiresTwoStep: true, cookies: updatedCookies };
            }
            // 其他 303 重定向都视为登录成功（不需要 2FA）
            console.log('[登录] 登录成功！');
            const updatedCookies = { ...cookies };
            if (error.response.headers['set-cookie']) {
                for (const cookie of error.response.headers['set-cookie']) {
                    const match = cookie.match(/^([^=]+)=([^;]+)/);
                    if (match) {
                        updatedCookies[match[1]] = match[2];
                    }
                }
            }
            return { success: true, cookies: updatedCookies };
        }
        console.error('[登录] 登录失败:', error.message);
        return { error: error.message, cookies };
    }
}

/**
 * 第二步：提交 TOTP 验证码
 */
async function submitTwoStepCode(code, cookies) {
    console.log('[两步验证] 正在获取两步验证页面的 _xfToken...');
    
    if (!cookies) {
        throw new Error('cookies 参数不能为空');
    }
    
    const cookieString = Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    
    // 访问两步验证页面获取正确的 _xfToken
    const twoStepHeaders = {
        'Host': 'www.minebbs.com',
        'Cookie': cookieString,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    };
    
    const twoStepUrl = `${BASE_URL}/login/two-step?_xfRedirect=${encodeURIComponent(BASE_URL + '/')}&remember=1`;
    const response = await client.get(twoStepUrl, { headers: twoStepHeaders });
    const xfToken = extractXfTokenFromHtml(response.data);
    
    if (!xfToken) {
        throw new Error('无法从两步验证页面 HTML 中获取 _xfToken');
    }
    
    console.log('[两步验证] 已获取 _xfToken');
    console.log('[两步验证] 正在提交验证码...');
    
    // 使用 multipart/form-data
    const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);
    const body = [];
    
    const fields = {
        '_xfToken': xfToken,
        'code': code,
        'confirm': '1',
        'provider': 'totp',
        'remember': '1',
        '_xfRedirect': `${BASE_URL}/`,
        '_xfResponseType': 'json',
        '_xfWithData': '1',
        '_xfRequestUri': `/login/two-step?_xfRedirect=${encodeURIComponent(BASE_URL + '/')}&remember=1`
    };
    
    for (const [key, value] of Object.entries(fields)) {
        body.push(`--${boundary}`);
        body.push(`Content-Disposition: form-data; name="${key}"`);
        body.push('');
        body.push(value);
    }
    body.push(`--${boundary}--`);
    
    const headers = {
        'Host': 'www.minebbs.com',
        'Cookie': cookieString,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Origin': BASE_URL,
        'Referer': twoStepUrl,
        'Sec-Ch-Ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'X-Requested-With': 'XMLHttpRequest',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache'
    };

    try {
        const response = await client.post(`${BASE_URL}/login/two-step`, body.join('\r\n'), {
            headers
        });
        
        console.log(`[两步验证] 响应状态：${response.status}`);
        
        // 检查响应是否成功
        const isSuccess = response.status === 200 && 
                         (response.data.success || response.data.status === 'ok');
        
        if (isSuccess) {
            console.log('[两步验证] 验证成功！');
            
            // 从响应中获取更新后的 Cookie
            const updatedCookies = { ...cookies };
            if (response.headers['set-cookie']) {
                for (const cookie of response.headers['set-cookie']) {
                    const match = cookie.match(/^([^=]+)=([^;]+)/);
                    if (match) {
                        updatedCookies[match[1]] = match[2];
                    }
                }
            }
            
            return { success: true, cookies: updatedCookies };
        }
        
        console.log('[两步验证] 响应数据:', JSON.stringify(response.data, null, 2));
        return { error: response.data?.message || '验证失败', cookies };
        
    } catch (error) {
        console.error('[两步验证] 验证失败:', error.message);
        if (error.response) {
            console.error('[两步验证] 响应状态:', error.response.status);
            console.error('[两步验证] 响应数据:', error.response.data);
        }
        return { error: error.message, cookies };
    }
}

/**
 * 验证登录状态并获取 CSRF Token
 */
async function verifyLoginAndGetCsrf(cookies) {
    console.log('[验证] 正在验证登录状态并获取 CSRF Token...');
    
    const cookieString = Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    
    const headers = {
        'Host': 'www.minebbs.com',
        'Cookie': cookieString,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Sec-Ch-Ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache'
    };

    try {
        const response = await client.get(BASE_URL, { headers });
        console.log(`[验证] 主页响应状态：${response.status}`);
        
        // 从 HTML 中提取 CSRF Token
        const csrfToken = extractCsrfFromHtml(response.data);
        
        if (!csrfToken) {
            console.error('[验证] 无法从 HTML 中提取 CSRF Token');
            return { success: false, cookies, csrfToken: null };
        }
        
        console.log('[验证] 成功获取 CSRF Token');
        
        // 改进的登录状态检测逻辑
        // 已登录的特征：
        // 1. 包含用户链接：<a href="/account/" class="p-navgroup-link p-navgroup-link--iconic p-navgroup-link--user"
        // 2. 包含用户数据属性：data-user-id="数字"
        // 3. 包含登出链接：/logout/
        // 4. 包含用户头像：avatar-u{用户 ID}-s
        //
        // 未登录的特征：
        // 1. 包含登录链接：<a href="/login/"
        // 2. 包含注册链接：<a href="/register/"
        // 3. 包含访客类名：p-navgroup--guest
        
        const hasUserLink = response.data.includes('href="/account/"') && 
                           response.data.includes('p-navgroup-link--user');
        const hasUserId = response.data.includes('data-user-id="');
        const hasLogoutLink = response.data.includes('/logout/');
        const hasUserAvatar = response.data.match(/avatar-u\d+-s/);
        
        const hasLoginLink = response.data.includes('href="/login/"');
        const hasRegisterLink = response.data.includes('href="/register/"');
        const hasGuestClass = response.data.includes('p-navgroup--guest');
        
        // 判断是否已登录：有任何一个已登录特征即认为已登录
        const isLoggedIn = hasUserLink || hasUserId || hasLogoutLink || hasUserAvatar;
        
        // 判断是否未登录：有任何一个未登录特征即认为未登录
        const isNotLoggedIn = hasLoginLink || hasRegisterLink || hasGuestClass;
        
        console.log('[验证] 登录状态检测详情:');
        console.log(`  - 已登录特征:`);
        console.log(`    * 用户链接：${hasUserLink}`);
        console.log(`    * 用户 ID: ${hasUserId}`);
        console.log(`    * 登出链接：${hasLogoutLink}`);
        console.log(`    * 用户头像：${hasUserAvatar ? '是' : '否'}`);
        console.log(`  - 未登录特征:`);
        console.log(`    * 登录链接：${hasLoginLink}`);
        console.log(`    * 注册链接：${hasRegisterLink}`);
        console.log(`    * 访客类名：${hasGuestClass}`);
        
        if (isLoggedIn && !isNotLoggedIn) {
            console.log('[验证] 登录状态验证成功！');
            return { success: true, cookies, csrfToken };
        }
        
        if (isNotLoggedIn && !isLoggedIn) {
            console.error('[验证] 检测到未登录状态，可能 Cookie 已失效');
            return { success: false, cookies, csrfToken: null };
        }
        
        // 如果同时检测到矛盾的特征，输出警告但仍认为已登录（因为有 CSRF Token）
        console.log('[验证] 警告：检测到矛盾的登录状态特征，但已获取 CSRF Token');
        return { success: true, cookies, csrfToken };
        
    } catch (error) {
        console.error('[验证] 验证失败:', error.message);
        return { success: false, cookies, csrfToken: null };
    }
}

/**
 * 自动登录主函数
 * @param {string} email - 邮箱/用户名
 * @param {string} password - 密码
 * @param {string} totpSecret - TOTP 密钥（可选）
 * @returns {Promise<Object>} 包含 cookies 和 csrfToken 的对象
 */
async function autoLogin(email, password, totpSecret = null) {
    console.log('='.repeat(50));
    console.log('MineBBS 自动登录');
    console.log('='.repeat(50));
    
    try {
        // 步骤 1: 获取 WAF Cookie
        console.log('\n[准备] 正在获取 WAF Cookie...');
        resetCookieJar();
        const cookies = await getAllCookies(BASE_URL);
        
        console.log(`[准备] 已获取 ${Object.keys(cookies).length} 个 WAF Cookie`);
        console.log('[准备] Cookie 列表:');
        for (const [key, value] of Object.entries(cookies)) {
            // 只显示 Cookie 名称，隐藏具体值
            const hiddenValue = value.length > 10 ? value.substring(0, 6) + '...' : '***';
            console.log(`  - ${key}: ${hiddenValue}`);
        }
        
        // 步骤 2: 提交登录
        const loginResult = await submitLogin(email, password, cookies);
        
        if (loginResult.error) {
            console.error('\n[错误] 登录失败:', loginResult.error);
            return null;
        }
        
        // 步骤 3: 如果需要两步验证
        let finalCookies = loginResult.cookies;
        
        if (loginResult.requiresTwoStep) {
            if (!totpSecret) {
                console.error('\n[错误] 需要 TOTP 验证码，但未提供 TOTP_SECRET');
                return null;
            }
            
            console.log('\n[自动] 检测到需要两步验证，自动生成验证码...');
            const code = await generateTOTPCodeWithRetry(totpSecret);
            console.log('[自动] 已生成 TOTP 验证码（已隐藏）');
            
            const twoStepResult = await submitTwoStepCode(code, loginResult.cookies);
            
            if (twoStepResult.error) {
                console.error('\n[错误] 两步验证失败:', twoStepResult.error);
                return null;
            }
            
            if (twoStepResult.success) {
                console.log('\n[成功] 两步验证通过！');
                finalCookies = twoStepResult.cookies;
            }
        } else if (loginResult.success) {
            console.log('\n[成功] 登录成功！');
        }
        
        // 步骤 4: 验证登录状态并获取 CSRF Token
        const verifyResult = await verifyLoginAndGetCsrf(finalCookies);
        
        if (!verifyResult.success || !verifyResult.csrfToken) {
            console.error('\n[错误] 验证失败或无法获取 CSRF Token');
            return null;
        }
        
        // 格式化 Cookie 字符串
        const cookieString = Object.entries(verifyResult.cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
        
        console.log('\n[完成] 自动登录完成！');
        console.log('[完成] Cookie 列表:');
        for (const [key, value] of Object.entries(verifyResult.cookies)) {
            // 只显示 Cookie 名称，隐藏具体值
            const hiddenValue = value.length > 10 ? value.substring(0, 6) + '...' : '***';
            console.log(`  - ${key}: ${hiddenValue}`);
        }
        console.log(`[完成] CSRF Token: ${verifyResult.csrfToken.substring(0, 16)}...`);
        
        return {
            cookies: verifyResult.cookies,
            cookieString,
            csrfToken: verifyResult.csrfToken
        };
        
    } catch (error) {
        console.error('\n[错误] 脚本执行失败:', error.message);
        console.error(error.stack);
        return null;
    }
}

module.exports = {
    autoLogin,
    extractCsrfFromHtml,
    extractXfTokenFromHtml,
    generateTOTPCodeWithRetry
};
