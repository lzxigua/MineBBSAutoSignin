/**
 * Minebbs 模拟登录脚本
 * 支持 WAF 绕过、账密登录和 TOTP 两步验证
 */

const axios = require('axios');
const https = require('https');
const readline = require('readline');
const fs = require('fs');
const { generateTOTP, verifyTOTP } = require('@rabbit-company/totp');
const { getAllCookies, resetCookieJar, client } = require('./waf-handler');

const BASE_URL = 'https://www.minebbs.com';

// 创建 readline 接口用于用户输入
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// 提问函数
function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
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
        // 生成 TOTP 验证码
        code = await generateTOTP(secret);
        
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
 * 延时函数
 * @param {number} ms - 毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
 * 第一步：登录（提交用户名和密码）
 */
async function submitLogin(email, password, cookies) {
    console.log('\n[登录] 正在获取 _xfToken...');
    
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
    
    console.log('[登录] 已获取 _xfToken:', xfToken);
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
        
        // 检查是否登录成功
        if (loginResponse.status === 303 && loginResponse.headers.location === '/') {
            console.log('[登录] 登录成功！');
            return { success: true, cookies: updatedCookies };
        }
        
        console.log('[登录] 登录响应异常');
        return { error: '登录响应异常', cookies: updatedCookies };
        
    } catch (error) {
        if (error.response && error.response.status === 303) {
            const location = error.response.headers.location;
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
            if (location === '/') {
                console.log('[登录] 登录成功！');
                return { success: true, cookies };
            }
        }
        console.error('[登录] 登录失败:', error.message);
        return { error: error.message, cookies };
    }
}

/**
 * 第二步：提交 TOTP 验证码
 */
async function submitTwoStepCode(code, cookies) {
    console.log('\n[两步验证] 正在获取两步验证页面的 _xfToken...');
    
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
    
    console.log('[两步验证] 已获取 _xfToken:', xfToken);
    console.log('[两步验证] 正在提交验证码...');
    
    const formData = new FormData();
    formData.append('_xfToken', xfToken);
    formData.append('code', code);
    formData.append('confirm', '1');
    formData.append('provider', 'totp');
    formData.append('remember', '1');
    formData.append('_xfRedirect', `${BASE_URL}/`);
    formData.append('_xfResponseType', 'json');
    formData.append('_xfWithData', '1');
    formData.append('_xfRequestUri', `/login/two-step?_xfRedirect=${encodeURIComponent(BASE_URL + '/')}&remember=1`);
    
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
        // XenForo 的成功响应可能是 { status: "ok", redirect: "..." }
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
 * 验证登录状态
 */
async function verifyLogin(cookies) {
    console.log('\n[验证] 正在验证登录状态...');
    
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
        
        // 检查是否包含登录用户信息
        if (response.data.includes('xf_user') || response.data.includes('logout')) {
            console.log('[验证] 登录状态验证成功！');
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('[验证] 验证失败:', error.message);
        return false;
    }
}

/**
 * 主函数
 */
async function main() {
    console.log('='.repeat(50));
    console.log('Minebbs 模拟登录脚本');
    console.log('='.repeat(50));
    
    try {
        // 步骤 1: 获取 WAF Cookie 和主页 Cookie
        console.log('\n[准备] 正在获取 WAF Cookie...');
        resetCookieJar();
        const cookies = await getAllCookies(BASE_URL);
        
        console.log('\n[准备] 已获取 Cookie:');
        for (const [key, value] of Object.entries(cookies)) {
            console.log(`  ${key}: ${value.substring(0, 30)}...`);
        }
        
        // 步骤 2: 获取用户输入
        console.log('\n[输入] 请输入登录信息');
        
        // 尝试从环境变量获取账号和密码
        const envEmail = process.env.MINEBBS_EMAIL;
        const envPassword = process.env.MINEBBS_PASSWORD;
        
        let email, password;
        
        if (envEmail && envPassword) {
            console.log('[自动] 检测到环境变量，使用配置的账号密码');
            email = envEmail;
            password = envPassword;
        } else {
            email = await askQuestion('请输入邮箱/用户名：');
            password = await askQuestion('请输入密码：');
        }
        
        // 步骤 3: 提交登录
        const loginResult = await submitLogin(email, password, cookies);
        
        if (loginResult.error) {
            console.error('\n[错误] 登录失败:', loginResult.error);
            rl.close();
            return;
        }
        
        // 步骤 4: 如果需要两步验证
        let finalCookies = loginResult.cookies;
        
        if (loginResult.requiresTwoStep) {
            // 尝试从环境变量获取 TOTP 密钥
            const totpSecret = process.env.TOTP_SECRET;
            let code;
            
            if (totpSecret) {
                console.log('\n[自动] 检测到 TOTP_SECRET 环境变量，自动生成验证码...');
                code = await generateTOTPCodeWithRetry(totpSecret);
                console.log(`[自动] 已生成 TOTP 验证码：${code}`);
            } else {
                console.log('\n[提示] 检测到需要两步验证，请在 30 秒内输入 TOTP 验证码');
                code = await askQuestion('请输入 TOTP 验证码：');
            }
            
            const twoStepResult = await submitTwoStepCode(code, loginResult.cookies);
            
            if (twoStepResult.error) {
                console.error('\n[错误] 两步验证失败:', twoStepResult.error);
                rl.close();
                return;
            }
            
            if (twoStepResult.success) {
                console.log('\n[成功] 登录完成！');
                // 使用两步验证后的 Cookie
                finalCookies = twoStepResult.cookies;
            }
        } else if (loginResult.success) {
            console.log('\n[成功] 登录完成！');
        }
        
        // 输出最终 Cookie
        console.log('\n[完成] 登录成功！');
        console.log('\n最终 Cookie:');
        const cookieString = Object.entries(finalCookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
        console.log(cookieString);
        
        // 使用登录后的 Cookie 访问主页
        console.log('\n[访问] 正在访问主页...');
        const homepageHeaders = {
            'Host': 'www.minebbs.com',
            'Cookie': cookieString,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Sec-Ch-Ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Dest': 'document'
        };
        
        const homepageResponse = await client.get(BASE_URL, { headers: homepageHeaders });
        console.log(`[访问] 主页响应状态：${homepageResponse.status}`);
        
        // 保存 HTML 到 output.txt
        fs.writeFileSync('output.txt', homepageResponse.data);
        console.log('[保存] HTML 内容已保存到 output.txt');
        
    } catch (error) {
        console.error('\n[错误] 脚本执行失败:', error.message);
        console.error(error.stack);
    } finally {
        rl.close();
    }
}

// 运行主函数
main();
