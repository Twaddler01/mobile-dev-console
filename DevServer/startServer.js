const fs = require("fs");
const path = require("path");
const DevServer = require("./DevServer");
const ExcludeManager = require("./ExcludeManager");
const { spawn } = require("child_process");

const configDirectory = __dirname;

function loadConfig(configPath) {
    const config = {};

    try {
        if (!fs.existsSync(configPath)) {
            console.warn(
                `[Config] ${path.basename(configPath)} not found; using defaults.`
            );
            return config;
        }

        const data = fs.readFileSync(configPath, "utf8");

        for (const line of data.split(/\r?\n/)) {
            const trimmed = line.trim();

            if (!trimmed || trimmed.startsWith("#")) continue;

            const separator = trimmed.indexOf(":");
            if (separator === -1) continue;

            const key = trimmed.slice(0, separator).trim();
            const value = trimmed.slice(separator + 1).trim();

            if (key) config[key] = value;
        }
    } catch (error) {
        console.warn(`[Config] Could not read ${configPath}: ${error.message}`);
    }

    return config;
}

const fileConfig = loadConfig(path.join(configDirectory, "settings.config"));

const directory = path.resolve(fileConfig.directory || process.cwd());

const excludeManager = new ExcludeManager(directory, {
    configPath: path.join(configDirectory, "exclude.config"),
    excludeGit: fileConfig.exclude_git === "true"
});

excludeManager.load();

const server = new DevServer({
    port: Number.parseInt(fileConfig.port, 10) || 8080,
    directory,
    startPage: fileConfig.start_page || null,
    folderListing: fileConfig.folder_listing === "true",
    disableCache: fileConfig.disable_cache !== "false",
    liveReload: fileConfig.live_reload === "true",
    excludeManager
});

const launchBrowser = fileConfig.launch_browser === "true";
const browserPackage = fileConfig.browser_package || "org.mozilla.firefox";

const port = Number.parseInt(fileConfig.port, 10) || 8080;
const startPage = fileConfig.start_page || "/";
const url = `http://127.0.0.1:${port}${startPage.startsWith("/") ? startPage : `/${startPage}`}`;

server.start();

if (launchBrowser) {
    server.server.once("listening", () => {
        console.log("[Launcher] Server is ready. Opening browser...");

        const args = [
            "start",
            "-a", "android.intent.action.VIEW",
            "-d", url
        ];

        if (browserPackage) {
            args.push("-p", browserPackage);
        }

        const browser = spawn("am", args, { stdio: "inherit" });

        browser.on("error", error => {
            console.error("[Launcher] Could not open browser:", error.message);
        });
    });
}

let shuttingDown = false;

async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log("\n[!] Shutting down dev server...");

    try {
        await server.stop();
        process.exitCode = 0;
    } catch (error) {
        console.error("[DevServer] Shutdown error:", error);
        process.exitCode = 1;
    }
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
