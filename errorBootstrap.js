
// ================================================== // EMERGENCY ERROR BOOTSTRAP // ==================================================
(() => {
// Prevent accidental duplicate installation.
if (window.__errorBootstrapInstalled) {
    return;
}

window.__errorBootstrapInstalled = true;

// --------------------------------------------------
// DISPLAY FATAL ERROR
// --------------------------------------------------

window.showFatalError = function(title, error) {

    const panel =
        document.getElementById('productionErrorLog');

    if (!panel) {
        return;
    }

    let message;

    if (error instanceof Error) {
        message = error.stack || error.message;
    } else if (
        error &&
        typeof error === 'object'
    ) {
        try {
            message = JSON.stringify(error, null, 2);
        } catch {
            message = String(error);
        }
    } else {
        message = String(error ?? 'Unknown error');
    }

    // Build the panel using DOM methods only.
    // This does not depend on console.js or console.css.

    panel.replaceChildren();

    Object.assign(panel.style, {
        display: 'block',
        position: 'fixed',
        top: '10px',
        left: '10px',
        right: '10px',
        maxHeight: '70vh',
        overflow: 'auto',
        padding: '12px',
        background: '#300',
        color: '#fff',
        border: '2px solid #f55',
        borderRadius: '6px',
        fontFamily: 'monospace',
        fontSize: '13px',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        zIndex: '2147483647',
        boxSizing: 'border-box'
    });

    const heading =
        document.createElement('strong');

    heading.textContent =
        `⚠ ${title}`;

    const details =
        document.createElement('pre');

    Object.assign(details.style, {
        margin: '10px 0 0',
        color: '#ffaaaa',
        font: 'inherit',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere'
    });

    details.textContent = message;

    panel.append(heading, details);
};

// --------------------------------------------------
// RUNTIME AND RESOURCE ERRORS
// --------------------------------------------------

window.addEventListener('error', event => {
    const title = event.error
        ? 'JavaScript Runtime Error'
        : 'JavaScript / Module / Resource Load Error';

    const error = event.error || {
        message:
            event.message ||
            'A script, module, or other resource failed to load.',
        filename: event.filename || null,
        line: event.lineno || null,
        column: event.colno || null,
        target:
            event.target?.src ||
            event.target?.href ||
            event.target?.tagName ||
            null
    };

    if (window.devConsole) {
        // The main console is running: use it exclusively.
        window.devConsole.error(error);
        return;
    }

    // The main console is unavailable: use the fallback.
    window.showFatalError(title, error);

}, true);

// --------------------------------------------------
// UNHANDLED PROMISE ERRORS
// --------------------------------------------------

window.addEventListener('unhandledrejection', event => {
    if (window.devConsole) {
        window.devConsole.error(event.reason);
        return;
    }

    window.showFatalError(
        'Unhandled Promise Error',
        event.reason
    );
});

})();