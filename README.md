# ABOUT
A lightweight, mobile-friendly JavaScript developer console for browser and WebView applications, featuring runtime error reporting, command execution, and debugging tools.

Designed to be 100% mobile compatible.

# WORK IN PROGRESS

SHORT TERM (v1.0.1)
- Save settings to localstorage.

LONG TERM
- Execute console command scripts.
- WebView integration.

# v1.0.1 (in progress)
- Added the ability to swap console ui between "embedded" and "overlay" modes.
- Cleaned up INSPECT (for toggling).
- Now uses mobile viewport to keep ui in viewable bounds, outside of any separate JavaScript projects.
# v1.0.0 initial (newest):
- Packaged for online use.

# USAGE

URL(s) available below for online module import (v1.0.0 initial release).

### Catch errors outside of mobile-dev-console, including most module/import errors
https://twaddler01.github.io/mobile-dev-console/releases/v1.0.0/errorBootstrap.js

### Main module script
https://twaddler01.github.io/mobile-dev-console/releases/v1.0.0/DevTools.js

# EXAMPLE

index.html :

```html
<!-- Required for errorBootstrap -->
<div id="productionErrorLog"></div>

<!-- Main console div required for mode: 'overlay' -->
<div id="devtools"></div>

<!-- Install error listeners first. -->
<script src="https://twaddler01.github.io/mobile-dev-console/releases/v1.0.0/errorBootstrap.js"></script>

<!-- Initialize the console before integrations and the application. -->
<script type="module">
    try {
        const { default: DevTools } =
            await import("https://twaddler01.github.io/mobile-dev-console/releases/v1.0.0/DevTools.js");

        const devTools = DevTools.mount({
            mode: "embedded",
            mountPoint: "#devtools", // set above
            height: "60dvh",
            captureConsole: true,
            mirrorToNative: false,
            showCopyButtons: false,
            allowDragOutsideBounds: true
        });

        // Optional: make the instance available to app code.
        // window.devConsole = devTools;

        // Your local starting script
        await import("./main.js");
    } catch (error) {
        if (window.devConsole) {
            window.devConsole.error(error);
        } else if (window.showFatalError) {
            window.showFatalError("Application Startup Failed", error);
        } else {
            console.error(error);
        }
    }
</script>
```