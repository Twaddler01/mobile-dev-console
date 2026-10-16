
const CONSOLE_SOURCE = "mobile-dev-console";

const frameUrl = new URL("./console-frame.html", import.meta.url);

function serialize(value) {
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack
        };
    }

    if (typeof value === "function") {
        return `[Function: ${value.name || "anonymous"}]`;
    }

    if (typeof value === "bigint") {
        return `${value}n`;
    }

    if (value === undefined) {
        return "[undefined]";
    }

    try {
        // Ensure the value can cross the iframe boundary.
        return structuredClone(value);
    } catch {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            return String(value);
        }
    }
}

function installConsoleLoader() {
    // Avoid installing the bridge twice.
    if (window.__mobileDevConsoleLoader) {
        return window.__mobileDevConsoleLoader;
    }

    const frame = document.createElement("iframe");

    frame.title = "Developer Console";
    frame.src = frameUrl.href;

    Object.assign(frame.style, {
        display: "block",
        width: "100%",
        height: "60vh",
        border: "0",
        flex: "0 0 auto"
    });

    frame.setAttribute("loading", "eager");

    let ready = false;
    const queue = [];

    function send(method, args = []) {
        const message = {
            source: CONSOLE_SOURCE,
            type: "console-call",
            method,
            args: args.map(serialize)
        };

        if (!ready) {
            queue.push(message);
            return;
        }

        frame.contentWindow?.postMessage(message, location.origin);
    }

    function flushQueue() {
        while (queue.length) {
            frame.contentWindow?.postMessage(
                queue.shift(),
                location.origin
            );
        }
    }

    function onMessage(event) {
        if (
            event.source !== frame.contentWindow ||
            event.origin !== location.origin ||
            event.data?.source !== CONSOLE_SOURCE
        ) {
            return;
        }

        if (event.data.type === "console-ready") {
            ready = true;
            flushQueue();
        }

        if (event.data.type === "console-init-error") {
            console.error(
                "[mobile-dev-console] Failed to initialize:",
                event.data.message
            );
        }
    }

    window.addEventListener("message", onMessage);

    // Capture page-level JavaScript errors.
    function onError(event) {
        send("error", [
            event.error || {
                message: event.message,
                filename: event.filename,
                line: event.lineno,
                column: event.colno
            }
        ]);
    }

    function onUnhandledRejection(event) {
        send("error", [
            "Unhandled promise rejection:",
            event.reason
        ]);
    }

    window.addEventListener("error", onError, true);
    window.addEventListener(
        "unhandledrejection",
        onUnhandledRejection
    );

    // Forward page console output.
    const originalConsole = {};
    const methods = [
        "log",
        "info",
        "debug",
        "warn",
        "error",
        "group",
        "groupCollapsed",
        "groupEnd",
        "table",
        "clear"
    ];

    for (const method of methods) {
        originalConsole[method] =
            console[method].bind(console);

        console[method] = (...args) => {
            send(method, args);
        };
    }

    // Append after the example's existing content.
    document.body.appendChild(frame);

    const api = {
        frame,

        destroy() {
            window.removeEventListener("message", onMessage);
            window.removeEventListener("error", onError, true);
            window.removeEventListener(
                "unhandledrejection",
                onUnhandledRejection
            );

            for (const method of methods) {
                console[method] = originalConsole[method];
            }

            frame.remove();
            delete window.__mobileDevConsoleLoader;
            delete window.devConsole;
        }
    };

    // A small parent-page API for basic console operations.
    window.devConsole = {
        log: (...args) => send("log", args),
        info: (...args) => send("info", args),
        debug: (...args) => send("debug", args),
        warn: (...args) => send("warn", args),
        error: (...args) => send("error", args),
        group: (...args) => send("group", args),
        groupCollapsed: (...args) =>
            send("groupCollapsed", args),
        groupEnd: () => send("groupEnd"),
        table: data => send("table", [data]),
        clear: () => send("clear"),
        frame
    };

    window.__mobileDevConsoleLoader = api;

    return api;
}

installConsoleLoader();
