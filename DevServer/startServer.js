const fs = require('fs');
const path = require('path');
const DevServer = require('./DevServer');

function loadConfig(configPath = 'settings.config') {
  const config = {};
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      data.split(/\r?\n/).forEach(line => {
        if (!line.trim() || line.trim().startsWith('#')) return;
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length > 0) {
          config[key.trim()] = valueParts.join(':').trim();
        }
      });
    }
  } catch (err) {
    console.warn('[Config] Could not read settings.config, using defaults.');
  }
  return config;
}

const fileConfig = loadConfig();
const port = fileConfig.port ? parseInt(fileConfig.port, 10) : 3000;
const directory = fileConfig.directory || process.cwd();
const startPage = fileConfig.start_page || null;
// Parse folder_listing boolean value ('true' string to actual boolean)
const folderListing = fileConfig.folder_listing === 'true';
const disableCache = fileConfig.disable_cache === 'true';
const liveReload = fileConfig.live_reload === 'true';

const server = new DevServer({
  port: port,
  directory: path.resolve(directory),
  startPage: startPage,
  folderListing: folderListing,
  disableCache: disableCache,
  liveReload: liveReload
});

server.start();

process.on('SIGINT', () => {
  console.log('\n[!] Shutting down dev server...');
  server.stop(() => process.exit(0));
});
