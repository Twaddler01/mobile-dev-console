export default class ConsoleOutput {
    constructor(container, options = {}) {
        this.container = container;
        this.groupStack = [];

        this.options = {
            showCopyButtons: false,
            ...options
        };
    }

    // ==========================================
    // PUBLIC LOG METHODS
    // ==========================================

    log(...items) {
        this.render("log", items);
    }

    warn(...items) {
        this.render("warn", items);
    }

    error(...items) {
        if (items.length === 1 && items[0] instanceof Error) {
            this.renderError(items[0]);
            return;
        }

        this.render("error", items);
    }

    group(...items) {
        this.createGroup(false, items);
    }

    groupCollapsed(...items) {
        this.createGroup(true, items);
    }

    groupEnd() {
        if (this.groupStack.length === 0) {
            return;
        }

        this.groupStack.pop();
    }

    clear() {
        this.container.replaceChildren();
        this.groupStack = [];
    }

    // ==========================================
    // GROUPS
    // ==========================================

    createGroup(collapsed, items) {
        const renderedItems = items.map(item => this.format(item));

        const group = document.createElement("div");
        group.className = "group";

        const source = this.getSourceLocation();
        group.dataset.copySource = source ?? "";

        if (collapsed) {
            group.classList.add("collapsed");
        }

        const header = document.createElement("div");
        header.className = "group-header";

        const arrow = document.createElement("span");
        arrow.className = "group-arrow";
        arrow.textContent = collapsed ? "▶" : "▼";

        const label = document.createElement("span");
        label.className = "group-label";
        label.innerHTML = renderedItems.join(" ");

        header.append(arrow, label);

        header.appendChild(
            this.createCopyButton(() => this.getCopyText(group))
        );

        const content = document.createElement("div");
        content.className = "group-content";

        group.append(header, content);

        header.addEventListener("click", event => {
            if (event.target.closest(".console-copy")) {
                return;
            }

            const isCollapsed = group.classList.toggle("collapsed");
            arrow.textContent = isCollapsed ? "▶" : "▼";
        });

        this.append(group);

        this.groupStack.push({
            group,
            content
        });
    }

    append(element) {
        if (this.groupStack.length > 0) {
            const currentGroup = this.groupStack[this.groupStack.length - 1];

            currentGroup.content.appendChild(element);
            return;
        }

        this.container.appendChild(element);
    }

    // ==========================================
    // TABLE
    // ==========================================

    table(data) {
        if (!data || typeof data !== "object") {
            this.log(data);
            return;
        }

        const entries = Object.entries(data);

        if (entries.length === 0) {
            this.log("(empty table)");
            return;
        }

        // Convert each entry into a row with a consistent shape.
        const rows = entries.map(([index, value]) => {
            if (value !== null && typeof value === "object") {
                const cells = {};

                for (const key of Object.keys(value)) {
                    try {
                        cells[key] = value[key];
                    } catch {
                        cells[key] = "[unreadable]";
                    }
                }

                return { index, cells };
            }

            return {
                index,
                cells: { Value: value }
            };
        });

        // Collect all columns across every row.
        const columns = [];

        for (const row of rows) {
            for (const key of Object.keys(row.cells)) {
                if (!columns.includes(key)) {
                    columns.push(key);
                }
            }
        }

        const table = document.createElement("table");

        // --------------------------------------
        // HEADER
        // --------------------------------------

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");

        const indexHeader = document.createElement("th");
        indexHeader.textContent = "(index)";
        headerRow.appendChild(indexHeader);

        for (const column of columns) {
            const th = document.createElement("th");
            th.textContent = column;
            headerRow.appendChild(th);
        }

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // --------------------------------------
        // BODY
        // --------------------------------------

        const tbody = document.createElement("tbody");

        for (const row of rows) {
            const tr = document.createElement("tr");

            const indexCell = document.createElement("td");
            indexCell.textContent = row.index;
            tr.appendChild(indexCell);

            for (const column of columns) {
                const td = document.createElement("td");
                const value = row.cells[column];

                td.textContent =
                    value === undefined && !(column in row.cells)
                        ? ""
                        : this.toPlainText(value);

                tr.appendChild(td);
            }

            tbody.appendChild(tr);
        }

        table.appendChild(tbody);

        // --------------------------------------
        // WRAPPER AND COPY TEXT
        // --------------------------------------

        const wrapper = document.createElement("div");
        wrapper.className = "table";

        wrapper.dataset.copyText = [
            ["(index)", ...columns].join("\t"),
            ...rows.map(row =>
                [
                    row.index,
                    ...columns.map(column =>
                        column in row.cells
                            ? this.toPlainText(row.cells[column])
                            : ""
                    )
                ].join("\t")
            )
        ].join("\n");

        wrapper.dataset.copySource = this.getSourceLocation() ?? "";

        wrapper.appendChild(table);

        wrapper.appendChild(
            this.createCopyButton(() => this.getCopyText(wrapper))
        );

        this.append(wrapper);
    }

    // ==========================================
    // FORMATTING
    // ==========================================

    format(value) {
        if (value === null) {
            return "null";
        }

        if (value === undefined) {
            return "undefined";
        }

        if (value instanceof Error) {
            return this.htmlEncode(
                `${value.name}: ${value.message}\n${value.stack ?? ""}`
            );
        }

        if (typeof value === "string") {
            const visible =
                value.length > 5000 ? value.substring(0, 5000) + "..." : value;

            return this.htmlEncode(visible);
        }

        if (typeof value === "function") {
            return this.htmlEncode(value.toString());
        }

        if (typeof value === "object") {
            try {
                const visibleObject = !Array.isArray(value)
                    ? this.unhideProperties(value)
                    : value;

                const result = JSON.stringify(visibleObject, null, 2);

                return this.htmlEncode(
                    result === undefined ? String(value) : result
                );
            } catch (error) {
                return this.htmlEncode(`[Object: ${error.message}]`);
            }
        }

        return this.htmlEncode(String(value));
    }

    unhideProperties(obj) {
        const result = {};

        for (const key in obj) {
            try {
                result[key] = obj[key];
            } catch {
                result[key] = "[unreadable]";
            }
        }

        return result;
    }

    htmlEncode(value) {
        const element = document.createElement("div");

        element.textContent = String(value);

        return element.innerHTML;
    }

    // ==========================================
    // RENDER
    // ==========================================

    render(type, items, prefix) {
        const renderedItems = items.map(item => this.format(item));
        const plainText = items.map(item => this.toPlainText(item)).join(" ");
        const source = this.getSourceLocation();

        const entry = document.createElement("div");
        entry.className = type;

        // Store clean text and source separately.
        entry.dataset.copyText = prefix ? `${prefix}\n${plainText}` : plainText;

        entry.dataset.copySource = source ?? "";

        if (prefix) {
            const prefixElement = document.createElement("span");

            prefixElement.className = "prefix";
            prefixElement.textContent = prefix;

            entry.appendChild(prefixElement);
            entry.appendChild(document.createTextNode("\n"));
        }

        // Formatted values are HTML-encoded by format().
        const content = document.createElement("span");
        content.innerHTML = renderedItems.join(" ");

        entry.appendChild(content);

        entry.appendChild(this.createCopyButton(() => this.getCopyText(entry)));

        this.append(entry);
    }

    // ==========================================
    // ERROR DETAILS
    // ==========================================

    renderError(error) {
        const source = this.getSourceLocation(error);

        const message = `${error.name}: ${error.message}`;

        const trace = error.stack || message;

        const entry = document.createElement("div");
        entry.className = "error error-entry";

        entry.dataset.copyText = message;
        entry.dataset.copySource = source ?? "";

        // --------------------------------------
        // SUMMARY
        // --------------------------------------

        const header = document.createElement("div");
        header.className = "error-summary";

        const arrow = document.createElement("span");
        arrow.className = "error-arrow";
        arrow.textContent = "▶";

        const label = document.createElement("span");
        label.className = "error-message";
        label.textContent = message;

        const sourceLabel = document.createElement("span");
        sourceLabel.className = "error-source";
        sourceLabel.textContent = source ?? "";

        header.append(arrow, label, sourceLabel);

        header.appendChild(
            this.createCopyButton(() => this.getCopyText(entry))
        );

        // --------------------------------------
        // COLLAPSIBLE TRACE
        // --------------------------------------

        const details = document.createElement("div");
        details.className = "error-trace";
        details.hidden = true;

        const traceText = document.createElement("pre");
        traceText.className = "error-trace-text";
        traceText.textContent = trace;

        details.appendChild(traceText);

        details.appendChild(this.createCopyButton(() => trace));

        // --------------------------------------
        // TOGGLE
        // --------------------------------------

        header.addEventListener("click", event => {
            if (event.target.closest(".console-copy")) {
                return;
            }

            details.hidden = !details.hidden;

            entry.classList.toggle("expanded", !details.hidden);

            arrow.textContent = details.hidden ? "▶" : "▼";
        });

        entry.append(header, details);

        this.append(entry);
    }

    async copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (error) {
            this.error("Failed to copy:", error);
        }
    }

    getCopyText(element, depth = 0) {
        const indent = "    ".repeat(depth);

        // Individual logs, warnings, errors, and tables.
        if (element.dataset.copyText !== undefined) {
            const lines = element.dataset.copyText.split("\n");

            const source = element.dataset.copySource;

            if (source && lines.length > 0) {
                lines[0] += ` [${source}]`;
            }

            return lines.map(line => indent + line).join("\n");
        }

        // Groups include their heading and all descendants.
        if (element.classList.contains("group")) {
            const label = element.querySelector(
                ":scope > .group-header .group-label"
            );

            const content = element.querySelector(":scope > .group-content");

            const lines = [];

            if (label?.textContent) {
                const source = element.dataset.copySource;

                const heading = source
                    ? `${label.textContent} [${source}]`
                    : label.textContent;

                lines.push(indent + heading);
            }

            if (content) {
                for (const child of content.children) {
                    const text = this.getCopyText(child, depth + 1);

                    if (text) {
                        lines.push(text);
                    }
                }
            }

            return lines.join("\n");
        }

        // Fallback for other containers.
        return Array.from(element.children)
            .map(child => this.getCopyText(child, depth))
            .filter(Boolean)
            .join("\n");
    }

    toPlainText(value) {
        if (value === null) {
            return "null";
        }

        if (value === undefined) {
            return "undefined";
        }

        if (value instanceof Error) {
            return `${value.name}: ${value.message}\n${value.stack ?? ""}`;
        }

        if (typeof value === "string") {
            return value;
        }

        if (typeof value === "function") {
            return value.toString();
        }

        if (typeof value === "object") {
            try {
                return JSON.stringify(value, null, 2) ?? String(value);
            } catch {
                return "[Unserializable object]";
            }
        }

        return String(value);
    }

    createCopyButton(getText) {
        if (!this.options.showCopyButtons) {
            return document.createDocumentFragment();
        }

        const button = document.createElement("button");

        button.className = "console-copy";
        button.textContent = "Copy";
        button.type = "button";

        button.addEventListener("click", async event => {
            event.stopPropagation();
            await this.copyText(getText());
        });

        return button;
    }

    getSourceLocation(error = null) {
        const stack = error?.stack || new Error().stack;

        if (!stack) {
            return null;
        }

        const internalFiles = [
            "ConsoleOutput.js",
            "Console.js",
            "errorBootstrap.js"
        ];

        const frames = stack.split("\n").slice(1);

        for (const rawFrame of frames) {
            const frame = rawFrame.trim();

            let functionName = "";
            let url = "";
            let line = "";
            let column = "";

            // Chrome / Chromium / Android WebView:
            // at createLoopTest (http://localhost/file.js:471:9)
            let match = frame.match(/^at\s+(.+?)\s+\((.+):(\d+):(\d+)\)$/);

            if (match) {
                functionName = match[1];
                url = match[2];
                line = match[3];
                column = match[4];
            } else {
                // Chrome anonymous or direct URL frame:
                // at http://localhost/file.js:471:9
                match = frame.match(/^at\s+(.+):(\d+):(\d+)$/);

                if (match) {
                    url = match[1];
                    line = match[2];
                    column = match[3];
                } else {
                    // Firefox:
                    // createLoopTest@http://localhost/file.js:471:9
                    match = frame.match(/^(.*?)@(.+):(\d+):(\d+)$/);

                    if (!match) {
                        continue;
                    }

                    functionName = match[1];
                    url = match[2];
                    line = match[3];
                    column = match[4];
                }
            }

            // Ignore frames belonging to the console infrastructure.
            if (internalFiles.some(file => url.includes(file))) {
                continue;
            }

            // Preserve the original URL and useful source coordinates.
            const location = `${url}:${line}:${column}`;

            return functionName ? `${functionName}@${location}` : location;
        }

        return null;
    }
}
