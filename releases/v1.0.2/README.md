# mobile-dev-console

A lightweight, mobile-friendly JavaScript developer console for browser and WebView applications.

`mobile-dev-console` provides an in-app debugging interface with console output, runtime error reporting, DOM inspection, and test tools. It can run as an **embedded console** or a **draggable overlay**, making it useful for development on desktop browsers, mobile browsers, and WebView-based applications.

> **Project status:** v1.0.0 is the initial online release. v1.0.1 is currently in progress.

## Features

- **Mobile-first UI** — designed for touchscreens and limited screen space.
- **Two display modes** — embed the console in your application or display it as an overlay.
- **Console capture** — capture application console output, including logs, warnings, and errors.
- **Runtime error reporting** — use the separate `errorBootstrap.js` module to capture errors outside the console itself, including many module and import errors.
- **DOM inspector** — inspect the application DOM, browse elements, and examine element details.
- **Test tools** — access the test interface and register custom test suites.
- **Draggable interface** — reposition the console and optionally allow dragging beyond its normal bounds.
- **Viewport-aware positioning** — keep the overlay accessible as the visible mobile viewport changes.
- **Configurable output** — control native console mirroring and copy buttons.
- **CDN distribution** — import the released modules directly into your application without bundling the console into your project.

## Table of contents

- [Installation and CDN URLs](#installation-and-cdn-urls)
- [Quick start](#quick-start)
- [Display modes](#display-modes)
- [Configuration](#configuration)
- [Instance API](#instance-api)
- [Error handling](#error-handling)
- [Development roadmap](#development-roadmap)
- [Version history](#version-history)

## Installation and CDN URLs

The initial release is available through GitHub Pages.

| Module | URL |
|---|---|
| Main module | `https://twaddler01.github.io/mobile-dev-console/releases/v1.0.0/DevTools.js` |
| Error bootstrap | `https://twaddler01.github.io/mobile-dev-console/releases/v1.0.0/errorBootstrap.js` |

The main module is an ES module. Load it using `import()` or a `<script type="module">` block.

The error bootstrap is a separate, regular JavaScript script and should be loaded before your application initializes.

**Note:** These URLs point to v1.0.0. Features or fixes developed for v1.0.1 are not available from these URLs until a new release is published.

## Quick start

The following example initializes the console before loading your application entry point.

### 1. Add the required HTML elements

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
    >
    <title>My Application</title>
</head>
<body>
    <!-- Required by errorBootstrap.js -->
    <div id="productionErrorLog"></div>

    <!-- Mount point for embedded mode -->
    <div id="devtools"></div>

    <!-- Install error listeners before application startup -->
    <script src="https://twaddler01.github.io/mobile-dev-console/releases/v1.0.0/errorBootstrap.js"></script>

    <script type="module">
        try {
            const { DevTools } = await import(
                "https://twaddler01.github.io/mobile-dev-console/releases/v1.0.0/DevTools.js"
            );

            const devTools = DevTools.mount({
                mode: "embedded",
                mountPoint: "#devtools",
                height: "60dvh",
                captureConsole: true,
                mirrorToNative: false,
                showCopyButtons: false,
                allowDragOutsideBounds: true
            });

            // Optional: expose the instance to application code.
            window.devTools = devTools;

            // Initialize the application after DevTools.
            await import("./main.js");
        } catch (error) {
            if (window.devConsole) {
                window.devConsole.error(error);
            } else if (window.showFatalError) {
                window.showFatalError(
                    "Application Startup Failed",
                    error
                );
            } else {
                console.error(error);
            }
        }
    </script>
</body>
</html>
```

### 2. Test console output

In `main.js`:

```javascript
console.log("Welcome to mobile-dev-console!");

const developers = [
    { name: "Alice", role: "Frontend", experience: 5 },
    { name: "Bob", role: "Backend", experience: 3 },
    { name: "Charlie", role: "Fullstack", experience: 7 }
];

console.table(developers);

console.warn("Example warning...");
console.error("Example error...");
```

The console should capture the application's output according to the configured settings.

## Display modes

`DevTools.mount()` supports two display modes.

### Embedded mode

Displays the console inside a designated application element. This is useful when you want the debugging interface to occupy a predictable portion of the application layout.

```javascript
const devTools = DevTools.mount({
    mode: "embedded",
    mountPoint: "#devtools",
    height: "60dvh"
});
```

The `mountPoint` identifies the element that will contain the embedded console.

### Overlay mode

Displays the console as an overlay on the application page, rather than reserving space in the application layout.

```javascript
const devTools = DevTools.mount({
    mode: "overlay",
    allowDragOutsideBounds: false
});
```

Overlay mode is useful for debugging applications where you want to interact with the application while keeping developer tools accessible.

The overlay supports viewport-aware positioning and dragging. Keeping the console within the visible viewport is recommended for mobile devices.

## Configuration

Pass an options object to `DevTools.mount()`.

| Option | Description |
|---|---|
| `mode` | `"embedded"` or `"overlay"`. |
| `mountPoint` | CSS selector or supported mount element for embedded mode. |
| `height` | Requested height for the embedded console, such as `"60dvh"`. |
| `captureConsole` | Enables application console capture. |
| `mirrorToNative` | Controls whether captured output is also sent to the native console. |
| `showCopyButtons` | Controls the visibility of copy buttons. |
| `allowDragOutsideBounds` | Allows dragging beyond the normal overlay bounds while retaining a way to recover the console. |

Example:

```javascript
const devTools = DevTools.mount({
    mode: "overlay",
    captureConsole: true,
    mirrorToNative: false,
    showCopyButtons: true,
    allowDragOutsideBounds: false
});
```

If an option is omitted, the implementation's default value is used.

## Instance API

`DevTools.mount()` returns an instance that provides access to the console and test tools.

```javascript
const devTools = DevTools.mount({
    mode: "overlay"
});
```

The instance API includes:

| Member | Purpose |
|---|---|
| `devTools.devConsole` | Access the console instance. |
| `devTools.tests` | Access the test registry. |
| `devTools.registerSuite(...)` | Register a test suite. |
| `devTools.unregisterSuite(...)` | Unregister a test suite. |
| `devTools.getSuites()` | Retrieve registered test suites. |
| `devTools.destroy()` | Tear down the mounted console and its associated resources. |

For example, to remove the console when debugging is no longer needed:

```javascript
devTools.destroy();
```

Use the test registration methods according to the suite interface supported by the current release.

## Error handling

`errorBootstrap.js` is intended to be loaded before application initialization so it can capture errors that occur outside the developer console itself.

The provided example includes a `#productionErrorLog` element for fatal error reporting.

Application startup is wrapped in `try/catch` so a failed dynamic import or initialization step can be reported instead of failing silently.

```javascript
try {
    await import("./main.js");
} catch (error) {
    if (window.devConsole) {
        window.devConsole.error(error);
    } else {
        console.error(error);
    }
}
```

The bootstrap complements this startup error handling; it does not guarantee that every possible browser, WebView, or module-loading failure can be intercepted.

## Development roadmap

### Short term — v1.0.2

* Persist console settings using `localStorage`.
* Continue improving inspector toggling and overlay behavior.
* Refine viewport-aware positioning and mobile interaction.

### Long term*

* Execute reusable console command scripts.
* Improve WebView integration.

<sub>\* Long term items are planned work and may change as development progresses.</sub>

## Version history

### v1.0.2 — In progress

### v1.0.1

- Added support for switching between embedded and overlay console modes.
- Simplified inspector toggling.
- Improved overlay positioning using the visible mobile viewport.
- Continued separating console behavior from application-specific JavaScript.

### v1.0.0 — Initial release

- Packaged the console for online ES module imports.
- Published the main `DevTools.js` module and `errorBootstrap.js` through GitHub Pages.

## Project

**Repository:** [Twaddler01/mobile-dev-console](https://github.com/Twaddler01/mobile-dev-console)

**Release example page** [GitHub Pages index.html](https://twaddler01.github.io/mobile-dev-console/releases/v1.0.0/)

**Bootstrap CDN Link** [https://twaddler01.github.io/mobile-dev-console/releases/v1.0.0/errorBootstrap.js](https://twaddler01.github.io/mobile-dev-console/releases/v1.0.0/errorBootstrap.js)

**DevTools CDN Link** [https://twaddler01.github.io/mobile-dev-console/releases/v1.0.0/DevTools.js](https://twaddler01.github.io/mobile-dev-console/releases/v1.0.0/DevTools.js)

Contributions, bug reports, and suggestions for improving mobile debugging workflows are welcome.
