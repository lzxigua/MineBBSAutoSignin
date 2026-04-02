/**
 * Minebbs WAF 绕过处理模块
 * 基于 waf-module.js 修改，用于获取 SafeLine WAF 的 JWT 令牌和相关 Cookie
 */

const axios = require('axios');
const https = require('https');
const { execSync } = require('child_process');

// 创建 https agent 忽略证书验证
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

// Cookie jar 实现
class CookieJar {
    constructor() {
        this.cookies = {};
    }

    setCookie(cookieString, url) {
        const parsed = new URL(url);
        const domain = parsed.hostname;
        
        // Cookie 属性键，这些不应该被保存为 Cookie
        const cookieAttributes = new Set([
            'Path', 'Domain', 'Expires', 'Max-Age', 'SameSite', 
            'Secure', 'HttpOnly', 'path', 'domain', 'expires', 
            'max-age', 'samesite', 'secure', 'httponly'
        ]);
        
        cookieString.split(';').forEach(part => {
            const trimmedPart = part.trim();
            const equalsIndex = trimmedPart.indexOf('=');
            
            // 必须有 = 且 = 不能在开头
            if (equalsIndex > 0) {
                const key = trimmedPart.substring(0, equalsIndex);
                const value = trimmedPart.substring(equalsIndex + 1);
                
                if (key && value && !cookieAttributes.has(key)) {
                    if (!this.cookies[domain]) {
                        this.cookies[domain] = {};
                    }
                    this.cookies[domain][key] = value;
                }
            }
        });
    }

    getCookieString(url) {
        const parsed = new URL(url);
        const domain = parsed.hostname;
        
        if (!this.cookies[domain]) {
            return '';
        }
        
        return Object.entries(this.cookies[domain])
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }

    getCookie(name, url) {
        const parsed = new URL(url);
        const domain = parsed.hostname;
        
        if (!this.cookies[domain]) {
            return null;
        }
        
        return this.cookies[domain][name] || null;
    }

    getAllCookies(url) {
        const parsed = new URL(url);
        const domain = parsed.hostname;
        
        if (!this.cookies[domain]) {
            return {};
        }
        
        return { ...this.cookies[domain] };
    }
    
    clear() {
        this.cookies = {};
    }
}

const cookieJar = new CookieJar();

// 创建 axios 实例
const client = axios.create({
    httpsAgent: httpsAgent,
    maxRedirects: 0,
    validateStatus: function (status) {
        return status < 600;
    }
});

// 拦截响应处理 cookies
client.interceptors.response.use(
    response => {
        const setCookieHeaders = response.headers['set-cookie'];
        if (setCookieHeaders) {
            const url = response.config.url;
            setCookieHeaders.forEach(cookie => {
                cookieJar.setCookie(cookie, url);
            });
        }
        return response;
    },
    error => {
        if (error.response) {
            const setCookieHeaders = error.response.headers['set-cookie'];
            if (setCookieHeaders) {
                const url = error.config.url;
                setCookieHeaders.forEach(cookie => {
                    cookieJar.setCookie(cookie, url);
                });
            }
        }
        return Promise.reject(error);
    }
);

/**
 * 获取 Safeline WAF 的 Cookie
 * @param {string} url - 目标 URL
 * @returns {Promise<Object>} 包含所有 WAF Cookie 的对象
 */
async function getWafCookies(url) {
    console.log('[WAF] 开始获取 WAF Cookie...');
    
    const headers = {
        'Host': url.split('/')[2],
        'Connection': 'keep-alive',
        'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    };

    try {
        // 请求存在雷池 WAF 的网页，从网页中获取 client_id
        const response = await client.get(url, { headers });
        
        // 检查是否有 client_id
        if (!response.data.includes('SafeLineChallenge("')) {
            console.log('[WAF] 未找到 client_id，可能没有 WAF 或 WAF 已更新');
            return null;
        }

        const client_id = response.data.split('SafeLineChallenge("')[1].split('"')[0];
        console.log(`[WAF] client_id: ${client_id}`);

        // 请求 issue 接口
        const params = {
            client_id: client_id,
            level: 1
        };
        
        const issueHeaders = {
            ...headers,
            'referer': url,
            'Origin': 'https://www.minebbs.com',
            'Host': 'challenge.rivers.chaitin.cn'
        };

        const issueResponse = await client.post(
            'https://challenge.rivers.chaitin.cn/challenge/v2/api/issue',
            null,
            {
                headers: issueHeaders,
                params: params
            }
        );
        console.log('[WAF] 获取 issue 响应成功');

        // 执行 js 获取请求验证必要的参数
        const dataStr = JSON.stringify(issueResponse.data.data.data);
        const result = execSync(`node 123.js ${dataStr}`, { 
            encoding: 'utf8',
            cwd: __dirname
        }).trim();
        
        const result_li = result.split('\n');

        let result_arr, visitorId;
        for (const line of result_li) {
            if (line.includes('[')) {
                result_arr = JSON.parse(line);
            } else {
                visitorId = line;
            }
        }

        console.log('[WAF] 计算完成，visitorId:', visitorId);

        // 请求验证接口，获取 JWT 令牌
        const json_data = {
            issue_id: issueResponse.data.data.issue_id,
            result: result_arr,
            serials: [],
            client: {
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
                platform: "Win32",
                language: "zh-CN",
                vendor: "Google Inc.",
                screen: [2560, 1440],
                visitorId: visitorId,
                score: 100,
                target: ["27"]
            }
        };

        const verifyResponse = await client.post(
            'https://challenge.rivers.chaitin.cn/challenge/v2/api/verify',
            json_data,
            { headers: issueHeaders }
        );
        
        const jwt = verifyResponse.data.data.jwt;
        console.log('[WAF] 获取 JWT 成功');

        // 将必要的 cookie 添加到 cookieJar 中
        cookieJar.setCookie(`sl-challenge-server=cloud`, url);
        cookieJar.setCookie(`sl-challenge-jwt=${jwt}`, url);

        const finalHeaders = {
            ...headers,
            'Host': url.split('/')[2],
            'Cookie': cookieJar.getCookieString(url)
        };

        const finalResponse = await client.get(url, {
            headers: finalHeaders
        });
        
        // 从 set-cookie 头中提取所有 WAF Cookie
        const wafCookies = {};
        if (finalResponse.headers['set-cookie']) {
            for (const cookie of finalResponse.headers['set-cookie']) {
                const match = cookie.match(/^([^=]+)=([^;]+)/);
                if (match && match[1].startsWith('sl_')) {
                    wafCookies[match[1]] = match[2];
                }
            }
        }
        
        // 添加 myannoun cookie
        cookieJar.setCookie(`myannoun=1`, url);
        
        console.log('[WAF] WAF Cookie 获取完成');
        
        // 返回所有 WAF Cookie
        return {
            ...cookieJar.getAllCookies(url),
            ...wafCookies
        };
    } catch (error) {
        console.error('[WAF] 获取 WAF Cookie 失败:', error.message);
        if (error.response) {
            console.error('[WAF] 响应状态:', error.response.status);
        }
        return null;
    }
}

/**
 * 获取主页以获取 xf_csrf 等 Cookie
 * @param {string} url - 目标 URL
 * @param {Object} wafCookies - WAF Cookie 对象
 * @returns {Promise<Object>} 包含所有 Cookie 的对象
 */
async function getHomepageCookies(url, wafCookies) {
    console.log('[主页] 开始获取主页 Cookie...');
    
    // 第一次请求 - 带 WAF Cookie
    await makeHomepageRequest(url, wafCookies);
    
    // 等待一小段时间
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 第二次请求 - 带更新后的 Cookie，获取 sl-session 等
    const currentCookies = cookieJar.getAllCookies(url);
    const response = await makeHomepageRequest(url, currentCookies);
    
    // 从响应中直接提取 Set-Cookie 头中的 Cookie
    if (response && response.headers['set-cookie']) {
        for (const cookie of response.headers['set-cookie']) {
            cookieJar.setCookie(cookie, url);
        }
    }
    
    console.log('[主页] 主页访问完成');
    
    // 获取所有 Cookie
    const allCookies = cookieJar.getAllCookies(url);
    
    console.log('[主页] 当前 Cookie:', Object.keys(allCookies).join(', '));
    
    return allCookies;
}

/**
 * 发起主页请求
 */
async function makeHomepageRequest(url, cookies) {
    const cookieString = Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    
    const headers = {
        'Host': url.split('/')[2],
        'Connection': 'keep-alive',
        'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'document',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Cookie': cookieString
    };

    try {
        const response = await client.get(url, { headers });
        return response;
    } catch (error) {
        console.error('[主页] 请求失败:', error.message);
        return null;
    }
}

/**
 * 获取完整的 Cookie 字符串
 * @param {string} url - 目标 URL
 * @returns {Promise<Object>} 所有 Cookie 对象
 */
async function getAllCookies(url) {
    // 1. 获取 WAF Cookie
    const wafCookies = await getWafCookies(url);
    
    // 如果没有 WAF，直接访问主页获取 Cookie
    if (!wafCookies) {
        console.log('[WAF] 未检测到 WAF，直接访问主页...');
        const emptyCookies = {};
        const allCookies = await getHomepageCookies(url, emptyCookies);
        return allCookies;
    }
    
    // 2. 访问主页获取 xf_csrf 等 Cookie
    const allCookies = await getHomepageCookies(url, wafCookies);
    
    return allCookies;
}

/**
 * 重置 Cookie Jar
 */
function resetCookieJar() {
    cookieJar.clear();
    console.log('[WAF] Cookie Jar 已重置');
}

module.exports = {
    getAllCookies,
    getWafCookies,
    getHomepageCookies,
    resetCookieJar,
    cookieJar,
    client
};
