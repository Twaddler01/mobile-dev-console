import Console from "./Console.js";
import DOMInspectorHost from "./DOMInspectorHost.js";

/**
 * Loader for mobile-dev-console.
 *
 * Overlay:  Console.js renders inside a shadow root in this document.
 * Embedded: console-frame.html renders inside an iframe in the mount point.
 *
 * Design rules
 * ------------
 * 1. Ownership. Everything a renderer puts into the page (nodes, listeners,
 *    timers, console patches, globals) is registered on a Scope. destroy()
 *    is scope.dispose(): one path, reverse order, each step isolated.
 * 2. Tagging. Every node added to the page carries data-mdc-instance. After
 *    teardown the controller checks for survivors and sweeps them, so a
 *    mode switch can never leave an empty element behind.
 * 3. Isolation. The overlay lives in a shadow root (page CSS cannot reach
 *    in, console CSS cannot leak out) and the iframe is its own document.
 *    No page-wide events, no global stylesheet, no required mount element.
 * 4. Switching is "tear down fully, then mount", with rollback to the
 *    previous mode if the new one fails to mount.
 */

const CONSOLE_SOURCE = "mobile-dev-console";
const OWNER_ATTR = "data-mdc-instance";

// Matches --mdc-header-height in console.css.
const COLLAPSED_HEIGHT_PX = 44;

const consoleCssUrl = new URL("./console.css", import.meta.url).href;
const frameUrl = new URL("./console-frame.html", import.meta.url);

const targetOrigin = frameUrl.origin === "null" ? "*" : frameUrl.origin;

let instanceCounter = 0;

// ------------------------------------------------------------------
// Scope: registered cleanups, run once, in reverse order.
// ------------------------------------------------------------------

class Scope {
    constructor() {
        this.cleanups = [];
        this.disposed = false;
    }

    add(cleanup) {
        if (typeof cleanup !== "function") return cleanup;

        if (this.disposed) {
            cleanup();
            return cleanup;
        }

        this.cleanups.push(cleanup);
        return cleanup;
    }

    listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        this.add(() => target.removeEventListener(type, handler, options));
    }

    /** Register a node for removal. Added first => removed last. */
    own(node) {
        this.add(() => node.remove());
        return node;
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;

        while (this.cleanups.length) {
            const cleanup = this.cleanups.pop();

            try {
                cleanup();
            } catch (error) {
                console.error("[DevTools] Cleanup step failed:", error);
            }
        }
    }
}

/**
 * Claim a window property and give it back on release, but only if nobody
 * replaced it after us. Pass a falsy name to opt out of any global.
 */
function claimGlobal(name, value) {
    if (!name) return () => {};

    const hadPrevious = Object.prototype.hasOwnProperty.call(window, name);
    const previous = window[name];

    window[name] = value;

    return () => {
        if (window[name] !== value) return;

        if (hadPrevious && previous != null) {
            window[name] = previous;
        } else {
            delete window[name];
        }
    };
}

// ------------------------------------------------------------------
// Option helpers
// ------------------------------------------------------------------

function queryElement(value) {
    if (value instanceof Element) return value;

    if (typeof value !== "string" || !value.trim()) return null;

    try {
        return document.querySelector(value);
    } catch {
        return null;
    }
}

/**
 * Embedded mode only. Uses the supplied mount point, then #devtools, and
 * otherwise creates (and later removes) a container of its own, so a host
 * page does not need any console-specific markup.
 */
function resolveMount(value, instanceId, scope) {
    const found = queryElement(value) ?? queryElement("#devtools");

    if (found) return found;

    const created = document.createElement("div");
    created.setAttribute(OWNER_ATTR, instanceId);
    document.body.appendChild(created);

    return scope.own(created);
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

// ------------------------------------------------------------------
// Controller
// ------------------------------------------------------------------

/**
 * Stable public controller. The active renderer can change without
 * changing the object returned by DevTools.mount().
 */
export function createConsoleHost(options = {}) {
    let mode = options.mode ?? "embedded";

    if (mode !== "embedded" && mode !== "overlay") {
        throw new TypeError('mode must be "embedded" or "overlay".');
    }

    const instanceId = `mdc-${++instanceCounter}`;

    const settings = {
        mountPoint: options.mountPoint ?? null,
        height: resolveHeight(options.height),
        captureConsole: options.captureConsole ?? true,
        mirrorToNative: options.mirrorToNative ?? mode === "embedded",
        showCopyButtons: options.showCopyButtons ?? false,
        allowDragOutsideBounds: options.allowDragOutsideBounds ?? true,
        logTestOutput: options.logTestOutput ?? true,

        // Name of the window property that exposes the console instance.
        // Use null to keep the page's global namespace untouched.
        globalName:
            options.globalName === undefined ? "devConsole" : options.globalName
    };

    let active = null;
    let destroyed = false;
    let switching = false;

    const suites = new Map();

    function mountMode(targetMode) {
        const context = {
            ...settings,
            instanceId,
            onModeToggle: () => toggleMode({ defer: true })
        };

        const renderer =
            targetMode === "embedded"
                ? createEmbeddedConsole(context)
                : createOverlayConsole(context);

        try {
            // Restore project test suites after a renderer change.
            for (const definition of suites.values()) {
                renderer.registerSuite(definition);
            }

            trackSuiteChanges(renderer);
        } catch (error) {
            renderer.destroy();
            throw error;
        }

        return renderer;
    }

    /**
     * Projects usually register through window.devConsole.tests, which
     * talks to the active renderer directly. Mirror those calls into the
     * controller's suite map so they survive a mode switch.
     * (Runs after the replay above, so replayed suites are not re-added.)
     */
    function trackSuiteChanges(renderer) {
        const tests = renderer.devConsole?.tests;

        if (!tests) return;

        const register = tests.registerSuite.bind(tests);
        const unregister = tests.unregisterSuite.bind(tests);

        tests.registerSuite = definition => {
            register(definition);
            suites.set(definition.id, definition);

            return () => tests.unregisterSuite(definition.id);
        };

        tests.unregisterSuite = id => {
            suites.delete(id);
            return unregister(id);
        };
    }

    function teardown() {
        try {
            active?.destroy();
        } finally {
            active = null;
            sweepLeftovers();
        }
    }

    /**
     * Safety net. A correct teardown leaves nothing tagged with this
     * instance; if something does survive, remove it and say so.
     */
    function sweepLeftovers() {
        const leftovers = document.querySelectorAll(
            `[${OWNER_ATTR}="${instanceId}"]`
        );

        for (const node of leftovers) {
            node.remove();
        }

        if (leftovers.length) {
            console.warn(
                `[DevTools] Removed ${leftovers.length} leftover node(s) after teardown.`
            );
        }
    }

    function performSwitch(nextMode) {
        const previousMode = mode;

        teardown();

        try {
            mode = nextMode;
            active = mountMode(nextMode);
        } catch (error) {
            console.error(
                `[DevTools] Could not switch to "${nextMode}"; restoring "${previousMode}".`,
                error
            );

            sweepLeftovers();

            try {
                mode = previousMode;
                active = mountMode(previousMode);
            } catch (restoreError) {
                active = null;
                console.error(
                    "[DevTools] Could not restore the previous mode:",
                    restoreError
                );
            }
        }
    }

    /**
     * defer: let the click/message that asked for the switch finish
     * dispatching before the DOM it came from is torn down.
     */
    function switchTo(nextMode, { defer = false } = {}) {
        if (destroyed || switching || nextMode === mode) return false;

        switching = true;

        const run = () => {
            try {
                if (!destroyed) performSwitch(nextMode);
            } finally {
                switching = false;
            }
        };

        if (defer) {
            setTimeout(run, 0);
        } else {
            run();
        }

        return true;
    }

    function toggleMode(switchOptions) {
        return switchTo(
            mode === "embedded" ? "overlay" : "embedded",
            switchOptions
        );
    }

    active = mountMode(mode);

    return {
        get instanceId() {
            return instanceId;
        },

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

        setMode(nextMode) {
            if (nextMode !== "embedded" && nextMode !== "overlay") {
                throw new TypeError('mode must be "embedded" or "overlay".');
            }

            return switchTo(nextMode);
        },

        toggleMode() {
            return toggleMode();
        },

        registerSuite(definition) {
            if (destroyed) {
                throw new Error("Developer console has been destroyed.");
            }

            if (!active) {
                throw new Error("Developer console is not mounted.");
            }

            if (suites.has(definition?.id)) {
                throw new Error(
                    `Suite "${definition.id}" is already registered.`
                );
            }

            active.registerSuite(definition);
            suites.set(definition.id, definition);

            // Resolve the renderer at call time: the one that registered
            // the suite may be gone after a mode switch.
            return () => this.unregisterSuite(definition.id);
        },

        unregisterSuite(id) {
            suites.delete(id);
            return active?.unregisterSuite(id) ?? false;
        },

        getSuites() {
            if (!active) {
                throw new Error("Developer console is not mounted.");
            }

            return active.getSuites();
        },

        destroy() {
            if (destroyed) return;
            destroyed = true;

            suites.clear();
            teardown();
        }
    };
}

// ------------------------------------------------------------------
// Overlay renderer (shadow DOM, same document)
// ------------------------------------------------------------------

function createOverlayConsole({
    instanceId,
    onModeToggle,
    captureConsole,
    mirrorToNative,
    showCopyButtons,
    allowDragOutsideBounds,
    logTestOutput,
    globalName
}) {
    const scope = new Scope();

    try {
        // One owned root. Nothing else is added to the page except what
        // the inspector host tags with the same instance id.
        const host = scope.own(document.createElement("div"));
        host.setAttribute(OWNER_ATTR, instanceId);
        host.setAttribute("data-mdc-root", "overlay");

        // `all: initial` also stops page text styles from inheriting in.
        host.style.cssText = "all: initial; display: contents;";

        const shadow = host.attachShadow({ mode: "open" });

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = consoleCssUrl;
        shadow.appendChild(link);

        const consoleElement = document.createElement("div");
        consoleElement.style.visibility = "hidden";
        shadow.appendChild(consoleElement);

        // Avoid a flash of unstyled UI while the stylesheet loads.
        const reveal = () => consoleElement.style.removeProperty("visibility");
        link.addEventListener("load", reveal, { once: true });
        link.addEventListener("error", reveal, { once: true });

        const revealTimer = setTimeout(reveal, 2000);
        scope.add(() => clearTimeout(revealTimer));

        document.body.appendChild(host);

        const dispatchInspectorEvent = (event, payload = {}) => {
            consoleElement.dispatchEvent(
                new CustomEvent("devtools-inspect-event", {
                    detail: { event, payload }
                })
            );
        };

        // Overlay mode runs in the application document, so inspection can
        // call the host directly instead of using the iframe message bridge.
        const inspectorHost = new DOMInspectorHost({
            document,
            mountElement: host,
            instanceId,
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

        scope.add(() => inspectorHost.destroy());

        const consoleInstance = new Console({
            element: consoleElement,
            mode: "overlay",
            captureConsole,
            mirrorToNative,
            showCopyButtons,
            allowDragOutsideBounds,
            logTestOutput,
            inspectionBridge: inspectorHost,
            exposeGlobal: false
        });

        scope.add(() => consoleInstance.destroy());
        scope.add(claimGlobal(globalName, consoleInstance));

        scope.listen(consoleElement, "console-mode-toggle-request", () =>
            onModeToggle?.()
        );

        return {
            mode: "overlay",
            host,
            frame: null,

            console: consoleInstance,
            devConsole: consoleInstance,
            tests: consoleInstance.tests,

            registerSuite: definition =>
                consoleInstance.tests.registerSuite(definition),
            unregisterSuite: id => consoleInstance.tests.unregisterSuite(id),
            getSuites: () => consoleInstance.tests.getSuites(),

            destroy: () => scope.dispose()
        };
    } catch (error) {
        scope.dispose();
        throw error;
    }
}

// ------------------------------------------------------------------
// Embedded renderer (iframe)
// ------------------------------------------------------------------

function createEmbeddedConsole({
    instanceId,
    onModeToggle,
    mountPoint,
    height,
    captureConsole,
    mirrorToNative,
    showCopyButtons,
    allowDragOutsideBounds,
    logTestOutput,
    globalName
}) {
    const scope = new Scope();

    try {
        const mount = resolveMount(mountPoint, instanceId, scope);

        const host = scope.own(document.createElement("div"));
        host.setAttribute(OWNER_ATTR, instanceId);
        host.setAttribute("data-mdc-root", "embedded");

        Object.assign(host.style, {
            position: "relative",
            width: "100%",
            height,
            maxHeight: "100dvh",
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

        function sendInspectorEvent(event, payload = {}) {
            postToFrame({
                type: "inspect-event",
                event,
                payload
            });
        }

        const inspectorHost = new DOMInspectorHost({
            document: window.document,
            mountElement: host,
            instanceId,

            onPick({ id, details }) {
                sendInspectorEvent("picked", { id, details });
            },

            onPickCancelled() {
                sendInspectorEvent("pick-cancelled");
            },

            onSelectionChange({ id, details }) {
                sendInspectorEvent("selection-changed", { id, details });
            }
        });

        scope.add(() => inspectorHost.destroy());

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

            // Keep callbacks in the host page. Never try to transfer
            // functions through postMessage.
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

                pendingRegistryRequests.set(requestId, { resolve, reject });

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
            // The source check is what keeps other frames and other
            // projects' postMessage traffic out.
            if (event.source !== frame.contentWindow) return;
            if (event.origin !== frameUrl.origin) return;
            if (event.data?.source !== CONSOLE_SOURCE) return;

            const data = event.data;

            if (data.type === "console-collapse-changed") {
                host.style.height = data.collapsed
                    ? `${COLLAPSED_HEIGHT_PX}px`
                    : height;
                return;
            }

            if (data.type === "console-mode-toggle-request") {
                onModeToggle?.();
                return;
            }

            if (data.type === "console-ready") {
                if (ready) return;

                ready = true;

                // Send initialization directly. It must not wait in the
                // regular command queue, because that queue waits for
                // initialization.
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

        scope.listen(window, "message", onMessage);
        scope.listen(window, "error", onError, true);
        scope.listen(window, "unhandledrejection", onUnhandledRejection);

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

            scope.add(() => {
                for (const method of methods) {
                    // Do not overwrite another tool that wrapped console
                    // after us.
                    if (
                        installedWrappers[method] &&
                        console[method] === installedWrappers[method]
                    ) {
                        console[method] = originalConsole[method];
                    }
                }
            });
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

        scope.add(claimGlobal(globalName, devConsole));

        // Runs first on dispose (added last): stop talking to the frame,
        // then let everything above unwind.
        scope.add(() => {
            destroyed = true;

            for (const pending of pendingRegistryRequests.values()) {
                pending.reject(
                    new Error("Developer console has been destroyed.")
                );
            }

            pendingRegistryRequests.clear();
            suites.clear();
            queue.length = 0;
        });

        // Attach last, after every listener exists, so no message from the
        // frame can arrive before it is handled.
        mount.appendChild(host);

        return {
            mode: "embedded",
            host,
            frame,
            devConsole,

            registerSuite,
            unregisterSuite,
            getSuites,

            destroy: () => scope.dispose()
        };
    } catch (error) {
        scope.dispose();
        throw error;
    }
}
