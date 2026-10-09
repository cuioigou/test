const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');        // 只填写UPLOAD_URL将上传节点,同时填写UPLOAD_URL和PROJECT_URL将上传订阅
const UPLOAD_URL = process.env.UPLOAD_URL || '';      // 节点或订阅自动上传地址,需填写部署Merge-sub项目后的首页地址,例如：https://merge.xxx.com
const PROJECT_URL = process.env.PROJECT_URL || 'https://comfortable-verla-nishishabi-38d49221.koyeb.app';    // 需要上传订阅或保活时需填写项目分配的url,例如：https://google.com
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; // false关闭自动保活，true开启,需同时填写PROJECT_URL变量
const FILE_PATH = process.env.FILE_PATH || './tmp';   // 运行目录,sub节点文件保存目录
const SUB_PATH = process.env.SUB_PATH || 'sub';       // 订阅路径
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;        // http服务订阅端口
const UUID = process.env.UUID || '253720b2-8f27-4ece-b4bc-00534378d4c1'; // 使用哪吒v1,在不同的平台运行需修改UUID,否则会覆盖
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';        // 哪吒v1填写形式: nz.abc.com:8008  哪吒v0填写形式：nz.abc.com
const NEZHA_PORT = process.env.NEZHA_PORT || '';            // 使用哪吒v1请留空，哪吒v0需填写
const NEZHA_KEY = process.env.NEZHA_KEY || '';              // 哪吒v1的NZ_CLIENT_SECRET或哪吒v0的agent密钥
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'koyeb.litex1024.dpdns.org';          // 固定隧道域名
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYTYyZGRhZTMxODRlYmFlMzU4ZmQxMjBkYjFkYzM1MjciLCJ0IjoiZDRjNjM2ZTUtMzgyYi00ODE3LWI1MjctYjdjNDZkNTJiNzM1IiwicyI6InJlT29vcTJ2bUlVd2dxNGZVNC9yMy9XM0ZDRERDSFBLTHNqQ0ZXTWtYc2M9In0=';              // 固定隧道token
const ARGO_PORT = process.env.ARGO_PORT || 8001;            // 固定隧道端口
const CFIP = process.env.CFIP || '198.41.222.226';        // 节点优选域名或优选ip  
const CFPORT = process.env.CFPORT || 443;                   // 节点优选域名或优选ip对应的端口
const NAME = process.env.NAME || '';                        // 节点名称

// 创建运行文件夹
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
  console.log(`${FILE_PATH} is created`);
} else {
  console.log(`${FILE_PATH} already exists`);
}

// 生成随机6位字符文件名
function generateRandomName() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// 全局常量
const npmName = generateRandomName();
const webName = generateRandomName();
const botName = generateRandomName();
const phpName = generateRandomName();
let npmPath = path.join(FILE_PATH, npmName);
let phpPath = path.join(FILE_PATH, phpName);
let webPath = path.join(FILE_PATH, webName);
let botPath = path.join(FILE_PATH, botName);
let subPath = path.join(FILE_PATH, 'sub.txt');
let listPath = path.join(FILE_PATH, 'list.txt');
let bootLogPath = path.join(FILE_PATH, 'boot.log');
let configPath = path.join(FILE_PATH, 'config.json');

// 如果订阅器上存在历史运行节点则先删除
function deleteNodes() {
  try {
    if (!UPLOAD_URL) return;
    if (!fs.existsSync(subPath)) return;

    let fileContent;
    try {
      fileContent = fs.readFileSync(subPath, 'utf-8');
    } catch {
      return null;
    }

    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line => 
      /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line)
    );

    if (nodes.length === 0) return;

    axios.post(`${UPLOAD_URL}/api/delete-nodes`, 
      JSON.stringify({ nodes }),
      { headers: { 'Content-Type': 'application/json' } }
    ).catch((error) => { 
      return null; 
    });
    return null;
  } catch (err) {
    return null;
  }
}

// 清理历史文件
function cleanupOldFiles() {
  try {
    const files = fs.readdirSync(FILE_PATH);
    files.forEach(file => {
      const filePath = path.join(FILE_PATH, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        // 忽略所有错误，不记录日志
      }
    });
  } catch (err) {
    // 忽略所有错误，不记录日志
  }
}

// 根路由
app.get("/", function(req, res) {
  res.send("Hello world!");
});

// 生成xr-ay配置文件
async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { port: ARGO_PORT, protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
      { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls"], metadataOnly: false } },
      { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls"], metadataOnly: false } },
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls"], metadataOnly: false } },
    ],
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [ { protocol: "freedom", tag: "direct" }, {protocol: "blackhole", tag: "block"} ]
  };
  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
}

// 判断系统架构
function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    return 'arm';
  } else {
    return 'amd';
  }
}

// 下载对应系统架构的依赖文件
function downloadFile(fileName, fileUrl, callback) {
  const filePath = fileName; 
  
  // 确保目录存在
  if (!fs.existsSync(FILE_PATH)) {
    fs.mkdirSync(FILE_PATH, { recursive: true });
  }
  
  const writer = fs.createWriteStream(filePath);

  axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
  })
    .then(response => {
      response.data.pipe(writer);

      writer.on('finish', () => {
        writer.close();
        console.log(`Download ${path.basename(filePath)} successfully`);
        callback(null, filePath);
      });

      writer.on('error', err => {
        fs.unlink(filePath, () => { });
        const errorMessage = `Download ${path.basename(filePath)} failed: ${err.message}`;
        console.error(errorMessage); // 下载失败时输出错误消息
        callback(errorMessage);
      });
    })
    .catch(err => {
      const errorMessage = `Download ${path.basename(filePath)} failed: ${err.message}`;
      console.error(errorMessage); // 下载失败时输出错误消息
      callback(errorMessage);
    });
}

// 下载并运行依赖文件
async function downloadFilesAndRun() {  
  
  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);

  if (filesToDownload.length === 0) {
    console.log(`Can't find a file for the current architecture`);
    return;
  }

  const downloadPromises = filesToDownload.map(fileInfo => {
    return new Promise((resolve, reject) => {
      downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, filePath) => {
        if (err) {
          reject(err);
        } else {
          resolve(filePath);
        }
      });
    });
  });

  try {
    await Promise.all(downloadPromises);
  } catch (err) {
    console.error('Error downloading files:', err);
    return;
  }
  // 授权和运行
  function authorizeFiles(filePaths) {
    const newPermissions = 0o775;
    filePaths.forEach(absoluteFilePath => {
      if (fs.existsSync(absoluteFilePath)) {
        fs.chmod(absoluteFilePath, newPermissions, (err) => {
          if (err) {
            console.error(`Empowerment failed for ${absoluteFilePath}: ${err}`);
          } else {
            console.log(`Empowerment success for ${absoluteFilePath}: ${newPermissions.toString(8)}`);
          }
        });
      }
    });
  }
  const filesToAuthorize = NEZHA_PORT ? [npmPath, webPath, botPath] : [phpPath, webPath, botPath];
  authorizeFiles(filesToAuthorize);

  //运行ne-zha
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
      // 检测哪吒是否开启TLS
      const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
      const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
      const nezhatls = tlsPorts.has(port) ? 'true' : 'false';
      // 生成 config.yaml
      const configYaml = `
client_secret: ${NEZHA_KEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: true
ip_report_period: 1800
report_delay: 4
server: ${NEZHA_SERVER}
skip_connection_count: true
skip_procs_count: true
temperature: false
tls: ${nezhatls}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;
      
      fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
      
      // 运行 v1
      const command = `nohup ${phpPath} -c "${FILE_PATH}/config.yaml" >/dev/null 2>&1 &`;
      try {
        await exec(command);
        console.log(`${phpName} is running`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`php running error: ${error}`);
      }
    } else {
      let NEZHA_TLS = '';
      const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
      if (tlsPorts.includes(NEZHA_PORT)) {
        NEZHA_TLS = '--tls';
      }
      const command = `nohup ${npmPath} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`;
      try {
        await exec(command);
        console.log(`${npmName} is running`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`npm running error: ${error}`);
      }
    }
  } else {
    console.log('NEZHA variable is empty,skip running');
  }
  //运行xr-ay
  const command1 = `nohup ${webPath} -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`;
  try {
    await exec(command1);
    console.log(`${webName} is running`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(`web running error: ${error}`);
  }

  // 运行cloud-fared
  if (fs.existsSync(botPath)) {
    let args;

    if (ARGO_AUTH.match(/^[A-Za-z0-9+/=_-]{100,300}$/)) {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
    } else if (ARGO_AUTH.match(/TunnelSecret/)) {
      args = `tunnel --edge-ip-version auto --config ${FILE_PATH}/tunnel.yml run`;
    } else {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
    }

    try {
      await exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
      console.log(`${botName} is running`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Error executing command: ${error}`);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));

}

//根据系统架构返回对应的url
function getFilesForArchitecture(architecture) {
  let baseFiles;
  if (architecture === 'arm') {
    baseFiles = [
      { fileName: webPath, fileUrl: "https://arm64.ssss.nyc.mn/web" },
      { fileName: botPath, fileUrl: "https://arm64.ssss.nyc.mn/bot" }
    ];
  } else {
    baseFiles = [
      { fileName: webPath, fileUrl: "https://amd64.ssss.nyc.mn/web" },
      { fileName: botPath, fileUrl: "https://amd64.ssss.nyc.mn/bot" }
    ];
  }

  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT) {
      const npmUrl = architecture === 'arm' 
        ? "https://arm64.ssss.nyc.mn/agent"
        : "https://amd64.ssss.nyc.mn/agent";
        baseFiles.unshift({ 
          fileName: npmPath, 
          fileUrl: npmUrl 
        });
    } else {
      const phpUrl = architecture === 'arm' 
        ? "https://arm64.ssss.nyc.mn/v1" 
        : "https://amd64.ssss.nyc.mn/v1";
      baseFiles.unshift({ 
        fileName: phpPath, 
        fileUrl: phpUrl
      });
    }
  }

  return baseFiles;
}

// 获取固定隧道json
function argoType() {
  if (!ARGO_AUTH || !ARGO_DOMAIN) {
    console.log("ARGO_DOMAIN or ARGO_AUTH variable is empty, use quick tunnels");
    return;
  }

  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelYaml = `
  tunnel: ${ARGO_AUTH.split('"')[11]}
  credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
  protocol: http2
  
  ingress:
    - hostname: ${ARGO_DOMAIN}
      service: http://localhost:${ARGO_PORT}
      originRequest:
        noTLSVerify: true
    - service: http_status:404
  `;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
  } else {
    console.log("ARGO_AUTH mismatch TunnelSecret,use token connect to tunnel");
  }
}

// 获取临时隧道domain
async function extractDomains() {
  let argoDomain;

  if (ARGO_AUTH && ARGO_DOMAIN) {
    argoDomain = ARGO_DOMAIN;
    console.log('ARGO_DOMAIN:', argoDomain);
    await generateLinks(argoDomain);
  } else {
    try {
      const fileContent = fs.readFileSync(path.join(FILE_PATH, 'boot.log'), 'utf-8');
      const lines = fileContent.split('\n');
      const argoDomains = [];
      lines.forEach((line) => {
        const domainMatch = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
        if (domainMatch) {
          const domain = domainMatch[1];
          argoDomains.push(domain);
        }
      });

      if (argoDomains.length > 0) {
        argoDomain = argoDomains[0];
        console.log('ArgoDomain:', argoDomain);
        await generateLinks(argoDomain);
      } else {
        console.log('ArgoDomain not found, re-running bot to obtain ArgoDomain');
        // 删除 boot.log 文件，等待 2s 重新运行 server 以获取 ArgoDomain
        fs.unlinkSync(path.join(FILE_PATH, 'boot.log'));
        async function killBotProcess() {
          try {
            if (process.platform === 'win32') {
              await exec(`taskkill /f /im ${botName}.exe > nul 2>&1`);
            } else {
              await exec(`pkill -f "[${botName.charAt(0)}]${botName.substring(1)}" > /dev/null 2>&1`);
            }
          } catch (error) {
            // 忽略输出
          }
        }
        killBotProcess();
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
        try {
          await exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
          console.log(`${botName} is running`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
          await extractDomains(); // 重新提取域名
        } catch (error) {
          console.error(`Error executing command: ${error}`);
        }
      }
    } catch (error) {
      console.error('Error reading boot.log:', error);
  }
}

// 获取isp信息
async function getMetaInfo() {
  try {
    const response1 = await axios.get('https://ipapi.co/json/', { timeout: 3000 });
    if (response1.data && response1.data.country_code && response1.data.org) {
      return `${response1.data.country_code}_${response1.data.org}`;
    }
  } catch (error) {
      try {
        // 备用 ip-api.com 获取isp
        const response2 = await axios.get('http://ip-api.com/json/', { timeout: 3000 });
        if (response2.data && response2.data.status === 'success' && response2.data.countryCode && response2.data.org) {
          return `${response2.data.countryCode}_${response2.data.org}`;
        }
      } catch (error) {
        // console.error('Backup API also failed');
      }
  }
  return 'Unknown';
}
// 生成 list 和 sub 信息
// 动态获取针对中国联通、中国移动/广电的最新优选 IP 池 (基于 cmliu addressesapi)
function fetchDynamicCleanIps() {
  return new Promise((resolve) => {
    const https = require('https');
    const req = https.get('https://addressesapi.090227.xyz/CloudFlareYes', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 6000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const lines = data.split('\n').map(l => l.trim()).filter(Boolean);
          const cmIps = lines
            .filter(l => l.includes('CM-'))
            .map(l => l.split('#')[0].trim())
            .filter(ip => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip));
          const cuIps = lines
            .filter(l => l.includes('CU-'))
            .map(l => l.split('#')[0].trim())
            .filter(ip => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip));
          resolve({
            cm: [...new Set(cmIps)].slice(0, 3),
            cu: [...new Set(cuIps)].slice(0, 3)
          });
        } catch (e) {
          resolve({ cm: [], cu: [] });
        }
      });
    });
    req.on('error', () => resolve({ cm: [], cu: [] }));
    req.on('timeout', () => { req.destroy(); resolve({ cm: [], cu: [] }); });
  });
}

async function generateLinks(argoDomain) {
  const ISP = await getMetaInfo();
  const nodeName = NAME ? `${NAME}-${ISP}` : ISP;

  let dynamicClean = { cm: [], cu: [] };
  try {
    dynamicClean = await fetchDynamicCleanIps();
    console.log('Fetched dynamic clean IPs:', dynamicClean);
  } catch (e) {
    console.log('Fetch dynamic clean IPs failed, using fallback.');
  }

  const fallbackCm = ['198.41.208.86', '104.17.160.1', '162.159.160.66'];
  const fallbackCu = ['162.159.192.1', '104.16.160.1', '162.159.236.194'];
  let cmList = (dynamicClean.cm && dynamicClean.cm.length >= 2) ? [...new Set(dynamicClean.cm)] : [...fallbackCm];
  let cuList = (dynamicClean.cu && dynamicClean.cu.length >= 2) ? [...new Set(dynamicClean.cu)] : [...fallbackCu];
  // 去重：CU与CM若出现相同IP（如动态API返回重叠），从CM中剔除重叠项并用fallback补齐，保证双网真实隔离
  cuList = [...new Set(cuList)].slice(0, 3);
  cmList = [...new Set(cmList)].filter(ip => !cuList.includes(ip));
  for (const fip of fallbackCm) { if (cmList.length >= 3) break; if (!cuList.includes(fip) && !cmList.includes(fip)) cmList.push(fip); }
  cmList = cmList.slice(0, 3);

  const cfEndpoints = [
    { ip: cuList[0] || '162.159.192.1', tag: `${nodeName}-联通动态优选1` },
    { ip: cuList[1] || '104.16.160.1', tag: `${nodeName}-联通动态优选2` },
    { ip: cmList[0] || '172.67.150.238', tag: `${nodeName}-移动动态优选1` },
    { ip: cmList[1] || '172.67.71.6', tag: `${nodeName}-移动动态优选2` },
    { ip: 'icook.hk', tag: `${nodeName}-香港企业优选` },
    { ip: CFIP || '198.41.222.226', tag: `${nodeName}-官方Anycast` }
  ];

  return new Promise((resolve) => {
    setTimeout(() => {

      let nodesList = [];
      const AU_UUID = 'f773fcf5-7d63-4583-a707-2bce59ee1ae8';
      const AU_REALITY_PBK = 'sRgRqjxLPHK9FhGyVodwm7lTrj5H6dae8fwTn8dd4Vg';
      const AU_REALITY_SID = 'e8a9b2c3';
      const JP_HOST = 'jp.litex1024.dpdns.org';
      const JP_PATH = '%2Ff773fcf5';
      const staticSubLinks = [
        `vless://${AU_UUID}@52.63.184.33:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=itunes.apple.com&fp=chrome&pbk=${AU_REALITY_PBK}&sid=${AU_REALITY_SID}&type=tcp#${encodeURIComponent('🇦🇺 AWS-悉尼 (Reality)')}`,
        `hysteria2://nishishabi@52.63.184.33:443?sni=itunes.apple.com&insecure=1#${encodeURIComponent('🇦🇺 AWS-悉尼 (Hysteria2)')}`,
        `vless://${AU_UUID}@${JP_HOST}:443?encryption=none&security=tls&sni=${JP_HOST}&fp=chrome&type=ws&host=${JP_HOST}&path=${JP_PATH}#${encodeURIComponent('🇯🇵 日本东京-Vercel (域名直连)')}`,
        `vless://${AU_UUID}@icook.hk:443?encryption=none&security=tls&sni=${JP_HOST}&fp=chrome&type=ws&host=${JP_HOST}&path=${JP_PATH}#${encodeURIComponent('🇯🇵 日本东京-Vercel (香港优选)')}`,
        `vless://${AU_UUID}@104.21.14.15:443?encryption=none&security=tls&sni=${JP_HOST}&fp=chrome&type=ws&host=${JP_HOST}&path=${JP_PATH}#${encodeURIComponent('🇯🇵 日本东京-Vercel (Anycast优选)')}`
      ];
      for (const ep of cfEndpoints) {
        const vless = `vless://${UUID}@${ep.ip}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${encodeURIComponent(ep.tag)}`;
        const vmessObj = { v: '2', ps: ep.tag, add: ep.ip, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox' };
        const vmess = `vmess://${Buffer.from(JSON.stringify(vmessObj)).toString('base64')}`;
        const trojan = `trojan://${UUID}@${ep.ip}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${encodeURIComponent(ep.tag)}`;
        nodesList.push(vless, vmess, trojan);
      }
      nodesList.push(...staticSubLinks);
      const subTxt = nodesList.join('\n\n') + '\n';
      // 打印 sub.txt 内容到控制台
      console.log(Buffer.from(subTxt).toString('base64'));
      fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
      console.log(`${FILE_PATH}/sub.txt saved successfully`);
      uploadNodes();
      // 生成原生 Clash 配置文件
      function generateClashConfig() {
        let proxyLines = [];
        let vlessNames = [];
        let trojanNames = [];
        let vmessNames = [];

        for (const ep of cfEndpoints) {
          const vlessName = `${ep.tag}-VLESS`;
          const vmessName = `${ep.tag}-VMess`;
          const trojanName = `${ep.tag}-Trojan`;

          vlessNames.push(vlessName);
          trojanNames.push(trojanName);
          vmessNames.push(vmessName);

          proxyLines.push(`  - name: "${vlessName}"\n    type: vless\n    server: ${ep.ip}\n    port: ${CFPORT}\n    uuid: ${UUID}\n    cipher: none\n    tls: true\n    client-fingerprint: firefox\n    servername: ${argoDomain}\n    network: ws\n    ws-opts:\n      path: "/vless-argo?ed=2560"\n      headers:\n        Host: ${argoDomain}\n      heartbeat-interval: 20`);

          proxyLines.push(`  - name: "${vmessName}"\n    type: vmess\n    server: ${ep.ip}\n    port: ${CFPORT}\n    uuid: ${UUID}\n    alterId: 0\n    cipher: auto\n    tls: true\n    client-fingerprint: firefox\n    servername: ${argoDomain}\n    network: ws\n    ws-opts:\n      path: "/vmess-argo?ed=2560"\n      headers:\n        Host: ${argoDomain}\n      heartbeat-interval: 20`);

          proxyLines.push(`  - name: "${trojanName}"\n    type: trojan\n    server: ${ep.ip}\n    port: ${CFPORT}\n    password: ${UUID}\n    client-fingerprint: firefox\n    sni: ${argoDomain}\n    network: ws\n    ws-opts:\n      path: "/trojan-argo?ed=2560"\n      headers:\n        Host: ${argoDomain}\n      heartbeat-interval: 20`);
        }

        const staticProxies = [
          { name: '🇦🇺 AWS-悉尼 (Reality)', yaml: `  - name: "🇦🇺 AWS-悉尼 (Reality)"\n    type: vless\n    server: 52.63.184.33\n    port: 443\n    uuid: f773fcf5-7d63-4583-a707-2bce59ee1ae8\n    network: tcp\n    tls: true\n    udp: true\n    flow: xtls-rprx-vision\n    servername: itunes.apple.com\n    reality-opts:\n      public-key: sRgRqjxLPHK9FhGyVodwm7lTrj5H6dae8fwTn8dd4Vg\n      short-id: e8a9b2c3\n    client-fingerprint: chrome` },
          { name: '🇦🇺 AWS-悉尼 (Hysteria2)', yaml: `  - name: "🇦🇺 AWS-悉尼 (Hysteria2)"\n    type: hysteria2\n    server: 52.63.184.33\n    port: 443\n    password: nishishabi\n    sni: itunes.apple.com\n    skip-cert-verify: true` },
          { name: '🇯🇵 日本东京-Vercel (域名直连)', yaml: `  - name: "🇯🇵 日本东京-Vercel (域名直连)"\n    type: vless\n    server: jp.litex1024.dpdns.org\n    port: 443\n    uuid: f773fcf5-7d63-4583-a707-2bce59ee1ae8\n    cipher: none\n    tls: true\n    client-fingerprint: chrome\n    servername: jp.litex1024.dpdns.org\n    network: ws\n    ws-opts:\n      path: "/f773fcf5"\n      headers:\n        Host: jp.litex1024.dpdns.org\n      heartbeat-interval: 20` },
          { name: '🇯🇵 日本东京-Vercel (香港优选)', yaml: `  - name: "🇯🇵 日本东京-Vercel (香港优选)"\n    type: vless\n    server: icook.hk\n    port: 443\n    uuid: f773fcf5-7d63-4583-a707-2bce59ee1ae8\n    cipher: none\n    tls: true\n    client-fingerprint: chrome\n    servername: jp.litex1024.dpdns.org\n    network: ws\n    ws-opts:\n      path: "/f773fcf5"\n      headers:\n        Host: jp.litex1024.dpdns.org\n      heartbeat-interval: 20` },
          { name: '🇯🇵 日本东京-Vercel (Anycast优选)', yaml: `  - name: "🇯🇵 日本东京-Vercel (Anycast优选)"\n    type: vless\n    server: 104.21.14.15\n    port: 443\n    uuid: f773fcf5-7d63-4583-a707-2bce59ee1ae8\n    cipher: none\n    tls: true\n    client-fingerprint: chrome\n    servername: jp.litex1024.dpdns.org\n    network: ws\n    ws-opts:\n      path: "/f773fcf5"\n      headers:\n        Host: jp.litex1024.dpdns.org\n      heartbeat-interval: 20` }
        ];
        for (const sp of staticProxies) proxyLines.push(sp.yaml);
        const staticNames = staticProxies.map(s => s.name);

        // 常规出口（节点选择、自动选择、故障转移）只包含美国 OVH 节点，严格隔离澳洲/日本专用节点
        // VLESS优先：自动/故障转移只跑VLESS+Trojan（12节点），VMess仅保留手动直选，避免0.1核CPU排队与url-test自DDoS
        const usProxyNames = [...vlessNames, ...trojanNames, ...vmessNames];
        const autoProxyNames = [...vlessNames, ...trojanNames];
        const proxyGroupItems = usProxyNames.map(n => `      - "${n}"`).join('\n');
        const autoProxyGroupItems = autoProxyNames.map(n => `      - "${n}"`).join('\n');

        // 提取联通专属与移动专属节点列表，供自适应策略组使用
        const cuProxyNames = usProxyNames.filter(n => n.includes('联通'));
        const cmProxyNames = usProxyNames.filter(n => n.includes('移动') || n.includes('香港'));
        const cuProxyGroupItems = cuProxyNames.map(n => `      - "${n}"`).join('\n');
        const cmProxyGroupItems = cmProxyNames.map(n => `      - "${n}"`).join('\n');

        return `port: 7890
socks-port: 7891
allow-lan: false
mode: rule
log-level: info
unified-delay: true
tcp-concurrent: true
keep-alive-interval: 30

dns:
  enable: true
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  respect-rules: true
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  proxy-server-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  nameserver:
    - https://223.5.5.5/dns-query
    - https://dns.alidns.com/dns-query
  fallback:
    - https://223.5.5.5/dns-query
    - "https://1.1.1.1/dns-query#节点选择"
  fallback-filter:
    geoip: true
    geoip-code: CN
    ipcidr:
      - 240.0.0.0/4
  nameserver-policy:
    "geosite:cn":
      - https://223.5.5.5/dns-query
      - https://dns.alidns.com/dns-query
    "hyperliquid.xyz,+.hyperliquid.xyz":
      - "https://1.1.1.1/dns-query#🎲 预测与交易"
      - "https://8.8.8.8/dns-query#🎲 预测与交易"
    "polymarket.com,+.polymarket.com":
      - "https://1.1.1.1/dns-query#🎲 预测与交易"
      - "https://8.8.8.8/dns-query#🎲 预测与交易"
    "9now.com.au,+.9now.com.au,nine.com.au,+.nine.com.au,7plus.com.au,+.7plus.com.au,sevenwestmedia.com.au,+.sevenwestmedia.com.au,swm.digital,+.swm.digital,abc.net.au,+.abc.net.au,iview.abc.net.au,+.iview.abc.net.au,sbs.com.au,+.sbs.com.au,sbsondemand.com.au,+.sbsondemand.com.au,sbsod.com,+.sbsod.com,videocdn-sbs.akamaized.net,+.videocdn-sbs.akamaized.net,theplatform.com,+.theplatform.com,sbsvodns-vh.akamaihd.net,+.sbsvodns-vh.akamaihd.net,sbsvoddai-vh.akamaihd.net,+.sbsvoddai-vh.akamaihd.net,10play.com.au,+.10play.com.au,ten.com.au,+.ten.com.au,stan.com.au,+.stan.com.au,stan.video,+.stan.video,binge.com.au,+.binge.com.au,kayosports.com.au,+.kayosports.com.au,streamotion.com.au,+.streamotion.com.au,optussport.tv,+.optussport.tv":
      - "https://1.1.1.1/dns-query#🦘 澳洲媒体"
      - "https://8.8.8.8/dns-query#🦘 澳洲媒体"
    "ipleak.net,+.ipleak.net":
      - "https://1.1.1.1/dns-query#节点选择"
      - "https://8.8.8.8/dns-query#节点选择"

proxies:
${proxyLines.join('\n\n')}

proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - 自动选择
      - 故障转移
      - 📶 联通优选
      - 📶 移动广电优选
${proxyGroupItems}
      - DIRECT

  - name: 自动选择
    type: url-test
    url: https://cp.cloudflare.com/generate_204
    interval: 300
    tolerance: 150
    lazy: true
    proxies:
${autoProxyGroupItems}

  - name: 故障转移
    type: fallback
    url: https://cp.cloudflare.com/generate_204
    interval: 180
    lazy: true
    proxies:
${autoProxyGroupItems}

  - name: 📶 联通优选
    type: url-test
    url: https://cp.cloudflare.com/generate_204
    interval: 300
    tolerance: 150
    lazy: true
    proxies:
${cuProxyGroupItems}

  - name: 📶 移动广电优选
    type: url-test
    url: https://cp.cloudflare.com/generate_204
    interval: 300
    tolerance: 150
    lazy: true
    proxies:
${cmProxyGroupItems}

  - name: 🦘 澳洲媒体
    type: fallback
    url: http://cp.cloudflare.com/generate_204
    interval: 180
    lazy: true
    proxies:
      - "🇦🇺 AWS-悉尼 (Reality)"
      - "🇦🇺 AWS-悉尼 (Hysteria2)"

  - name: 🎲 预测与交易
    type: fallback
    url: https://api.hyperliquid.xyz/info
    interval: 150
    proxies:
      - "🇦🇺 AWS-悉尼 (Reality)"
      - "🇦🇺 AWS-悉尼 (Hysteria2)"
      - "🇯🇵 日本东京-Vercel (域名直连)"
      - "🇯🇵 日本东京-Vercel (香港优选)"
      - "🇯🇵 日本东京-Vercel (Anycast优选)"

rules:
  - AND,((NETWORK,udp),(DST-PORT,443)),REJECT
  - DOMAIN-SUFFIX,hyperliquid.xyz,🎲 预测与交易
  - DOMAIN-KEYWORD,hyperliquid,🎲 预测与交易
  - DOMAIN-SUFFIX,polymarket.com,🎲 预测与交易
  - DOMAIN-KEYWORD,polymarket,🎲 预测与交易
  - DOMAIN-SUFFIX,sbs.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,sbsondemand.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,sbsod.com,🦘 澳洲媒体
  - DOMAIN-SUFFIX,videocdn-sbs.akamaized.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,sbs-live.akamaized.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,sbs-live-dai.akamaized.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,sbs-vod-prod-01.akamaized.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,sbs-vod-dai-prod-01.akamaized.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,sbsvodns-vh.akamaihd.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,sbsvoddai-vh.akamaihd.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,theplatform.com,🦘 澳洲媒体
  - DOMAIN-SUFFIX,9now.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,nine.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,nineentertainment.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,nineentertainmentco.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,ninemediaroom.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,ninemsn.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,p-9now.akamaized.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,9now-livestreams.akamaized.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,9now-livestreams-hd-t.akamaized.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,7plus.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,sevenwestmedia.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,swm.digital,🦘 澳洲媒体
  - DOMAIN-SUFFIX,seven.demdex.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,npc-live-sevennetwork.akamaized.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,7plus-sevennetwork.akamaized.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,iview.abc.net.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,abc.net.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,abcforkids.net.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,abc-iview-mediapackagestreams-2.akamaized.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,10play.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,ten.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,networkten.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,stan.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,stan.video,🦘 澳洲媒体
  - DOMAIN-SUFFIX,live01-stan.akamaized.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,live02-stan.akamaized.net,🦘 澳洲媒体
  - DOMAIN-SUFFIX,binge.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,kayosports.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,streamotion.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,optus.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,optusdigital.com,🦘 澳洲媒体
  - DOMAIN-SUFFIX,optusnet.com.au,🦘 澳洲媒体
  - DOMAIN-SUFFIX,optussport.tv,🦘 澳洲媒体
  - DOMAIN-SUFFIX,optusvideo.tv,🦘 澳洲媒体
  - GEOSITE,cn,DIRECT
  - GEOIP,CN,DIRECT
  - MATCH,节点选择
`;
      }

      const clashConfig = generateClashConfig();
      fs.writeFileSync(path.join(FILE_PATH, 'clash.yaml'), clashConfig);
      console.log(`${FILE_PATH}/clash.yaml saved successfully`);

      // 1. 原生 /clash 路由：供 Clash Verge 专用
      
      // 1.0 原生 /vps 路由：供 VPS 搭建节点专用（支持联通随身WiFi与广电移动双网自适应）
      const vpsConfig = "port: 7890\nsocks-port: 7891\nmixed-port: 7890\nallow-lan: false\nmode: rule\nlog-level: info\nunified-delay: true\ntcp-concurrent: true\nkeep-alive-interval: 30\n\ntun:\n  enable: true\n  stack: gvisor\n  device: Mihomo\n  auto-route: true\n  auto-detect-interface: true\n  strict-route: false\n  route-exclude-address:\n    - 107.172.82.170/32\n    - 52.63.184.33/32\n    - 192.168.0.0/16\n    - 10.0.0.0/8\n    - 172.16.0.0/12\n\ndns:\n  enable: true\n  ipv6: false\n  enhanced-mode: fake-ip\n  fake-ip-range: 198.18.0.1/16\n  respect-rules: true\n  default-nameserver:\n    - 223.5.5.5\n    - 119.29.29.29\n  proxy-server-nameserver:\n    - 223.5.5.5\n    - 119.29.29.29\n  nameserver:\n    - 223.5.5.5\n    - 119.29.29.29\n    - https://dns.alidns.com/dns-query\n  fallback:\n    - \"https://1.1.1.1/dns-query#\ud83d\ude80 \u8282\u70b9\u9009\u62e9\"\n    - \"https://8.8.8.8/dns-query#\ud83d\ude80 \u8282\u70b9\u9009\u62e9\"\n  fallback-filter:\n    geoip: true\n    geoip-code: CN\n    ipcidr:\n      - 240.0.0.0/4\n  nameserver-policy:\n    \"geosite:cn\":\n      - 223.5.5.5\n      - 119.29.29.29\n    \"hyperliquid.xyz,+.hyperliquid.xyz\":\n      - \"https://1.1.1.1/dns-query#\ud83c\udfb2 \u9884\u6d4b\u4e0e\u4ea4\u6613\"\n      - \"https://8.8.8.8/dns-query#\ud83c\udfb2 \u9884\u6d4b\u4e0e\u4ea4\u6613\"\n    \"polymarket.com,+.polymarket.com\":\n      - \"https://1.1.1.1/dns-query#\ud83c\udfb2 \u9884\u6d4b\u4e0e\u4ea4\u6613\"\n      - \"https://8.8.8.8/dns-query#\ud83c\udfb2 \u9884\u6d4b\u4e0e\u4ea4\u6613\"\n    \"9now.com.au,+.9now.com.au,nine.com.au,+.nine.com.au,7plus.com.au,+.7plus.com.au,sevenwestmedia.com.au,+.sevenwestmedia.com.au,swm.digital,+.swm.digital,abc.net.au,+.abc.net.au,iview.abc.net.au,+.iview.abc.net.au,sbs.com.au,+.sbs.com.au,sbsondemand.com.au,+.sbsondemand.com.au,sbsod.com,+.sbsod.com,videocdn-sbs.akamaized.net,+.videocdn-sbs.akamaized.net,theplatform.com,+.theplatform.com,sbsvodns-vh.akamaihd.net,+.sbsvodns-vh.akamaihd.net,sbsvoddai-vh.akamaihd.net,+.sbsvoddai-vh.akamaihd.net,10play.com.au,+.10play.com.au,ten.com.au,+.ten.com.au,stan.com.au,+.stan.com.au,stan.video,+.stan.video,binge.com.au,+.binge.com.au,kayosports.com.au,+.kayosports.com.au,streamotion.com.au,+.streamotion.com.au,optussport.tv,+.optussport.tv\":\n      - \"https://1.1.1.1/dns-query#\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\"\n      - \"https://8.8.8.8/dns-query#\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\"\n    \"x.litex1024.dpdns.org,+.x.litex1024.dpdns.org,koyeb.app,+.koyeb.app,jp.litex1024.dpdns.org,+.jp.litex1024.dpdns.org,icook.hk,+.icook.hk,vercel.app,+.vercel.app\":\n      - 223.5.5.5\n      - 119.29.29.29\n    \"ipleak.net,+.ipleak.net\":\n      - \"https://1.1.1.1/dns-query#\ud83d\ude80 \u8282\u70b9\u9009\u62e9\"\n      - \"https://8.8.8.8/dns-query#\ud83d\ude80 \u8282\u70b9\u9009\u62e9\"\n\nproxies:\n  - name: \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90091-VLESS\"\n    type: vless\n    server: 172.64.67.117\n    port: 443\n    uuid: bf806dba-a7db-43c6-bc03-b342b621687b\n    cipher: none\n    tls: true\n    client-fingerprint: firefox\n    servername: x.litex1024.dpdns.org\n    network: ws\n    ws-opts:\n      path: \"/vless-argo?ed=2560\"\n      headers:\n        Host: x.litex1024.dpdns.org\n      heartbeat-interval: 20\n\n  - name: \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90092-VLESS\"\n    type: vless\n    server: 162.159.236.194\n    port: 443\n    uuid: bf806dba-a7db-43c6-bc03-b342b621687b\n    cipher: none\n    tls: true\n    client-fingerprint: firefox\n    servername: x.litex1024.dpdns.org\n    network: ws\n    ws-opts:\n      path: \"/vless-argo?ed=2560\"\n      headers:\n        Host: x.litex1024.dpdns.org\n      heartbeat-interval: 20\n\n  - name: \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90091-VMess\"\n    type: vmess\n    server: 172.64.67.117\n    port: 443\n    uuid: bf806dba-a7db-43c6-bc03-b342b621687b\n    alterId: 0\n    cipher: auto\n    tls: true\n    client-fingerprint: firefox\n    servername: x.litex1024.dpdns.org\n    network: ws\n    ws-opts:\n      path: \"/vmess-argo?ed=2560\"\n      headers:\n        Host: x.litex1024.dpdns.org\n      heartbeat-interval: 20\n\n  - name: \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90091-VLESS\"\n    type: vless\n    server: 162.159.133.16\n    port: 443\n    uuid: bf806dba-a7db-43c6-bc03-b342b621687b\n    cipher: none\n    tls: true\n    client-fingerprint: firefox\n    servername: x.litex1024.dpdns.org\n    network: ws\n    ws-opts:\n      path: \"/vless-argo?ed=2560\"\n      headers:\n        Host: x.litex1024.dpdns.org\n      heartbeat-interval: 20\n\n  - name: \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90092-VLESS\"\n    type: vless\n    server: 198.41.208.201\n    port: 443\n    uuid: bf806dba-a7db-43c6-bc03-b342b621687b\n    cipher: none\n    tls: true\n    client-fingerprint: firefox\n    servername: x.litex1024.dpdns.org\n    network: ws\n    ws-opts:\n      path: \"/vless-argo?ed=2560\"\n      headers:\n        Host: x.litex1024.dpdns.org\n      heartbeat-interval: 20\n\n  - name: \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u9999\u6e2f\u4f01\u4e1a\u4f18\u9009-VLESS\"\n    type: vless\n    server: icook.hk\n    port: 443\n    uuid: bf806dba-a7db-43c6-bc03-b342b621687b\n    cipher: none\n    tls: true\n    client-fingerprint: firefox\n    servername: x.litex1024.dpdns.org\n    network: ws\n    ws-opts:\n      path: \"/vless-argo?ed=2560\"\n      headers:\n        Host: x.litex1024.dpdns.org\n      heartbeat-interval: 20\n\n  - name: \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u5b98\u65b9Anycast-VLESS\"\n    type: vless\n    server: 104.21.14.15\n    port: 443\n    uuid: bf806dba-a7db-43c6-bc03-b342b621687b\n    cipher: none\n    tls: true\n    client-fingerprint: firefox\n    servername: x.litex1024.dpdns.org\n    network: ws\n    ws-opts:\n      path: \"/vless-argo?ed=2560\"\n      headers:\n        Host: x.litex1024.dpdns.org\n      heartbeat-interval: 20\n\n  - name: \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90091-VMess\"\n    type: vmess\n    server: 162.159.133.16\n    port: 443\n    uuid: bf806dba-a7db-43c6-bc03-b342b621687b\n    alterId: 0\n    cipher: auto\n    tls: true\n    client-fingerprint: firefox\n    servername: x.litex1024.dpdns.org\n    network: ws\n    ws-opts:\n      path: \"/vmess-argo?ed=2560\"\n      headers:\n        Host: x.litex1024.dpdns.org\n      heartbeat-interval: 20\n\n  - name: \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u5b98\u65b9Anycast-VMess\"\n    type: vmess\n    server: 104.21.14.15\n    port: 443\n    uuid: bf806dba-a7db-43c6-bc03-b342b621687b\n    alterId: 0\n    cipher: auto\n    tls: true\n    client-fingerprint: firefox\n    servername: x.litex1024.dpdns.org\n    network: ws\n    ws-opts:\n      path: \"/vmess-argo?ed=2560\"\n      headers:\n        Host: x.litex1024.dpdns.org\n      heartbeat-interval: 20\n\n  - name: \"\ud83c\uddfa\ud83c\uddf8 RackNerd-HY2-\u7aef\u53e3\u8df3\u8dc3 (\u5907\u7528\u76f4\u8fde)\"\n    type: hysteria2\n    server: 107.172.82.170\n    ports: \"20000-30000\"\n    password: bf806dba-a7db-43c6-bc03-b342b621687b\n    sni: www.bing.com\n    skip-cert-verify: true\n    alpn:\n      - h3\n    obfs: salamander\n    obfs-password: antigravity\n\n  - name: \"\ud83c\uddfa\ud83c\uddf8 RackNerd-VLESS-Reality (TCP\u76f4\u8fde)\"\n    type: vless\n    server: 107.172.82.170\n    port: 62293\n    uuid: bf806dba-a7db-43c6-bc03-b342b621687b\n    network: tcp\n    flow: xtls-rprx-vision\n    tls: true\n    udp: true\n    servername: www.iij.ad.jp\n    client-fingerprint: chrome\n    reality-opts:\n      public-key: Rlmm7wuIbLD4SctBgK-i12YNiqeH4wrc9D7awmDbLWw\n      short-id: e8a9b2c3\n\n  - name: \"\ud83c\uddfa\ud83c\uddf8 RackNerd-HY2-\u76f4\u8fde (\u5907\u7528\u76f4\u8fde)\"\n    type: hysteria2\n    server: 107.172.82.170\n    port: 62297\n    password: bf806dba-a7db-43c6-bc03-b342b621687b\n    sni: www.bing.com\n    skip-cert-verify: true\n    alpn:\n      - h3\n    obfs: salamander\n    obfs-password: antigravity\n\n  - name: \"\ud83c\uddfa\ud83c\uddf8 RackNerd-TUIC-v5 (\u6781\u901f\u76f4\u8fde)\"\n    type: tuic\n    server: 107.172.82.170\n    port: 62295\n    uuid: bf806dba-a7db-43c6-bc03-b342b621687b\n    password: jtwYt6nb7Czp7aIHhwtoNEjd\n    alpn:\n      - h3\n    sni: www.bing.com\n    skip-cert-verify: true\n    congestion-controller: bbr\n    udp-relay-mode: native\n\n  - name: \"\ud83c\udde6\ud83c\uddfa AWS-\u6089\u5c3c (Reality)\"\n    type: vless\n    server: 52.63.184.33\n    port: 443\n    uuid: f773fcf5-7d63-4583-a707-2bce59ee1ae8\n    network: tcp\n    tls: true\n    udp: true\n    flow: xtls-rprx-vision\n    servername: itunes.apple.com\n    reality-opts:\n      public-key: sRgRqjxLPHK9FhGyVodwm7lTrj5H6dae8fwTn8dd4Vg\n      short-id: e8a9b2c3\n    client-fingerprint: chrome\n\n  - name: \"\ud83c\udde6\ud83c\uddfa AWS-\u6089\u5c3c (Hysteria2)\"\n    type: hysteria2\n    server: 52.63.184.33\n    port: 443\n    password: nishishabi\n    sni: itunes.apple.com\n    skip-cert-verify: true\n\n  - name: \"\ud83c\uddef\ud83c\uddf5 \u65e5\u672c\u4e1c\u4eac-Vercel (\u57df\u540d\u76f4\u8fde)\"\n    type: vless\n    server: jp.litex1024.dpdns.org\n    port: 443\n    uuid: f773fcf5-7d63-4583-a707-2bce59ee1ae8\n    cipher: none\n    tls: true\n    client-fingerprint: chrome\n    servername: jp.litex1024.dpdns.org\n    network: ws\n    ws-opts:\n      path: \"/f773fcf5\"\n      headers:\n        Host: jp.litex1024.dpdns.org\n      heartbeat-interval: 20\n\n  - name: \"\ud83c\uddef\ud83c\uddf5 \u65e5\u672c\u4e1c\u4eac-Vercel (\u9999\u6e2f\u4f18\u9009)\"\n    type: vless\n    server: icook.hk\n    port: 443\n    uuid: f773fcf5-7d63-4583-a707-2bce59ee1ae8\n    cipher: none\n    tls: true\n    client-fingerprint: chrome\n    servername: jp.litex1024.dpdns.org\n    network: ws\n    ws-opts:\n      path: \"/f773fcf5\"\n      headers:\n        Host: jp.litex1024.dpdns.org\n      heartbeat-interval: 20\n\n  - name: \"\ud83c\uddef\ud83c\uddf5 \u65e5\u672c\u4e1c\u4eac-Vercel (Anycast\u4f18\u9009)\"\n    type: vless\n    server: 104.21.14.15\n    port: 443\n    uuid: f773fcf5-7d63-4583-a707-2bce59ee1ae8\n    cipher: none\n    tls: true\n    client-fingerprint: chrome\n    servername: jp.litex1024.dpdns.org\n    network: ws\n    ws-opts:\n      path: \"/f773fcf5\"\n      headers:\n        Host: jp.litex1024.dpdns.org\n      heartbeat-interval: 20\n\nproxy-groups:\n  - name: \"\ud83d\ude80 \u8282\u70b9\u9009\u62e9\"\n    type: select\n    proxies:\n      - \"\u26a1 \u81ea\u52a8\u9009\u62e9\"\n      - \"\ud83d\udee1\ufe0f \u6545\u969c\u8f6c\u79fb\"\n      - \"\ud83d\udcf6 \u8054\u901a\u4f18\u9009\"\n      - \"\ud83d\udcf6 \u79fb\u52a8\u5e7f\u7535\u4f18\u9009\"\n      - \"\ud83c\udf10 CDN\u7a33\u5b9a\"\n      - \"\ud83d\udd0c \u76f4\u8fde\u4e13\u7528\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-HY2-\u7aef\u53e3\u8df3\u8dc3 (\u5907\u7528\u76f4\u8fde)\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90091-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90092-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90091-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90092-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u9999\u6e2f\u4f01\u4e1a\u4f18\u9009-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u5b98\u65b9Anycast-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90091-VMess\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90091-VMess\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u5b98\u65b9Anycast-VMess\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-VLESS-Reality (TCP\u76f4\u8fde)\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-HY2-\u76f4\u8fde (\u5907\u7528\u76f4\u8fde)\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-TUIC-v5 (\u6781\u901f\u76f4\u8fde)\"\n      - DIRECT\n\n  # \u6838\u5fc3\u7b56\u7565\uff1aHY2\u4f18\u5148 \u2192 CDN\u81ea\u52a8\u515c\u5e95\uff08\u89e3\u51b3\u5e7f\u7535QoS\u95ee\u9898\uff09\n  # fallback\u6a21\u5f0f\uff1a\u6309\u987a\u5e8f\u5c1d\u8bd5\uff0c\u7b2c\u4e00\u4e2a\u80fd\u901a\u7684\u5c31\u7528\u5b83\n  # HY2\u7aef\u53e3\u8df3\u8dc3\u6392\u7b2c\u4e00\uff08\u901f\u5ea6\u6700\u597d\uff09\uff0c\u88abCBN\u6390\u65ad\u540e\u81ea\u52a8\u5207\u5230CDN VLESS\n  - name: \"\u26a1 \u81ea\u52a8\u9009\u62e9\"\n    type: fallback\n    url: http://cp.cloudflare.com/generate_204\n    interval: 90\n    lazy: true\n    timeout: 5000\n    proxies:\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-HY2-\u7aef\u53e3\u8df3\u8dc3 (\u5907\u7528\u76f4\u8fde)\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90091-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90092-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90091-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90092-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u9999\u6e2f\u4f01\u4e1a\u4f18\u9009-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u5b98\u65b9Anycast-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90091-VMess\"\n\n  # \u5168\u9762\u6545\u969c\u8f6c\u79fb\uff1aHY2 \u2192 Reality \u2192 CDN\uff0c\u8986\u76d6\u6240\u6709\u534f\u8bae\n  - name: \"\ud83d\udee1\ufe0f \u6545\u969c\u8f6c\u79fb\"\n    type: fallback\n    url: http://cp.cloudflare.com/generate_204\n    interval: 60\n    lazy: false\n    timeout: 5000\n    proxies:\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-HY2-\u7aef\u53e3\u8df3\u8dc3 (\u5907\u7528\u76f4\u8fde)\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-VLESS-Reality (TCP\u76f4\u8fde)\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90091-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90092-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90091-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90092-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u9999\u6e2f\u4f01\u4e1a\u4f18\u9009-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u5b98\u65b9Anycast-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u5b98\u65b9Anycast-VMess\"\n\n  # \u7eafCDN\u8282\u70b9\u7ec4\uff1a\u6c38\u8fdc\u4e0d\u53d7CBN QoS\u5f71\u54cd\uff0c\u7a33\u5b9a\u4fdd\u5e95\n  - name: \"\ud83c\udf10 CDN\u7a33\u5b9a\"\n    type: url-test\n    url: http://cp.cloudflare.com/generate_204\n    interval: 300\n    tolerance: 100\n    lazy: true\n    proxies:\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90091-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90092-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90091-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90092-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u9999\u6e2f\u4f01\u4e1a\u4f18\u9009-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u5b98\u65b9Anycast-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90091-VMess\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90091-VMess\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u5b98\u65b9Anycast-VMess\"\n\n  - name: \"\ud83d\udcf6 \u8054\u901a\u4f18\u9009\"\n    type: url-test\n    url: http://cp.cloudflare.com/generate_204\n    interval: 300\n    tolerance: 150\n    lazy: true\n    proxies:\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90091-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90092-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u8054\u901a\u52a8\u6001\u4f18\u90091-VMess\"\n\n  - name: \"\ud83d\udcf6 \u79fb\u52a8\u5e7f\u7535\u4f18\u9009\"\n    type: url-test\n    url: http://cp.cloudflare.com/generate_204\n    interval: 300\n    tolerance: 150\n    lazy: true\n    proxies:\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90091-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90092-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u9999\u6e2f\u4f01\u4e1a\u4f18\u9009-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u5b98\u65b9Anycast-VLESS\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u79fb\u52a8\u52a8\u6001\u4f18\u90091-VMess\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-\u5b98\u65b9Anycast-VMess\"\n\n  # \u76f4\u8fde\u4e13\u7528\u7ec4\uff1a\u624b\u52a8\u9009\u62e9\uff0c\u98de\u884c\u6a21\u5f0f\u540e\u7528\n  - name: \"\ud83d\udd0c \u76f4\u8fde\u4e13\u7528\"\n    type: select\n    proxies:\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-HY2-\u7aef\u53e3\u8df3\u8dc3 (\u5907\u7528\u76f4\u8fde)\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-VLESS-Reality (TCP\u76f4\u8fde)\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-HY2-\u76f4\u8fde (\u5907\u7528\u76f4\u8fde)\"\n      - \"\ud83c\uddfa\ud83c\uddf8 RackNerd-TUIC-v5 (\u6781\u901f\u76f4\u8fde)\"\n\n  - name: \"\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\"\n    type: fallback\n    url: http://cp.cloudflare.com/generate_204\n    interval: 180\n    lazy: true\n    proxies:\n      - \"\ud83c\udde6\ud83c\uddfa AWS-\u6089\u5c3c (Reality)\"\n      - \"\ud83c\udde6\ud83c\uddfa AWS-\u6089\u5c3c (Hysteria2)\"\n\n  - name: \"\ud83c\udfb2 \u9884\u6d4b\u4e0e\u4ea4\u6613\"\n    type: fallback\n    url: https://cp.cloudflare.com/generate_204\n    interval: 150\n    lazy: true\n    proxies:\n      - \"\ud83c\udde6\ud83c\uddfa AWS-\u6089\u5c3c (Reality)\"\n      - \"\ud83c\udde6\ud83c\uddfa AWS-\u6089\u5c3c (Hysteria2)\"\n      - \"\ud83c\uddef\ud83c\uddf5 \u65e5\u672c\u4e1c\u4eac-Vercel (\u57df\u540d\u76f4\u8fde)\"\n      - \"\ud83c\uddef\ud83c\uddf5 \u65e5\u672c\u4e1c\u4eac-Vercel (\u9999\u6e2f\u4f18\u9009)\"\n      - \"\ud83c\uddef\ud83c\uddf5 \u65e5\u672c\u4e1c\u4eac-Vercel (Anycast\u4f18\u9009)\"\n\nrules:\n  - IP-CIDR,107.172.82.170/32,DIRECT,no-resolve\n  - IP-CIDR,52.63.184.33/32,DIRECT,no-resolve\n  - DOMAIN-SUFFIX,hyperliquid.xyz,\ud83c\udfb2 \u9884\u6d4b\u4e0e\u4ea4\u6613\n  - DOMAIN-KEYWORD,hyperliquid,\ud83c\udfb2 \u9884\u6d4b\u4e0e\u4ea4\u6613\n  - DOMAIN-SUFFIX,polymarket.com,\ud83c\udfb2 \u9884\u6d4b\u4e0e\u4ea4\u6613\n  - DOMAIN-KEYWORD,polymarket,\ud83c\udfb2 \u9884\u6d4b\u4e0e\u4ea4\u6613\n  - DOMAIN-SUFFIX,sbs.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,sbsondemand.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,sbsod.com,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,videocdn-sbs.akamaized.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,sbs-live.akamaized.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,sbs-live-dai.akamaized.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,sbs-vod-prod-01.akamaized.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,sbs-vod-dai-prod-01.akamaized.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,sbsvodns-vh.akamaihd.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,sbsvoddai-vh.akamaihd.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,theplatform.com,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,9now.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,nine.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,nineentertainment.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,nineentertainmentco.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,ninemediaroom.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,ninemsn.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,p-9now.akamaized.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,9now-livestreams.akamaized.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,9now-livestreams-hd-t.akamaized.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,7plus.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,sevenwestmedia.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,swm.digital,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,seven.demdex.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,npc-live-sevennetwork.akamaized.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,7plus-sevennetwork.akamaized.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,iview.abc.net.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,abc.net.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,abcforkids.net.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,abc-iview-mediapackagestreams-2.akamaized.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,10play.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,ten.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,networkten.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,stan.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,stan.video,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,live01-stan.akamaized.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,live02-stan.akamaized.net,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,binge.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,kayosports.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,streamotion.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,optus.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,optusdigital.com,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,optusnet.com.au,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,optussport.tv,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - DOMAIN-SUFFIX,optusvideo.tv,\ud83e\udd98 \u6fb3\u6d32\u5a92\u4f53\n  - AND,((NETWORK,udp),(DST-PORT,443)),REJECT\n  - GEOIP,LAN,DIRECT,no-resolve\n  - GEOSITE,cn,DIRECT\n  - GEOIP,CN,DIRECT,no-resolve\n  - MATCH,\ud83d\ude80 \u8282\u70b9\u9009\u62e9\n";
      // 原生 /vps 及兼容鉴权端点 /f773fcf5-7d63-4583-a707-2bce59ee1ae8?target=vps
      app.get(['/vps', '/f773fcf5-7d63-4583-a707-2bce59ee1ae8/vps'], (req, res) => {
        res.set('Content-Type', 'text/yaml; charset=utf-8');
        res.send(vpsConfig);
      });

      app.get('/f773fcf5-7d63-4583-a707-2bce59ee1ae8', (req, res) => {
        const target = (req.query.target || '').toLowerCase();
        if (target === 'vps' || target === 'rn') {
          res.set('Content-Type', 'text/yaml; charset=utf-8');
          return res.send(vpsConfig);
        }
        res.status(400).send('Bad Request: Invalid target');
      });

      app.get('/clash', (req, res) => {
        res.set('Content-Type', 'text/yaml; charset=utf-8');
        res.send(clashConfig);
      });

      // 1.1 专属 /hy2 路由：供手机端 Clash (ClashMi / Flclash / Clash Meta) 极速直连 RackNerd Hysteria 2
      app.get('/hy2', (req, res) => {
        const hy2Config = `port: 7890
socks-port: 7891
allow-lan: false
mode: rule
log-level: info
unified-delay: true

dns:
  enable: true
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  nameserver:
    - https://doh.pub/dns-query
    - https://dns.alidns.com/dns-query
  fallback:
    - https://1.1.1.1/dns-query
    - https://8.8.8.8/dns-query

proxies:
  - name: "🇺🇸 RackNerd-圣何塞 (Hysteria 2 极速跳跃)"
    type: hysteria2
    server: 107.172.82.170
    ports: "20000-30000"
    password: bf806dba-a7db-43c6-bc03-b342b621687b
    sni: www.bing.com
    skip-cert-verify: true
    alpn:
      - h3
    obfs: salamander
    obfs-password: antigravity

proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - "🇺🇸 RackNerd-圣何塞 (Hysteria 2 极速跳跃)"
      - DIRECT

rules:
  - GEOIP,CN,DIRECT
  - MATCH,节点选择
`;
        res.set('Content-Type', 'text/yaml; charset=utf-8');
        res.send(hy2Config);
      });

      // 1.2 专属 /aws 路由：供手机端 Clash 极速直连 AWS 澳大利亚悉尼双协议
      app.get('/aws', (req, res) => {
        const awsConfig = `port: 7890
socks-port: 7891
allow-lan: false
mode: rule
log-level: info
unified-delay: true

dns:
  enable: true
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  nameserver:
    - https://doh.pub/dns-query
    - https://dns.alidns.com/dns-query
  fallback:
    - https://1.1.1.1/dns-query
    - https://8.8.8.8/dns-query

proxies:
  - name: "🇦🇺 AWS-悉尼 (Reality)"
    type: vless
    server: 52.63.184.33
    port: 443
    uuid: f773fcf5-7d63-4583-a707-2bce59ee1ae8
    cipher: none
    tls: true
    flow: xtls-rprx-vision
    servername: itunes.apple.com
    client-fingerprint: chrome
    reality-opts:
      public-key: sRgRqjxLPHK9FhGyVodwm7lTrj5H6dae8fwTn8dd4Vg
      short-id: e8a9b2c3

  - name: "🇦🇺 AWS-悉尼 (Hysteria2)"
    type: hysteria2
    server: 52.63.184.33
    port: 443
    password: nishishabi
    sni: itunes.apple.com
    skip-cert-verify: true
    alpn:
      - h3

proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - "🇦🇺 AWS-悉尼 (Reality)"
      - "🇦🇺 AWS-悉尼 (Hysteria2)"
      - DIRECT

rules:
  - GEOIP,CN,DIRECT
  - MATCH,节点选择
`;
        res.set('Content-Type', 'text/yaml; charset=utf-8');
        res.send(awsConfig);
      });

      // 2. 智能 /sub 路由：若客户端是 Clash 或带有 ?clash 参数，自动返回 Clash YAML；否则返回通用 Base64
      app.get(`/${SUB_PATH}`, (req, res) => {
        const ua = (req.headers['user-agent'] || '').toLowerCase();
        if (ua.includes('clash') || req.query.clash !== undefined) {
          res.set('Content-Type', 'text/yaml; charset=utf-8');
          return res.send(clashConfig);
        }
        const encodedContent = Buffer.from(subTxt).toString('base64');
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(encodedContent);
      });
      resolve(subTxt);
      }, 2000);
    });
  }
}

// 自动上传节点或订阅
async function uploadNodes() {
  if (UPLOAD_URL && PROJECT_URL) {
    const subscriptionUrl = `${PROJECT_URL}/${SUB_PATH}`;
    const jsonData = {
      subscription: [subscriptionUrl]
    };
    try {
        const response = await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, jsonData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response && response.status === 200) {
            console.log('Subscription uploaded successfully');
            return response;
        } else {
          return null;
          //  console.log('Unknown response status');
        }
    } catch (error) {
        if (error.response) {
            if (error.response.status === 400) {
              //  console.error('Subscription already exists');
            }
        }
    }
  } else if (UPLOAD_URL) {
      if (!fs.existsSync(listPath)) return;
      const content = fs.readFileSync(listPath, 'utf-8');
      const nodes = content.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));

      if (nodes.length === 0) return;

      const jsonData = JSON.stringify({ nodes });

      try {
          const response = await axios.post(`${UPLOAD_URL}/api/add-nodes`, jsonData, {
              headers: { 'Content-Type': 'application/json' }
          });
          if (response && response.status === 200) {
            console.log('Nodes uploaded successfully');
            return response;
        } else {
            return null;
        }
      } catch (error) {
          return null;
      }
  } else {
      // console.log('Skipping upload nodes');
      return;
  }
}

// 90s后删除相关文件
function cleanFiles() {
  setTimeout(() => {
    const filesToDelete = [bootLogPath, configPath, webPath, botPath];  
    
    if (NEZHA_PORT) {
      filesToDelete.push(npmPath);
    } else if (NEZHA_SERVER && NEZHA_KEY) {
      filesToDelete.push(phpPath);
    }

    // Windows系统使用不同的删除命令
    if (process.platform === 'win32') {
      exec(`del /f /q ${filesToDelete.join(' ')} > nul 2>&1`, (error) => {
        console.clear();
        console.log('App is running');
        console.log('Thank you for using this script, enjoy!');
      });
    } else {
      exec(`rm -rf ${filesToDelete.join(' ')} >/dev/null 2>&1`, (error) => {
        console.clear();
        console.log('App is running');
        console.log('Thank you for using this script, enjoy!');
      });
    }
  }, 90000); // 90s
}
cleanFiles();

// 自动访问项目URL
async function AddVisitTask() {
  if (!AUTO_ACCESS || !PROJECT_URL) {
    console.log("Skipping adding automatic access task");
    return;
  }

  try {
    const response = await axios.post('https://oooo.serv00.net/add-url', {
      url: PROJECT_URL
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    // console.log(`${JSON.stringify(response.data)}`);
    console.log(`automatic access task added successfully`);
    return response;
  } catch (error) {
    console.error(`Add automatic access task faild: ${error.message}`);
    return null;
  }
}

// 主运行逻辑
async function startserver() {
  try {
    argoType();
    deleteNodes();
    cleanupOldFiles();
    await generateConfig();
    await downloadFilesAndRun();
    await extractDomains();
    await AddVisitTask();
  } catch (error) {
    console.error('Error in startserver:', error);
  }
}
startserver().catch(error => {
  console.error('Unhandled error in startserver:', error);
});
app.listen(PORT, () => {
  console.log(`http server is running on port:${PORT}!`);
  if (PROJECT_URL) {
    console.log(`[Keep-Alive] 启动自愈保活心跳，目标地址: ${PROJECT_URL}`);
    setInterval(async () => {
      try {
        const pingRes = await axios.get(PROJECT_URL, { timeout: 8000 });
        console.log(`[Keep-Alive] 心跳成功 (${pingRes.status}) - ${new Date().toLocaleTimeString()}`);
      } catch (e) {
        console.log(`[Keep-Alive] 心跳触发: ${e.message}`);
      }
    }, 45000);
  }
});
