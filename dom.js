// Tiny DOM helpers shared by every tool panel.

export function h(tag, props = {}, ...children) {
    const element = document.createElement(tag);

    for (const [key, value] of Object.entries(props || {})) {
        if (value === null || value === undefined || value === false) {
            continue;
        }

        if (key === "class") {
            element.className = value;
        } else if (key === "text") {
            element.textContent = value;
        } else if (key === "dataset") {
            Object.assign(element.dataset, value);
        } else if (key.startsWith("on") && typeof value === "function") {
            element.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key in element && key !== "list") {
            try {
                element[key] = value;
            } catch {
                element.setAttribute(key, value);
            }
        } else {
            element.setAttribute(key, value === true ? "" : value);
        }
    }

    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) {
            continue;
        }

        element.append(child.nodeType ? child : document.createTextNode(String(child)));
    }

    return element;
}

export function button(label, onClick, className = "") {
    return h("button", {
        type: "button",
        class: `dc-btn ${className}`.trim(),
        text: label,
        onclick: onClick
    });
}

export function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) {
        return "?";
    }

    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Fallback for insecure contexts and older WebViews.
        const area = h("textarea", { value: text });

        Object.assign(area.style, { position: "fixed", opacity: "0" });
        document.body.appendChild(area);
        area.select();

        let ok = false;

        try {
            ok = document.execCommand("copy");
        } catch {
            ok = false;
        }

        area.remove();

        return ok;
    }
}

// Short CSS-like path for an element: div#id.class > ul > li:nth-child(2)
export function describeElement(element) {
    if (!element || !element.tagName) {
        return String(element);
    }

    let text = element.tagName.toLowerCase();

    if (element.id) {
        text += `#${element.id}`;
    }

    const classes =
        typeof element.className === "string"
            ? element.className.trim().split(/\s+/).filter(Boolean)
            : [];

    if (classes.length) {
        text += "." + classes.slice(0, 2).join(".");
    }

    return text;
}

export function isInsideConsole(node) {
    return Boolean(node?.closest?.("#consoleLog, #consoleOverlay"));
}
