const http = require("http");
const fs = require("fs");
const path = require("path");

class DevServer {
    constructor(options = {}) {
        this.port = options.port || 8080;
        this.directory = path.resolve(options.directory || process.cwd());
        this.startPage = options.startPage || null;
        this.folderListing = options.folderListing || false;
        this.liveReload = options.liveReload || false;
        this.disableCache = options.disableCache !== false; // Defaults to true if omitted
        this.excludeManager = options.excludeManager;
        this.server = null;
        this.wss = null;
        this.watcher = null;
        this.reloadTimer = null;
        
        this.mimeTypes = {
            ".html": "text/html",
            ".js": "application/javascript",
            ".mjs": "application/javascript",
            ".css": "text/css",
            ".json": "application/json",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".svg": "image/svg+xml"
        };
    }

    start() {
        if (this.server) {
            console.log("[DevServer] Server is already running.");
            return;
        }

        let missingWsWarning = false;
        if (this.liveReload) {
            try {
                const { WebSocketServer } = require("ws");
                this.WebSocketServer = WebSocketServer;
            } catch (e) {
                missingWsWarning = true;
                this.liveReload = false;
            }
        }

        this.server = http.createServer((req, res) => {
            // Conditionally apply anti-cache headers if disableCache is true
            if (this.disableCache) {
                res.setHeader(
                    "Cache-Control",
                    "no-store, no-cache, must-revalidate, max-age=0"
                );
                res.setHeader("Pragma", "no-cache");
                res.setHeader("Expires", "0");
            }

            let safeUrl;

            try {
                safeUrl = decodeURIComponent(
                    new URL(req.url, "http://localhost").pathname
                );
            } catch {
                res.writeHead(400);
                res.end("400 Bad Request");
                return;
            }

            if (safeUrl === "/" && !this.folderListing && this.startPage) {
                res.writeHead(302, { Location: this.startPage });
                res.end();
                return;
            }

            const filePath = path.resolve(this.directory, "." + safeUrl);

            const relativePath = path.relative(this.directory, filePath);

            if (
                path.isAbsolute(relativePath) ||
                relativePath === ".." ||
                relativePath.startsWith(".." + path.sep)
            ) {
                res.writeHead(403);
                res.end("403 Forbidden");
                return;
            }

            const checkPath = () => {
                let isDirectory = false;

                try {
                    isDirectory = fs.statSync(filePath).isDirectory();
                } catch {
                    // A missing file will be handled by the existing 404 response.
                }

                return (
                    this.excludeManager?.isExcluded(filePath, isDirectory) ??
                    false
                );
            };

            if (checkPath()) {
                res.writeHead(404);
                res.end("404 Not Found");
                return;
            }

            fs.stat(filePath, (err, stats) => {
                if (err) {
                    res.writeHead(404, { "Content-Type": "text/html" });
                    res.end(
                        `<h1>404 Not Found</h1><p>Could not resolve path: ${safeUrl}</p>`,
                        "utf-8"
                    );
                    return;
                }

                if (stats.isDirectory()) {
                    const indexPath = path.join(filePath, "index.html");

                    if (this.folderListing) {
                        this.serveDirectoryListing(filePath, req.url, res);
                    } else if (fs.existsSync(indexPath)) {
                        this.sendFile(indexPath, res);
                    } else {
                        res.writeHead(404, { "Content-Type": "text/html" });
                        res.end(
                            "<h1>404 Not Found (No index.html)</h1>",
                            "utf-8"
                        );
                    }
                } else {
                    this.sendFile(filePath, res);
                }
            });
        });

        if (this.liveReload) {
            this.wss = new this.WebSocketServer({ server: this.server });
            this.wss.on("connection", () => {});

            try {
                this.watcher = fs.watch(
                    this.directory,
                    { recursive: true },
                    (eventType, filename) => {
                        this.handleFileChange(filename);
                    }
                );
            } catch (e) {
                console.warn(
                    "[DevServer] Recursive fs.watch not fully supported on this storage volume."
                );
            }
        }

        this.server.listen(this.port, "0.0.0.0", () => {
            console.log(
                `[DevServer] Running at http://localhost:${this.port}/`
            );
            console.log(`[DevServer] Serving root: ${this.directory}`);
            console.log(
                `[DevServer] Folder Listing: ${this.folderListing ? "Enabled" : "Disabled"}`
            );
            console.log(
                `[DevServer] Live Reload: ${this.liveReload ? "Enabled" : "Disabled (Inactive)"}`
            );
            console.log(
                `[DevServer] Disable Cache: ${this.disableCache ? "Enabled (No-Store)" : "Disabled (Standard Caching)"}`
            );

            if (missingWsWarning) {
                console.warn(
                    '\n\x1b[33m[!] WARNING: Live reload is enabled in config, but the "ws" dependency is missing.\x1b[0m'
                );
                console.warn(
                    "\x1b[33m[!] To enable live refreshing, run: npm install ws\x1b[0m"
                );
                console.warn(
                    "\x1b[33m[!] Running normally without live reload....\x1b[0m\n"
                );
            }
        });
    }

    sendFile(filePath, res) {
        const extname = path.extname(filePath);
        const contentType =
            this.mimeTypes[extname] || "application/octet-stream";

        if (this.excludeManager?.isExcluded(filePath, false)) {
            res.writeHead(404);
            res.end("404 Not Found");
            return;
        }

        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            } else {
                res.writeHead(200, { "Content-Type": contentType });

                if (this.liveReload && extname === ".html") {
                    const liveReloadScript = `
            <script>
              const ws = new WebSocket('ws://' + location.host);
              ws.onmessage = (event) => {
                if (event.data === 'reload') {
                  console.log('[LiveReload] Change detected, reloading...');
                  location.reload();
                }
              };
            </script>
          `;
                    let htmlContent = content.toString("utf-8");
                    if (htmlContent.includes("</body>")) {
                        htmlContent = htmlContent.replace(
                            "</body>",
                            liveReloadScript + "</body>"
                        );
                    } else {
                        htmlContent += liveReloadScript;
                    }
                    res.end(htmlContent, "utf-8");
                } else {
                    res.end(content, "utf-8");
                }
            }
        });
    }

    serveDirectoryListing(dirPath, reqUrl, res) {
        fs.readdir(dirPath, { withFileTypes: true }, (err, files) => {
            if (err) {
                res.writeHead(500);
                res.end("Server Error reading directory");
                return;
            }

            let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Directory: ${reqUrl}</title></head><body>`;
            html += `<h2>Index of ${reqUrl}</h2><hr><ul>`;

            if (reqUrl !== "/") {
                const parentUrl = path.dirname(reqUrl);
                html += `<li><a href="${parentUrl}">📁 [Parent Directory]</a></li>`;
            }

            files
                .filter(file => {
                    const fullPath = path.join(dirPath, file.name);

                    return !this.excludeManager?.isExcluded(
                        fullPath,
                        file.isDirectory()
                    );
                })
                .forEach(file => {
                    const isDir = file.isDirectory();
                    const icon = isDir ? "📁" : "📄";
                    const fileName = file.name;
                    const fileUrl = path
                        .join(reqUrl, fileName)
                        .replace(/\\/g, "/");
                    html += `<li>${icon} <a href="${fileUrl}">${fileName}${isDir ? "/" : ""}</a></li>`;
                });

            html += `</ul></body></html>`;

            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(html, "utf-8");
        });
    }


handleFileChange(filename) {
    if (!filename || !this.wss) return;

    const changedPath = path.resolve(
        this.directory,
        filename.toString()
    );

    let isDirectory = false;

    try {
        isDirectory = fs.statSync(changedPath).isDirectory();
    } catch {
        // Deleted files may no longer exist.
    }

    if (this.excludeManager?.isExcluded(
        changedPath,
        isDirectory
    )) {
        return;
    }

    clearTimeout(this.reloadTimer);

    this.reloadTimer = setTimeout(() => {
    if (!this.wss) return;

    let clientsReloaded = 0;

    this.wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send("reload");
            clientsReloaded++;
        }
    });

    if (clientsReloaded > 0) {
        console.log(
            `[DevServer] Live reload (last event): ${filename} (${clientsReloaded} client${clientsReloaded === 1 ? "" : "s"})`
        );
    }
}, 150);
}

    
    async stop() {
    console.log("[DevServer] Closing server...");

    // Stop pending live-reload work.
    if (this.reloadTimer) {
        clearTimeout(this.reloadTimer);
        this.reloadTimer = null;
    }

    // Stop watching files.
    if (this.watcher) {
        this.watcher.close();
        this.watcher = null;
        console.log("[DevServer] File watcher closed.");
    }

    // Close WebSocket connections so they cannot keep Node running.
    if (this.wss) {
        for (const client of this.wss.clients) {
            client.terminate();
        }

        await new Promise(resolve => {
            this.wss.close(() => {
                console.log("[DevServer] WebSocket server closed.");
                resolve();
            });
        });

        this.wss = null;
    }

    // Close the HTTP server.
    if (this.server) {
        const server = this.server;

        await new Promise(resolve => {
            if (!server.listening) {
                resolve();
                return;
            }

            server.close(() => {
                console.log("[DevServer] HTTP server closed.");
                resolve();
            });

            // Prevent idle keep-alive connections from delaying shutdown.
            server.closeAllConnections?.();
        });

        this.server = null;
    }

    console.log("[DevServer] Shutdown complete.");
}
}

module.exports = DevServer;
