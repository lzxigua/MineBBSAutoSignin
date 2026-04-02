/**
 * 雷池 WAF 绕过模块
 * 用于获取 SafeLine WAF 的 JWT 令牌和相关 Cookie
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
        
        cookieString.split(';').forEach(part => {
            const parts = part.trim().split('=');
            if (parts.length === 2) {
                const [key, value] = parts;
                if (key && value) {
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
 * 检测是否被 WAF 拦截
 * @param {string} url - 目标 URL
 * @returns {Promise<boolean>} true 表示有 WAF，false 表示没有
 */
async function detectWAF(url) {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        };
        
        const response = await client.get(url, { headers });
        
        // 468 状态码表示被 WAF 拦截
        if (response.status === 468) {
            console.log('[WAF 检测] 检测到 WAF 拦截 (状态码 468)');
            return true;
        }
        
        // 检查响应内容是否包含 WAF 特征
        const hasWAF = response.data.includes('SafeLine') || 
                      response.data.includes('雷池') || 
                      response.data.includes('Protected By');
        
        if (hasWAF) {
            console.log('[WAF 检测] 检测到 WAF 特征');
        } else {
            console.log('[WAF 检测] 未检测到 WAF');
        }
        
        return hasWAF;
    } catch (error) {
        console.error('[WAF 检测] 检测失败:', error.message);
        return false;
    }
}

/**
 * 获取 Safeline 系统的 JWT 令牌和所有 WAF Cookie
 * @param {string} url - 目标 URL
 * @returns {Promise<Object>} 包含 JWT 和所有 WAF Cookie 的对象
 */
async function getWAFCookies(url) {
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

        // 请求 issue 接口，params 携带 client_id，获取 issue_id 和列表
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

        // 调用 node 脚本，执行 js 获取请求验证必要的参数
        const dataStr = JSON.stringify(issueResponse.data.data.data);
        const result = execSync(`node 123.js ${dataStr}`, { 
            encoding: 'utf8',
            cwd: __dirname  // 确保在工作目录执行
        }).trim();
        
        const result_li = result.split('\n');

        // 判断返回值，定义 result 和 visitorId
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
                if (cookie.startsWith('sl_jwt_session=')) {
                    wafCookies.sl_jwt_session = cookie.split('=')[1].split(';')[0];
                }
                // 提取其他 sl_ 开头的 cookie
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
 * 获取完整的 Cookie 字符串（包含 WAF Cookie 和用户 Cookie）
 * @param {string} url - 目标 URL
 * @param {Object} userCookies - 用户提供的 Cookie 对象
 * @returns {Promise<string>} 完整的 Cookie 字符串
 */
async function getFullCookieString(url, userCookies = {}) {
    // 检测是否需要处理 WAF
    const hasWAF = await detectWAF(url);
    
    if (hasWAF) {
        console.log('[WAF] 需要处理 WAF');
        const wafCookies = await getWAFCookies(url);
        
        if (wafCookies) {
            // 合并 WAF Cookie 和用户 Cookie
            const allCookies = { ...wafCookies, ...userCookies };
            const cookieString = Object.entries(allCookies)
                .map(([k, v]) => `${k}=${v}`)
                .join('; ');
            
            console.log('[WAF] 已生成完整 Cookie');
            return cookieString;
        }
    }
    
    // 没有 WAF，直接返回用户 Cookie
    const cookieString = Object.entries(userCookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    
    console.log('[WAF] 无需 WAF 处理');
    return cookieString;
}

/**
 * 重置 Cookie Jar
 */
function resetCookieJar() {
    cookieJar.cookies = {};
    console.log('[WAF] Cookie Jar 已重置');
}

module.exports = {
    detectWAF,
    getWAFCookies,
    getFullCookieString,
    resetCookieJar,
    cookieJar
};
