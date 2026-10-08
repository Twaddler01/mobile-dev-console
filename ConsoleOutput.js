export default class ConsoleOutput {
    constructor(container) {
        this.container = container;
        this.groupStack = [];
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

        const rows = entries.map(([key, value]) => {
            let rendered;

            try {
                rendered =
                    value !== null && typeof value === "object"
                        ? JSON.stringify(value, null, 2)
                        : String(value);
            } catch {
                rendered = "[unreadable]";
            }

            const row = document.createElement("tr");
            const keyCell = document.createElement("td");
            const valueCell = document.createElement("td");

            keyCell.textContent = key;
            valueCell.textContent = rendered;

            row.append(keyCell, valueCell);

            return row;
        });

        const table = document.createElement("table");
        const body = document.createElement("tbody");

        body.append(...rows);
        table.appendChild(body);

        const wrapper = document.createElement("div");
        wrapper.className = "table";

        // Plain-text representation, independent of the UI.
        wrapper.dataset.copyText = entries
            .map(([key, value]) => {
                return `${key}: ${this.toPlainText(value)}`;
            })
            .join("\n");

        wrapper.dataset.copySource = this.getSourceLocation() ?? "";

        wrapper.appendChild(table);

        wrapper.appendChild(
            this.createCopyButton(() => wrapper.dataset.copyText)
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
        const source = this.getSourceLocation();

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

    getSourceLocation() {
        const stack = new Error().stack;

        if (!stack) {
            return null;
        }

        const frames = stack.split("\n").slice(1);

        for (const frame of frames) {
            if (
                frame.includes("ConsoleOutput.js") ||
                frame.includes("Console.js")
            ) {
                continue;
            }

            // Chrome / Chromium / Android WebView:
            // at functionName (https://site/file.js:12:5)
            // at https://site/file.js:12:5
            let match = frame.match(/(?:\(|at\s+)(.*?):(\d+):(\d+)\)?$/);

            // Firefox-style stack:
            // functionName@https://site/file.js:12:5
            if (!match) {
                match = frame.match(/@(.*?):(\d+):(\d+)$/);
            }

            if (!match) {
                continue;
            }

            const file = match[1].split("/").pop();

            const line = match[2];

            return `${file}:${line}`;
        }

        return null;
    }
}
