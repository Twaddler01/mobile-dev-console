import { createConsoleHost } from "./console-loader.js";

/**
 * Public drop-in API for mobile-dev-console.
 *
 *   const tools = DevTools.mount({ mode: "overlay" });
 *   // or: DevTools.mount({ mode: "embedded", mountPoint: "#devtools" });
 *   tools.destroy();
 */
export const DevTools = Object.freeze({
    mount(options = {}) {
        return createConsoleHost(options);
    }
});

export function mountDevTools(options = {}) {
    return DevTools.mount(options);
}

export default DevTools;

/*
// Default: embedded iframe in #devtools, height 60dvh.
const tools = DevTools.mount();

// Explicit embedded mode.
const embedded = DevTools.mount({
    mode: "embedded",
    mountPoint: "#devtools",
    height: "60dvh"
});

// Explicit overlay mode.
const overlay = DevTools.mount({
    mode: "overlay",
    mountPoint: "#devtools",
    height: "60dvh"
});

// Switch using the two-arrow button.
// Or destroy the controller when finished.
tools.destroy();
*/