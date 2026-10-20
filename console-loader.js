const CONSOLE_SOURCE = "mobile-dev-console";

const frameUrl = new URL("./console-frame.html", import.meta.url);
const targetOrigin = frameUrl.origin === "null" ? "*" : frameUrl.origin;

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
    let destroyed = false;
    let nextRequestId = 0;

    const queue = [];
    const suites = new Map();
    const pendingRegistryRequests = new Map();

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

    const originalConsole = {};

    function postToFrame(message) {
        if (destroyed) return;

        const payload = {
            source: CONSOLE_SOURCE,
            ...message
        };

        if (!ready) {
            queue.push(payload);
            return;
        }

        frame.contentWindow?.postMessage(payload, targetOrigin);
    }

    function flushQueue() {
        while (queue.length && ready && !destroyed) {
            frame.contentWindow?.postMessage(queue.shift(), targetOrigin);
        }
    }

    function send(method, args = []) {
        postToFrame({
            type: "console-call",
            method,
            args: args.map(serialize)
        });
    }

    function makeRequestId(prefix) {
        nextRequestId += 1;
        return `${prefix}-${nextRequestId}`;
    }

    function validateSuite(definition) {
        if (!definition || typeof definition !== "object") {
            throw new TypeError("registerSuite() expects a suite object.");
        }

        if (typeof definition.id !== "string" || !definition.id.trim()) {
            throw new TypeError("Suite id must be a non-empty string.");
        }

        if (typeof definition.name !== "string" || !definition.name.trim()) {
            throw new TypeError("Suite name must be a non-empty string.");
        }

        if (!Array.isArray(definition.actions)) {
            throw new TypeError("Suite actions must be an array.");
        }

        const actionIds = new Set();

        for (const action of definition.actions) {
            if (!action || typeof action.id !== "string" || !action.id.trim()) {
                throw new TypeError("Every action needs a non-empty id.");
            }

            if (actionIds.has(action.id)) {
                throw new Error(
                    `Duplicate action id "${action.id}" in suite "${definition.id}".`
                );
            }

            actionIds.add(action.id);

            if (typeof action.label !== "string" || !action.label.trim()) {
                throw new TypeError(`Action "${action.id}" needs a label.`);
            }

            if (typeof action.run !== "function") {
                throw new TypeError(
                    `Action "${action.id}" needs a run() function.`
                );
            }
        }
    }

    function getSuiteMetadata(suite) {
        return {
            id: suite.id,
            name: suite.name,
            description: suite.description ?? "",
            actions: suite.actions.map(action => ({
                id: action.id,
                label: action.label,
                description: action.description ?? ""
            }))
        };
    }

    function registerSuite(definition) {
        validateSuite(definition);

        if (suites.has(definition.id)) {
            throw new Error(`Suite "${definition.id}" is already registered.`);
        }

        // Keep callbacks in the host page. Never try to transfer functions
        // through postMessage.
        const suite = {
            id: definition.id,
            name: definition.name,
            description: definition.description ?? "",
            actions: definition.actions.map(action => ({
                id: action.id,
                label: action.label,
                description: action.description ?? "",
                run: action.run
            }))
        };

        suites.set(suite.id, suite);

        postToFrame({
            type: "suite-register",
            suite: getSuiteMetadata(suite)
        });

        // Matches the familiar TestRegistry disposer pattern.
        return () => unregisterSuite(suite.id);
    }

    function unregisterSuite(id) {
        if (!suites.has(id)) {
            return false;
        }

        suites.delete(id);

        postToFrame({
            type: "suite-unregister",
            suiteId: id
        });

        return true;
    }

    function getSuites() {
        return new Promise((resolve, reject) => {
            if (destroyed) {
                reject(new Error("Developer console has been destroyed."));
                return;
            }

            const requestId = makeRequestId("registry");

            pendingRegistryRequests.set(requestId, {
                resolve,
                reject
            });

            postToFrame({
                type: "registry-get-suites",
                requestId
            });
        });
    }

    async function runHostAction(message) {
        const { requestId, suiteId, actionId } = message;

        const suite = suites.get(suiteId);
        const action = suite?.actions.find(item => item.id === actionId);

        if (!suite || !action) {
            postToFrame({
                type: "action-result",
                requestId,
                ok: false,
                error: {
                    name: "Error",
                    message: `Action "${suiteId}/${actionId}" is not registered.`
                }
            });
            return;
        }

        try {
            const result = await action.run({
                console: window.devConsole,
                suite: {
                    id: suite.id,
                    name: suite.name
                },
                action: {
                    id: action.id,
                    label: action.label
                }
            });

            postToFrame({
                type: "action-result",
                requestId,
                ok: true,
                resultUndefined: result === undefined,
                result: serialize(result)
            });
        } catch (error) {
            postToFrame({
                type: "action-result",
                requestId,
                ok: false,
                error: serialize(error)
            });
        }
    }

    function onMessage(event) {
        if (event.source !== frame.contentWindow) return;
        if (event.data?.source !== CONSOLE_SOURCE) return;

        const data = event.data;

        if (data.type === "console-ready") {
            ready = true;
            flushQueue();

            postToFrame({
                type: "console-parent-connected"
            });

            return;
        }

        if (data.type === "console-init-error") {
            send("error", ["[Console Initialization Failed]", data.message]);
            return;
        }

        if (data.type === "console-action-request") {
            void runHostAction(data);
            return;
        }

        if (data.type === "registry-suites-result") {
            const pending = pendingRegistryRequests.get(data.requestId);
            if (!pending) return;

            pendingRegistryRequests.delete(data.requestId);

            if (data.ok) {
                pending.resolve(data.suites);
            } else {
                pending.reject(
                    new Error(data.error?.message || "Could not read suites.")
                );
            }

            return;
        }

        if (data.type === "suite-registration-error") {
            send("error", ["[TESTS] Suite registration failed:", data.message]);
        }
    }

    window.addEventListener("message", onMessage);

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
        send("error", ["Unhandled promise rejection:", event.reason]);
    }

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    // Preserve native console output while forwarding it to the iframe.
    for (const method of methods) {
        originalConsole[method] = console[method].bind(console);

        console[method] = (...args) => {
            send(method, args);
            originalConsole[method](...args);
        };
    }

    const devConsole = {
        log: (...args) => send("log", args),
        info: (...args) => send("info", args),
        debug: (...args) => send("debug", args),
        warn: (...args) => send("warn", args),
        error: (...args) => send("error", args),
        group: (...args) => send("group", args),
        groupCollapsed: (...args) => send("groupCollapsed", args),
        groupEnd: () => send("groupEnd"),
        table: data => send("table", [data]),
        clear: () => send("clear"),
        frame,

        tests: {
            registerSuite,
            unregisterSuite,
            getSuites
        }
    };

    window.devConsole = devConsole;

    document.body.appendChild(frame);

    const api = {
        frame,
        devConsole,

        destroy() {
            if (destroyed) return;
            destroyed = true;

            window.removeEventListener("message", onMessage);
            window.removeEventListener("error", onError, true);
            window.removeEventListener(
                "unhandledrejection",
                onUnhandledRejection
            );

            for (const method of methods) {
                console[method] = originalConsole[method];
            }

            for (const pending of pendingRegistryRequests.values()) {
                pending.reject(
                    new Error("Developer console has been destroyed.")
                );
            }

            pendingRegistryRequests.clear();
            suites.clear();
            queue.length = 0;

            frame.remove();

            if (window.__mobileDevConsoleLoader === api) {
                delete window.__mobileDevConsoleLoader;
            }

            if (window.devConsole === devConsole) {
                delete window.devConsole;
            }
        }
    };

    window.__mobileDevConsoleLoader = api;

    return api;
}

installConsoleLoader();
