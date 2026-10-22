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
// Direct console in the current page; no iframe.
const overlay = DevTools.mount({
    mode: "overlay"
});

// Console in a separate iframe inside a container.
const embedded = DevTools.mount({
    mode: "embedded",
    mountPoint: "#devtools",
    height: "60dvh"
});

// Later:
overlay.destroy();
embedded.destroy();
*/