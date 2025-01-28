import cloudscraper from 'cloudscraper'; 
import fs from 'fs/promises'; 
import chalk from 'chalk'; 
import ora from 'ora'; 
import Table from 'cli-table3'; 
import { SocksProxyAgent } from 'socks-proxy-agent'; 
import { HttpsProxyAgent } from 'https-proxy-agent'; 
import figlet from 'figlet'; 
 
const BASE_URL = 'https://api.depined.org/api'; 
 
const displayBanner = () => {
  console.log(chalk.green(`
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>   
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
 ██████╗ ██╗ ██████╗                  ███████╗     
██╔════╝ ╚═╝ ██╔══██╗ ██████╗ ██╗ ██╗ ╚═══███║     
██║          ███████║ ██╔═██║ ██████║ ███████║     
██║          ██╔══██║ ██║ ██║ ╚═██╔═╝ ███╔═══╝     
╚██████╗     ██████╔╝ ██████║   ██║   ███████╗     
 ╚═════╝     ╚═════╝  ╚═════╝   ╚═╝   ╚══════╝     
            DEPINED AUTO FARMING                   
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<   
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
`));
};
 
// Format timestamps 
const getTimestamp = () => { 
  return new Date().toLocaleTimeString(); 
}; 
 
// Create stats table with simplified columns 
const createStatsTable = (accounts) => { 
  const table = new Table({ 
    head: ['Account', 'Username', 'Email', 'Proxy', 'Status', 'Points Today', 'Total Points', 'Last Update'], 
    style: { 
      head: ['cyan'], 
      border: ['gray'] 
    } 
  }); 
 
  accounts.forEach(account => { 
    table.push([ 
      account.token.substring(0, 8) + '...', 
      account.username || '-', 
      account.email || '-', 
      account.proxyConfig ? ${account.proxyConfig.type}://${account.proxyConfig.host}:${account.proxyConfig.port}.substring(0, 20) + '...' : 'Direct', 
      account.status, 
      account.pointsToday?.toFixed(2) || '0.00', 
      account.totalPoints?.toFixed(2) || '0.00', 
      account.lastUpdate || '-' 
    ]); 
  }); 
 
  return table; 
}; 
 
// Update log success 
const logSuccess = (accountId, message, pointsToday, totalPoints, username, email) => { 
  console.log( 
    chalk.green([${getTimestamp()}] Account ${accountId}: ${message}) + 
    chalk.blue( | ${username}) + 
    chalk.yellow( | ${email}) + 
    chalk.magenta( | Points Today: ${pointsToday?.toFixed(2)}) + 
    chalk.cyan( | Total Points: ${totalPoints?.toFixed(2)}) 
  ); 
}; 
 
// Parse proxy string 
const parseProxyString = (proxyString) => { 
  try { 
    const [protocol, rest] = proxyString.trim().split('://'); 
    if (!rest) throw new Error('Invalid proxy format'); 
 
    let [credentials, hostPort] = rest.split('@'); 
    if (!hostPort) { 
      hostPort = credentials; 
      credentials = null; 
    } 
 
    const [host, port] = hostPort.split(':'); 
    if (!host || !port) throw new Error('Invalid proxy host/port'); 
 
    let auth = null; 
    if (credentials) { 
      const [username, password] = credentials.split(':'); 
      if (username && password) { 
        auth = { username, password }; 
      } 
    } 
 
    return { 
      type: protocol.toLowerCase(), 
      host, 
      port: parseInt(port), 
      auth 
    }; 
  } catch (error) { 
    throw new Error(Failed to parse proxy string: ${proxyString}); 
  } 
}; 
 
// Create proxy agent based on configuration 
const createProxyAgent = (proxyConfig) => { 
  const { type, host, port, auth } = proxyConfig; 
  const proxyUrl = auth 
    ? ${type}://${auth.username}:${auth.password}@${host}:${port} 
    : ${type}://${host}:${port}; 
 
  if (type === 'socks5' || type === 'socks4') { 
    return new SocksProxyAgent(proxyUrl); 
  } else if (type === 'http' || type === 'https') { 
    return new HttpsProxyAgent(proxyUrl); 
  } else { 
    throw new Error(Unsupported proxy type: ${type}); 
  } 
}; 
 
// Get stats using cloudscraper 
const getStats = async (token, proxyConfig = null) => { 
  const headers = { 
    'Accept': 'application/json', 
    'Authorization': Bearer ${token}, 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 
    'Referer': 'https://depined.org/', 
    'Origin': 'https://depined.org/', 
    'Accept-Language': 'en-US,en;q=0.9', 
    'Connection': 'keep-alive' 
  }; 
 
  try { 
    const options = { 
      uri: ${BASE_URL}/stats/earnings, 
      headers,
