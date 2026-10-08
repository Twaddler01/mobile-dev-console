export default class TestEnvironment {
    constructor() {
        //this.create();
        //this.create2();
        this.create3();

        devConsole.error(new Error('Test error'));
        //devConsole.testEnvironment.testUncaughtError();
        //devConsole.testEnvironment.testUnhandledRejection();
        //devConsole.testEnvironment.testFailedResource();

    }

    create3() {
        devConsole.group("Error handling tests");

        devConsole.log("Run individual error tests separately.");

        devConsole.groupEnd();
    }

    // ==========================================
    // 1. MANUAL ERROR
    // ==========================================

    testManualError() {
        try {
            throw new Error("Simulated manual error");
        } catch (error) {
            devConsole.error(error);
        }
    }

    // ==========================================
    // 2. UNCAUGHT SYNCHRONOUS ERROR
    // ==========================================

    testUncaughtError() {
        setTimeout(() => {
            throw new Error("Simulated uncaught error");
        }, 0);
    }

    // ==========================================
    // 3. UNHANDLED PROMISE REJECTION
    // ==========================================

    testUnhandledRejection() {
        Promise.reject(
            new Error("Simulated unhandled rejection")
        );
    }

    // ==========================================
    // 4. FAILED RESOURCE LOAD
    // ==========================================

    testFailedResource() {
        const script = document.createElement("script");

        script.src = "./missing-test-file.js";

        document.head.appendChild(script);
    }

    create2() {
        devConsole.groupCollapsed("Test run #1");

        devConsole.log("Starting tests");

        devConsole.group("Layout tests");

        devConsole.log("First test");
        devConsole.log("Second test");

        devConsole.table({
            width: 800,
            height: 600,
            columns: 2
        });

        devConsole.groupCollapsed("Nested test");

        devConsole.warn("Nested warning");
        devConsole.error("Nested error");

        devConsole.groupEnd();
        devConsole.groupEnd();
        devConsole.groupEnd();
    }

    create() {
        devConsole.log("Hello world");
        devConsole.warn("Warning test");
        devConsole.error("Error test");

        devConsole.group("Layout tests");
        devConsole.log("First test");
        devConsole.log("Second test");
        devConsole.groupEnd();

        devConsole.table({
            width: 800,
            height: 600,
            columns: 2
        });
    }
}
