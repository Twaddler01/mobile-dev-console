import Tool from "./Tool.js";
import { h, button, formatBytes, copyToClipboard } from "./dom.js";

const MAX_REQUESTS = 200;
const TEXT_TYPE = /json|text|xml|javascript|html|css|svg|x-www-form/i;

// Records fetch() and XMLHttpRequest traffic. Hooks are installed in the
// constructor so requests made by the application are captured too.

export default class NetworkTool extends Tool {
    static id = "network";
    static label = "NETWORK";
    static canClear = true;

    constructor(host) {
        super(host);

        this.requests = [];
        this.nextId = 1;

        this.hookFetch();
        this.hookXhr();
    }

    // ==========================================
    // CAPTURE
    // ==========================================

    begin(method, url, kind, requestHeaders) {
        const absolute = (() => {
            try {
                return new URL(url, location.href).href;
            } catch {
                return String(url);
            }
        })();

        const entry = {
            id: this.nextId++,
            kind,
            method: String(method || "GET").toUpperCase(),
            url: absolute,
            status: 0,
            statusText: "",
            pending: true,
            failed: false,
            start: performance.now(),
            duration: 0,
            size: NaN,
            requestHeaders: requestHeaders || {},
            responseHeaders: {},
            contentType: "",
            body: null,
            error: ""
        };

        this.requests.push(entry);

        if (this.requests.length > MAX_REQUESTS) {
            this.requests.shift();
        }

        this.changed();

        return entry;
    }

    finish(entry) {
        entry.pending = false;
        entry.duration = performance.now() - entry.start;
        this.changed();
    }

    hookFetch() {
        if (typeof window.fetch !== "function" || window.fetch.__devConsole) {
            return;
        }

        const original = window.fetch.bind(window);
        const tool = this;

        const wrapped = async function (input, init) {
            const isRequest = typeof Request !== "undefined" && input instanceof Request;

            const method = init?.method || (isRequest ? input.method : "GET");
            const url = isRequest ? input.url : String(input);

            const headers = {};

            try {
                new Headers(init?.headers || (isRequest ? input.headers : {}))
                    .forEach((value, key) => { headers[key] = value; });
            } catch {
                // Ignore unreadable header shapes.
            }

            const entry = tool.begin(method, url, "fetch", headers);

            try {
                const response = await original(input, init);

                entry.status = response.status;
                entry.statusText = response.statusText;
                entry.contentType = response.headers.get("content-type") || "";
                entry.size = Number(response.headers.get("content-length"));

                response.headers.forEach((value, key) => {
                    entry.responseHeaders[key] = value;
                });

                // Clone now, read lazily when the row is expanded.
                try {
                    entry.clone = response.clone();
                } catch {
                    entry.clone = null;
                }

                tool.finish(entry);

                return response;
            } catch (error) {
                entry.failed = true;
                entry.error = error?.message || String(error);
                tool.finish(entry);

                throw error;
            }
        };

        wrapped.__devConsole = true;
        window.fetch = wrapped;
    }

    hookXhr() {
        const proto = window.XMLHttpRequest?.prototype;

        if (!proto || proto.open.__devConsole) {
            return;
        }

        const tool = this;
        const open = proto.open;
        const send = proto.send;
        const setHeader = proto.setRequestHeader;

        proto.open = function (method, url, ...rest) {
            this.__dc = tool.begin(method, url, "xhr", {});
            this.__dc.pending = false; // Becomes pending on send().

            return open.call(this, method, url, ...rest);
        };

        proto.open.__devConsole = true;

        proto.setRequestHeader = function (name, value) {
            if (this.__dc) {
                this.__dc.requestHeaders[name] = value;
            }

            return setHeader.call(this, name, value);
        };

        proto.send = function (body) {
            const entry = this.__dc;

            if (entry) {
                entry.pending = true;
                entry.start = performance.now();

                this.addEventListener("loadend", () => {
                    entry.status = this.status;
                    entry.statusText = this.statusText;
                    entry.failed = this.status === 0;
                    entry.error = entry.failed ? "Network error / aborted" : "";
                    entry.contentType = this.getResponseHeader("content-type") || "";
                    entry.size = Number(this.getResponseHeader("content-length"));

                    (this.getAllResponseHeaders() || "")
                        .trim()
                        .split(/\r?\n/)
                        .filter(Boolean)
                        .forEach(line => {
                            const index = line.indexOf(":");

                            entry.responseHeaders[line.slice(0, index).trim()] =
                                line.slice(index + 1).trim();
                        });

                    if (this.responseType === "" || this.responseType === "text") {
                        entry.body = this.responseText;

                        if (!Number.isFinite(entry.size)) {
                            entry.size = entry.body.length;
                        }
                    }

                    tool.finish(entry);
                });
            }

            return send.call(this, body);
        };
    }

    // ==========================================
    // UI
    // ==========================================

    build() {
        this.summary = h("span", { class: "dc-summary" });

        const toolbar = h("div", { class: "dc-toolbar" },
            this.summary,
            button("Copy all", () => this.copyAll())
        );

        this.list = h("div", { class: "dc-list" });
        this.layout(toolbar, this.list);

        this.render();
    }

    changed() {
        if (!this.panel || this.queued) {
            return;
        }

        this.queued = requestAnimationFrame(() => {
            this.queued = 0;
            this.render();
        });

        const failed = this.requests.filter(r => r.failed || r.status >= 400).length;

        this.host.setBadge("network", failed, "error");
    }

    clear() {
        this.requests = [];
        this.host.setBadge("network", 0);
        this.render();
    }

    onShow() {
        this.render();
    }

    render() {
        if (!this.list) {
            return;
        }

        const open = new Set(
            [...this.list.querySelectorAll(".dc-row.open")].map(row => row.dataset.id)
        );

        const failed = this.requests.filter(r => r.failed || r.status >= 400).length;

        this.summary.textContent =
            `${this.requests.length} requests` + (failed ? ` · ${failed} failed` : "");

        if (this.requests.length === 0) {
            this.list.replaceChildren(
                h("p", { class: "dc-hint", text: "No fetch / XHR requests yet. Script and image loads are not listed." })
            );

            return;
        }

        this.list.replaceChildren(
            ...[...this.requests].reverse().map(entry => this.row(entry, open.has(String(entry.id))))
        );
    }

    row(entry, isOpen) {
        const bad = entry.failed || entry.status >= 400;

        const statusText = entry.pending
            ? "…"
            : entry.failed
                ? "ERR"
                : String(entry.status);

        const path = (() => {
            try {
                const url = new URL(entry.url);

                return url.pathname + url.search;
            } catch {
                return entry.url;
            }
        })();

        const row = h("div", {
            class: "dc-row" + (isOpen ? " open" : "") + (bad ? " bad" : ""),
            dataset: { id: entry.id }
        });

        const head = h("div", {
            class: "dc-row-head",
            onclick: () => {
                row.classList.toggle("open");

                if (row.classList.contains("open")) {
                    this.fillDetails(entry, details);
                }
            }
        },
            h("span", { class: "dc-method", text: entry.method }),
            h("span", { class: "dc-status" + (bad ? " bad" : ""), text: statusText }),
            h("span", { class: "dc-url", text: path }),
            h("span", { class: "dc-meta", text: entry.pending ? "" : `${Math.round(entry.duration)} ms` })
        );

        const details = h("div", { class: "dc-row-details" });

        row.append(head, details);

        if (isOpen) {
            this.fillDetails(entry, details);
        }

        return row;
    }

    async fillDetails(entry, container) {
        const headerTable = headers =>
            Object.keys(headers).length
                ? h("table", { class: "dc-kv" },
                    ...Object.entries(headers).map(([key, value]) =>
                        h("tr", {}, h("th", { text: key }), h("td", { text: value }))
                    ))
                : h("p", { class: "dc-hint", text: "(none)" });

        const body = h("pre", { class: "dc-pre", text: "Loading…" });

        container.replaceChildren(
            h("div", { class: "dc-kvline" }, h("b", { text: "URL " }), entry.url),
            h("div", { class: "dc-kvline" },
                h("b", { text: "Status " }),
                entry.failed
                    ? entry.error
                    : `${entry.status} ${entry.statusText} · ${entry.contentType || "unknown type"} · ${formatBytes(entry.size)}`
            ),
            h("h4", { text: "Request headers" }),
            headerTable(entry.requestHeaders),
            h("h4", { text: "Response headers" }),
            headerTable(entry.responseHeaders),
            h("h4", { text: "Response" }),
            body
        );

        body.textContent = await this.readBody(entry);
    }

    async readBody(entry) {
        if (entry.failed) {
            return entry.error;
        }

        if (entry.body === null && entry.clone) {
            if (entry.contentType && !TEXT_TYPE.test(entry.contentType)) {
                entry.body = `(${entry.contentType || "binary"} not shown)`;
            } else {
                try {
                    entry.body = await entry.clone.text();
                } catch (error) {
                    entry.body = `(could not read body: ${error.message})`;
                }
            }
        }

        const text = entry.body ?? "(no body captured)";

        if (/json/i.test(entry.contentType)) {
            try {
                return this.limit(JSON.stringify(JSON.parse(text), null, 2));
            } catch {
                // Not valid JSON: fall through.
            }
        }

        return this.limit(text);
    }

    limit(text) {
        return text.length > 20000 ? text.slice(0, 20000) + "\n… (truncated)" : text;
    }

    async copyAll() {
        const text = this.requests
            .map(r =>
                `${r.method} ${r.url} → ${r.failed ? "FAILED " + r.error : r.status} (${Math.round(r.duration)} ms)`
            )
            .join("\n");

        await copyToClipboard(text);
    }
}
