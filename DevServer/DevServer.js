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
        this.server = null;
        this.wss = null;
        this.watcher = null;

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

            let safeUrl = req.url.split("?")[0];

            if (safeUrl === "/" && !this.folderListing && this.startPage) {
                res.writeHead(302, { Location: this.startPage });
                res.end();
                return;
            }

            let filePath;
            if (safeUrl === "/") {
                filePath = this.directory;
            } else {
                let safePath = path
                    .normalize(safeUrl)
                    .replace(/^(\.[\/\\])+/, "");
                filePath = path.join(this.directory, safePath);
            }

            if (!filePath.startsWith(this.directory)) {
                res.writeHead(403, { "Content-Type": "text/html" });
                res.end("<h1>403 Forbidden</h1>", "utf-8");
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
                        if (filename) {
                            this.wss.clients.forEach(client => {
                                if (client.readyState === 1)
                                    client.send("reload");
                            });
                        }
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

            files.forEach(file => {
                const isDir = file.isDirectory();
                const icon = isDir ? "📁" : "📄";
                const fileName = file.name;
                const fileUrl = path.join(reqUrl, fileName).replace(/\\/g, "/");
                html += `<li>${icon} <a href="${fileUrl}">${fileName}${isDir ? "/" : ""}</a></li>`;
            });

            html += `</ul></body></html>`;

            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(html, "utf-8");
        });
    }

    stop(callback) {
        if (this.watcher) this.watcher.close();
        if (this.wss) this.wss.close();
        if (this.server) {
            this.server.close(() => {
                console.log("[DevServer] Stopped.");
                this.server = null;
                if (callback) callback();
            });
        }
    }
}

module.exports = DevServer;
