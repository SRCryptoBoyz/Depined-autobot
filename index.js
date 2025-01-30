import cloudscraper from 'cloudscraper';
import fs from 'fs/promises';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import figlet from 'figlet';
import readline from 'readline';

const BASE_URL = 'https://api.depined.org/api';

const displayBanner = () => {
  console.log(chalk.magenta(figlet.textSync('C-BOYZ', { horizontalLayout: 'default' })));
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
      account.proxyConfig ? `${account.proxyConfig.type}://${account.proxyConfig.host}:${account.proxyConfig.port}`.substring(0, 20) + '...' : 'Direct',
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
    chalk.green(`[${getTimestamp()}] Account ${accountId}: ${message}`) +
    chalk.blue(` | ${username}`) +
    chalk.yellow(` | ${email}`) +
    chalk.magenta(` | Points Today: ${pointsToday?.toFixed(2)}`) +
    chalk.cyan(` | Total Points: ${totalPoints?.toFixed(2)}`)
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
    throw new Error(`Failed to parse proxy string: ${proxyString}`);
  }
};

// Create proxy agent based on configuration
const createProxyAgent = (proxyConfig) => {
  const { type, host, port, auth } = proxyConfig;
  const proxyUrl = auth
    ? `${type}://${auth.username}:${auth.password}@${host}:${port}`
    : `${type}://${host}:${port}`;

  if (type === 'socks5' || type === 'socks4') {
    return new SocksProxyAgent(proxyUrl);
  } else if (type === 'http' || type === 'https') {
    return new HttpsProxyAgent(proxyUrl);
  } else {
    throw new Error(`Unsupported proxy type: ${type}`);
  }
};

// Get stats using cloudscraper
const getStats = async (token, proxyConfig = null) => {
  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://depined.org/',
    'Origin': 'https://depined.org/',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive'
  };

  try {
    const options = {
      uri: `${BASE_URL}/stats/earnings`,
      headers,
      method: 'GET',
      resolveWithFullResponse: true
    };

    if (proxyConfig) {
      options.agent = createProxyAgent(proxyConfig);
    }

    const response = await cloudscraper(options);
    const data = JSON.parse(response.body).data;
    return {
      pointsToday: data.total_points_today || 0,
      totalPoints: data.total_points_balance || 0
    };
  } catch (error) {
    throw error;
  }
};

// Get user profile using cloudscraper
const getUserProfile = async (token, proxyConfig = null) => {
  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://depined.org/',
    'Origin': 'https://depined.org/',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive'
  };

  try {
    const options = {
      uri: `${BASE_URL}/user/overview/profile`,
      headers,
      method: 'GET',
      resolveWithFullResponse: true
    };

    if (proxyConfig) {
      options.agent = createProxyAgent(proxyConfig);
    }

    const response = await cloudscraper(options);
    const data = JSON.parse(response.body).data;
    return {
      username: data.profile.username || '-',
      email: data.user_details.email || '-'
    };
  } catch (error) {
    throw error;
  }
};

// Ping function using cloudscraper
const ping = async (token, proxyConfig = null) => {
  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://depined.org/',
    'Origin': 'https://depined.org/',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive'
  };

  try {
    const options = {
      uri: `${BASE_URL}/user/widget-connect`,
      headers,
      method: 'POST',
      body: { connected: true },
      json: true,
      resolveWithFullResponse: true
    };

    if (proxyConfig) {
      options.agent = createProxyAgent(proxyConfig);
    }

    const response = await cloudscraper(options);
    return response.body;
  } catch (error) {
    throw error;
  }
};

// Read and validate input files
const readInputFiles = async (useProxy) => {
  try {
    const tokenData = await fs.readFile('data.txt', 'utf8');
    const tokens = tokenData.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (tokens.length === 0) {
      throw new Error('No tokens found in data.txt');
    }

    let proxies = [];
    if (useProxy) {
      try {
        const proxyData = await fs.readFile('proxy.txt', 'utf8');
        proxies = proxyData.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(proxyString => parseProxyString(proxyString));
      } catch (error) {
        console.log(chalk.yellow('No proxy.txt found or error reading proxies. Running without proxies.'));
      }
    }

    return { tokens, proxies };
  } catch (error) {
    throw new Error(`Failed to read input files: ${error.message}`);
  }
};

// Function to wait for user to press any key
const waitForAnyKey = async (message) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(chalk.yellow(message));
  return new Promise((resolve) => {
    rl.question('Press any key to continue...', () => {
      rl.close();
      resolve();
    });
  });
};

// Main function
const main = async () => {
  displayBanner(); // Tampilkan banner saat aplikasi dimulai

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const useProxy = await new Promise((resolve) => {
    rl.question('Do you want to use proxy? (y/n): ', (answer) => {
      resolve(answer.toLowerCase() === 'y');
    });
  });

  if (useProxy) {
    await waitForAnyKey('\nNOTE: Using proxy may cause Cloudflare issues.\nIf you encounter errors, consider switching to Direct Mode (no proxy).\n');
  }

  rl.close();

  const spinner = ora('Reading input files...').start();
  const { tokens, proxies } = await readInputFiles(useProxy);
  spinner.succeed(`Loaded ${tokens.length} tokens and ${proxies.length} proxies`);

  const accounts = tokens.map((token, index) => ({
    token,
    proxyConfig: proxies[index % proxies.length] || null,
    status: 'Initializing',
    username: null,
    email: null,
    pointsToday: 0,
    totalPoints: 0,
    lastUpdate: null
  }));

  while (true) {
    console.clear();
    displayBanner(); // Tampilkan banner sebelum setiap refresh tabel
    console.log(chalk.yellow('JOIN HERE : https://t.me/PoppetAirdrops\n'));
    console.log(chalk.cyan('=== DPINED-AUTOBOT ===\n'));
    console.log(createStatsTable(accounts).toString());
    console.log(chalk.cyan('\n=== Activity Log ==='));

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];

      try {
        // Get user profile if not already fetched
        if (!account.username || !account.email) {
          const profile = await getUserProfile(account.token, account.proxyConfig);
          account.username = profile.username;
          account.email = profile.email;
        }

        // Ping server
        await ping(account.token, account.proxyConfig);
        account.status = chalk.green('Connected');

        // Get stats
        const stats = await getStats(account.token, account.proxyConfig);

        // Update account data
        account.pointsToday = stats.pointsToday;
        account.totalPoints = stats.totalPoints;
        account.lastUpdate = getTimestamp();

        logSuccess(
          i + 1,
          `Ping successful (${account.proxyConfig ? account.proxyConfig.type : 'Direct'})`,
          stats.pointsToday,
          stats.totalPoints,
          account.username,
          account.email
        );

      } catch (error) {
        account.status = chalk.red('Error');
        account.lastUpdate = getTimestamp();
        console.log(chalk.red(`[${getTimestamp()}] Account ${i + 1}: Error - ${error.message}`));
      }

      // Add small delay between accounts to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Wait before next update (30 seconds)
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
};

// Start the application
(async () => {
  try {
    await main();
  } catch (error) {
    console.error(chalk.red('Application error:', error.message));
    process.exit(1);
  }
})();
