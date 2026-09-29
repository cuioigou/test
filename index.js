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
// 动态获取针对中国移动/广电的最新优选 IP 池 (基于 cmliu addressesapi)
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
          const uniqueCm = [...new Set(cmIps)];
          resolve(uniqueCm.slice(0, 3));
        } catch (e) {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
}

async function generateLinks(argoDomain) {
  const ISP = await getMetaInfo();
  const nodeName = NAME ? `${NAME}-${ISP}` : ISP;

  let dynamicCm = [];
  try {
    dynamicCm = await fetchDynamicCleanIps();
    console.log('Fetched dynamic CM clean IPs:', dynamicCm);
  } catch (e) {
    console.log('Fetch dynamic CM clean IPs failed, using fallback.');
  }

  const fallbackCm = ['104.16.160.1', '104.17.160.1', '104.18.160.1'];
  const cmList = (dynamicCm && dynamicCm.length >= 2) ? dynamicCm : fallbackCm;

  const cfEndpoints = [
    { ip: CFIP || '198.41.222.226', tag: `${nodeName}-官方Anycast` },
    { ip: cmList[0] || '104.16.160.1', tag: `${nodeName}-移动动态优选1` },
    { ip: cmList[1] || '104.17.160.1', tag: `${nodeName}-移动动态优选2` },
    { ip: cmList[2] || '104.18.160.1', tag: `${nodeName}-移动动态优选3` },
    { ip: 'icook.hk', tag: `${nodeName}-香港企业优选` }
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

        const proxyNames = [...staticNames, ...vlessNames, ...trojanNames, ...vmessNames];
        const proxyGroupItems = proxyNames.map(n => `      - "${n}"`).join('\n');

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
    - https://doh.pub/dns-query
    - https://dns.alidns.com/dns-query
  fallback:
    - "https://1.1.1.1/dns-query#节点选择"
    - "https://8.8.8.8/dns-query#节点选择"
  fallback-filter:
    geoip: true
    geoip-code: CN
    ipcidr:
      - 240.0.0.0/4
  nameserver-policy:
    "geosite:cn":
      - https://doh.pub/dns-query
      - https://dns.alidns.com/dns-query
    "geosite:geolocation-!cn":
      - "https://1.1.1.1/dns-query#节点选择"
      - "https://8.8.8.8/dns-query#节点选择"
    "hyperliquid.xyz,+.hyperliquid.xyz":
      - "https://1.1.1.1/dns-query#🎲 预测与交易"
      - "https://8.8.8.8/dns-query#🎲 预测与交易"
    "polymarket.com,+.polymarket.com":
      - "https://1.1.1.1/dns-query#🎲 预测与交易"
      - "https://8.8.8.8/dns-query#🎲 预测与交易"
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
${proxyGroupItems}
      - DIRECT

  - name: 自动选择
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 150
    lazy: true
    proxies:
${proxyGroupItems}

  - name: 故障转移
    type: fallback
    url: http://www.gstatic.com/generate_204
    interval: 300
    lazy: true
    proxies:
${proxyGroupItems}

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
  - GEOSITE,cn,DIRECT
  - GEOIP,CN,DIRECT
  - MATCH,节点选择
`;
      }

      const clashConfig = generateClashConfig();
      fs.writeFileSync(path.join(FILE_PATH, 'clash.yaml'), clashConfig);
      console.log(`${FILE_PATH}/clash.yaml saved successfully`);

      // 1. 原生 /clash 路由：供 Clash Verge 专用
      app.get('/clash', (req, res) => {
        res.set('Content-Type', 'text/yaml; charset=utf-8');
        res.send(clashConfig);
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
