import Console from "./Console.js";
import DOMInspectorHost from "./DOMInspectorHost.js";

const CONSOLE_SOURCE = "mobile-dev-console";

const consoleCssUrl = new URL("./console.css", import.meta.url).href;
const frameUrl = new URL("./console-frame.html", import.meta.url);

const targetOrigin = frameUrl.origin === "null" ? "*" : frameUrl.origin;

function ensureConsoleStyles() {
    if (document.querySelector("link[data-mobile-dev-console-styles]")) {
        return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = consoleCssUrl;
    link.dataset.mobileDevConsoleStyles = "";

    document.head.appendChild(link);
}

/**
 * Public entry point.
 *
 * Overlay: renders Console.js directly in this document.
 * Embedded: renders console-frame.html inside the supplied mount point.
 */

function resolveMountPoint(value) {
    const fallback = "#devtools";

    function resolve(value) {
        if (value instanceof Element) return value;

        if (typeof value !== "string" || !value.trim()) {
            return null;
        }

        try {
            return document.querySelector(value);
        } catch {
            return null;
        }
    }

    const mount = resolve(value) ?? resolve(fallback);

    if (!mount) {
        throw new TypeError(
            'No valid mount point found. Provide an element or create a "#devtools" element.'
        );
    }

    return mount;
}

function resolveHeight(value) {
    const fallback = "60dvh";

    if (
        typeof value === "string" &&
        value.trim() &&
        CSS.supports("height", value.trim())
    ) {
        return value.trim();
    }

    return fallback;
}

/**
 * Stable public controller. The active renderer can change without
 * changing the object returned by DevTools.mount().
 */
export function createConsoleHost(options = {}) {
    let mode = options.mode ?? "embedded";

    if (mode !== "embedded" && mode !== "overlay") {
        throw new TypeError('mode must be "embedded" or "overlay".');
    }

    const settings = {
        ...options,
        mode,
        mountPoint: resolveMountPoint(options.mountPoint),
        height: resolveHeight(options.height),
        captureConsole: options.captureConsole ?? true,
        mirrorToNative: options.mirrorToNative ?? mode === "embedded",
        showCopyButtons: options.showCopyButtons ?? false,
        allowDragOutsideBounds: options.allowDragOutsideBounds ?? true,
        logTestOutput: options.logTestOutput ?? true
    };

    let active = null;
    let destroyed = false;
    let switching = false;

    const suites = new Map();

    function mountCurrent() {
        const mountOptions = {
            ...settings,
            mode,
            onModeToggle: switchMode
        };

        active =
            mode === "embedded"
                ? createEmbeddedConsole(mountOptions)
                : createOverlayConsole(mountOptions);

        // Restore project test suites after a renderer change.
        for (const definition of suites.values()) {
            active.registerSuite(definition);
        }
    }

    function switchMode() {
        if (destroyed || switching) return;

        switching = true;

        try {
            const nextMode = mode === "embedded" ? "overlay" : "embedded";

            active?.destroy();
            active = null;
            mode = nextMode;
            settings.mode = nextMode;

            mountCurrent();
        } catch (error) {
            console.error("[DevTools] Could not switch modes:", error);
        } finally {
            switching = false;
        }
    }

    mountCurrent();

    return {
        get mode() {
            return mode;
        },

        get host() {
            return active?.host ?? null;
        },

        get frame() {
            return active?.frame ?? null;
        },

        get console() {
            return active?.console ?? active?.devConsole ?? null;
        },

        get devConsole() {
            return active?.devConsole ?? active?.console ?? null;
        },

        get tests() {
            return this.devConsole?.tests ?? null;
        },

        registerSuite(definition) {
            if (destroyed) {
                throw new Error("Developer console has been destroyed.");
            }

            if (suites.has(definition.id)) {
                throw new Error(
                    `Suite "${definition.id}" is already registered.`
                );
            }

            const unregisterActive = active.registerSuite(definition);
            suites.set(definition.id, definition);

            return () => {
                suites.delete(definition.id);
                return unregisterActive();
            };
        },

        unregisterSuite(id) {
            suites.delete(id);
            return active?.unregisterSuite(id) ?? false;
        },

        getSuites() {
            return active.getSuites();
        },

        destroy() {
            if (destroyed) return;
            destroyed = true;

            active?.destroy();
            active = null;
            suites.clear();
        }
    };
}

function createOverlayConsole({
    onModeToggle,
    captureConsole = true,
    mirrorToNative = false,
    showCopyButtons = false,
    allowDragOutsideBounds = true,
    logTestOutput = true
} = {}) {
    ensureConsoleStyles();

    const consoleElement = document.createElement("div");
    consoleElement.className = "mobile-dev-console-overlay";
    document.body.appendChild(consoleElement);

    const previousDevConsole = window.devConsole;

    let consoleInstance;
    let inspectorHost;

    const dispatchInspectorEvent = (event, payload = {}) => {
        window.dispatchEvent(
            new CustomEvent("devtools-inspect-event", {
                detail: { event, payload }
            })
        );
    };

    try {
        // Overlay mode runs in the application document, so inspection can
        // call the host directly instead of requiring the iframe message bridge.
        inspectorHost = new DOMInspectorHost({
            document,
            mountElement: consoleElement,
            onPick({ id, details }) {
                dispatchInspectorEvent("picked", { id, details });
            },
            onPickCancelled() {
                dispatchInspectorEvent("pick-cancelled");
            },
            onSelectionChange({ id, details }) {
                dispatchInspectorEvent("selection-changed", { id, details });
            }
        });

        consoleInstance = new Console({
            element: consoleElement,
            mode: "overlay",
            captureConsole,
            mirrorToNative,
            showCopyButtons,
            allowDragOutsideBounds,
            logTestOutput,
            inspectionBridge: inspectorHost
        });
    } catch (error) {
        inspectorHost?.destroy();
        consoleElement.remove();
        throw error;
    }

    const onModeToggleRequest = () => onModeToggle?.();

    consoleElement.addEventListener(
        "console-mode-toggle-request",
        onModeToggleRequest
    );

    let destroyed = false;

    const api = {
        mode: "overlay",
        host: consoleElement,
        frame: null,

        console: consoleInstance,
        devConsole: consoleInstance,

        tests: consoleInstance.tests,

        registerSuite(definition) {
            return consoleInstance.tests.registerSuite(definition);
        },

        unregisterSuite(id) {
            return consoleInstance.tests.unregisterSuite(id);
        },

        getSuites() {
            return consoleInstance.tests.getSuites();
        },

        destroy() {
            if (destroyed) return;
            destroyed = true;

            consoleElement.removeEventListener(
                "console-mode-toggle-request",
                onModeToggleRequest
            );

            consoleInstance.destroy();
            inspectorHost?.destroy();
            inspectorHost = null;
            consoleElement.remove();

            if (window.devConsole === consoleInstance) {
                if (previousDevConsole == null) {
                    delete window.devConsole;
                } else {
                    window.devConsole = previousDevConsole;
                }
            }
        }
    };

    return api;
}

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

function createEmbeddedConsole({
    onModeToggle,
    mountPoint,
    height = "60dvh",
    captureConsole = true,
    mirrorToNative = true,
    showCopyButtons = false,
    allowDragOutsideBounds = true,
    logTestOutput = true
} = {}) {
    const mount =
        typeof mountPoint === "string"
            ? document.querySelector(mountPoint)
            : mountPoint;

    if (!(mount instanceof Element)) {
        throw new TypeError(
            "Embedded mode requires mountPoint to be an element or selector."
        );
    }

    const host = document.createElement("div");
    host.className = "mobile-dev-console-host";

    Object.assign(host.style, {
        position: "relative",
        width: "100%",
        height,
        minHeight: "0",
        boxSizing: "border-box"
    });

    const frame = document.createElement("iframe");
    frame.title = "Developer Console";
    frame.src = frameUrl.href;

    Object.assign(frame.style, {
        display: "block",
        width: "100%",
        height: "100%",
        minHeight: "0",
        border: "0",
        flex: "0 0 auto",
        pointerEvents: "auto"
    });

    frame.setAttribute("loading", "eager");
    host.appendChild(frame);

    const onConsoleMessage = event => {
        if (event.source !== frame.contentWindow) return;
        if (event.origin !== frameUrl.origin) return;
        if (event.data?.source !== CONSOLE_SOURCE) return;

        if (event.data.type === "console-collapse-changed") {
            const collapsed = event.data.collapsed;
            host.style.height = collapsed ? "40px" : height;
        }
    };

    window.addEventListener("message", onConsoleMessage);

    let ready = false;
    let initialized = false;
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
    const installedWrappers = {};
    let devConsole;

    function postToFrame(message) {
        if (destroyed) return;

        const payload = {
            source: CONSOLE_SOURCE,
            ...message
        };

        if (!initialized) {
            queue.push(payload);
            return;
        }

        frame.contentWindow?.postMessage(payload, targetOrigin);
    }

    let inspectorHost = null;

    function sendInspectorEvent(event, payload = {}) {
        postToFrame({
            type: "inspect-event",
            event,
            payload
        });
    }

    inspectorHost = new DOMInspectorHost({
        document: window.document,
        mountElement: host,

        onPick({ id, details }) {
            sendInspectorEvent("picked", { id, details });
        },

        onPickCancelled() {
            sendInspectorEvent("pick-cancelled");
        },

        onSelectionChange({ id, details }) {
            sendInspectorEvent("selection-changed", {
                id,
                details
            });
        }
    });

    function handleInspectorRequest(message) {
        const { requestId, action, payload = {} } = message;

        try {
            let result;

            switch (action) {
                case "get-tree":
                    result = inspectorHost.getTree();
                    break;

                case "get-details":
                    result = inspectorHost.getDetails(payload.id);
                    break;

                case "select":
                    result = inspectorHost.select(payload.id);
                    break;

                case "clear-selection":
                    inspectorHost.clearSelection();
                    result = true;
                    break;

                case "start-picking":
                    inspectorHost.startPicking();
                    result = true;
                    break;

                case "cancel-picking":
                    inspectorHost.cancelPicking();
                    result = true;
                    break;

                default:
                    throw new Error(`Unknown inspector action: ${action}`);
            }

            postToFrame({
                type: "inspect-response",
                requestId,
                action,
                ok: true,
                result
            });
        } catch (error) {
            postToFrame({
                type: "inspect-response",
                requestId,
                action,
                ok: false,
                error: error?.message || String(error)
            });
        }
    }

    function flushQueue() {
        while (queue.length && initialized && !destroyed) {
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
                console: devConsole,
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
        if (event.origin !== frameUrl.origin) return;
        if (event.data?.source !== CONSOLE_SOURCE) return;

        const data = event.data;

        if (data.type === "console-mode-toggle-request") {
            onModeToggle?.();
            return;
        }

        if (data.type === "console-ready") {
            if (ready) return;

            ready = true;

            // Send initialization directly. It must not wait in the
            // regular command queue, because that queue waits for initialization.
            frame.contentWindow?.postMessage(
                {
                    source: CONSOLE_SOURCE,
                    type: "console-init",
                    settings: {
                        captureConsole,
                        mirrorToNative,
                        showCopyButtons,
                        allowDragOutsideBounds,
                        logTestOutput
                    }
                },
                targetOrigin
            );

            return;
        }

        if (data.type === "console-initialized") {
            if (!ready || initialized) return;

            initialized = true;
            flushQueue();

            postToFrame({
                type: "console-parent-connected"
            });

            return;
        }

        if (data.type === "console-init-error") {
            const message = ["[Console Initialization Failed]", data.message];

            if (typeof originalConsole.error === "function") {
                originalConsole.error(...message);
            }

            for (const pending of pendingRegistryRequests.values()) {
                pending.reject(
                    new Error(data.message || "Console initialization failed.")
                );
            }

            pendingRegistryRequests.clear();
            queue.length = 0;

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

        if (data.type === "inspect-request") {
            handleInspectorRequest(data);
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
    if (captureConsole) {
        for (const method of methods) {
            originalConsole[method] = console[method];
            installedWrappers[method] = (...args) => {
                send(method, args);
                if (
                    mirrorToNative &&
                    typeof originalConsole[method] === "function"
                ) {
                    originalConsole[method].apply(console, args);
                }
            };
            console[method] = installedWrappers[method];
        }
    }

    devConsole = {
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

    // Compatibility alias only. New integrations should use the returned instance.
    const previousGlobalDevConsole = window.devConsole;
    if (previousGlobalDevConsole == null) {
        window.devConsole = devConsole;
    }

    mount.appendChild(host);

    const api = {
        frame,
        host,
        devConsole,
        mode: "embedded",
        registerSuite,
        unregisterSuite,
        getSuites,

        destroy() {
            if (destroyed) return;
            destroyed = true;

            window.removeEventListener("message", onMessage);
            window.removeEventListener("message", onConsoleMessage);
            window.removeEventListener("error", onError, true);
            window.removeEventListener(
                "unhandledrejection",
                onUnhandledRejection
            );

            for (const method of methods) {
                // Do not overwrite another tool that wrapped console after us.
                if (
                    installedWrappers[method] &&
                    console[method] === installedWrappers[method]
                ) {
                    console[method] = originalConsole[method];
                }
            }

            for (const pending of pendingRegistryRequests.values()) {
                pending.reject(
                    new Error("Developer console has been destroyed.")
                );
            }

            pendingRegistryRequests.clear();
            suites.clear();
            queue.length = 0;

            inspectorHost?.destroy();

            host.remove();

            if (window.devConsole === devConsole) {
                if (previousGlobalDevConsole == null) delete window.devConsole;
                else window.devConsole = previousGlobalDevConsole;
            }
        }
    };

    return api;
}

