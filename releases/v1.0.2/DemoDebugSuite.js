/**
 * Example of how an external project registers tools with mobile-dev-console.
 * Keep project-specific debug actions in their own integration module.
 */
const devConsole = window.devConsole;

function customRun() {
    console.log("TEST: native console");
    window.devConsole.log("TEST: direct devConsole");
}

if (devConsole?.tests) {
    devConsole.tests.registerSuite({
        id: "demo-project",
        name: "Demo Project",
        description: "Example actions showing how another project integrates.",
        actions: [
            {
                id: "custom",
                label: "Run Custom",
                description: "Console debugging.",
                run: () => customRun()
            },
            {
                id: "sample-logs",
                label: "Write Sample Logs",
                description: "Adds log, warning, and object output to LOG.",
                run: ({ console }) => {
                    console.log("Demo integration connected.");
                    console.warn("This is a sample warning from a registered action.");
                    console.log("Sample data:", {
                        project: "demo-project",
                        registered: true,
                        timestamp: new Date().toISOString()
                    });
                }
            },
            {
                id: "registry-summary",
                label: "Inspect Registered Suites",
                description: "Returns the currently registered suite names and actions.",
                run: ({ console }) => console.tests.getSuites()
            },
            {
                id: "async-demo",
                label: "Run Async Example",
                description: "Demonstrates an action that returns a promise.",
                run: async () => ({
                    result: "Async action completed",
                    completedAt: new Date().toISOString()
                })
            },
        ]
    });

    console.log('DemoDebugSuite: mobile-dev-console integrated.');
} else {
    console.warn("DemoDebugSuite: mobile-dev-console integration API is unavailable.");
}
