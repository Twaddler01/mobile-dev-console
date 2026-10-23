const fs = require("fs");
const path = require("path");
const ignore = require("ignore");

class ExcludeManager {
    constructor(root, options = {}) {
        this.root = path.resolve(root);
        this.configPath = options.configPath;
        this.excludeGit = options.excludeGit === true;
        this.customPatterns = [];
        this.gitRules = [];
        this.gitignoreFiles = [];
        this.loaded = false;

        // These paths are never exposed by the server.
        this.mandatoryNames = new Set([
            ".git",
            "node_modules",
            "settings.config",
            "exclude.config",
            ".gitignore"
        ]);
    }

    load() {
        this.customPatterns = this.readPatterns(this.configPath);

        if (!this.configPath || !fs.existsSync(this.configPath)) {
            console.warn("[DevServer] WARNING: exclude.config not found.");
            console.warn(
                "[DevServer] Create exclude.config to exclude files/folders " +
                    "from HTTP serving, directory listings and live reload."
            );
            console.warn("[DevServer] Using mandatory exclusions only.");
        }

        this.customMatcher = ignore().add(this.customPatterns);

        if (this.excludeGit) {
            this.discoverGitIgnores(this.root);
        }

        this.loaded = true;
        this.report();
    }

    readPatterns(filePath) {
        if (!filePath || !fs.existsSync(filePath)) {
            return [];
        }

        return fs
            .readFileSync(filePath, "utf8")
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith("#"));
    }

    relative(filePath) {
        return path
            .relative(this.root, path.resolve(filePath))
            .split(path.sep)
            .join("/");
    }

    isInsideRoot(filePath) {
        const relative = this.relative(filePath);

        return (
            relative === "" ||
            (!path.isAbsolute(relative) &&
                relative !== ".." &&
                !relative.startsWith("../"))
        );
    }

    isMandatory(relativePath) {
        const parts = relativePath.split("/");

        return (
            parts.some(part => this.mandatoryNames.has(part)) ||
            parts.some(part => part === ".gitignore" && false)
        );
    }

    matches(matcher, relativePath, isDirectory) {
        if (!relativePath) return false;

        const candidate = isDirectory
            ? relativePath.replace(/\/+$/, "") + "/"
            : relativePath;

        return matcher.ignores(candidate);
    }

    isExcluded(filePath, isDirectory = false) {
        if (!this.isInsideRoot(filePath)) return true;

        const relativePath = this.relative(filePath);

        if (!relativePath) return false;

        if (this.isMandatory(relativePath)) return true;

        if (this.matches(this.customMatcher, relativePath, isDirectory)) {
            return true;
        }

        for (const rule of this.gitRules) {
            if (
                relativePath === rule.base ||
                relativePath.startsWith(rule.base + "/")
            ) {
                const localPath =
                    relativePath === rule.base
                        ? ""
                        : relativePath.slice(rule.base.length + 1);

                if (
                    localPath &&
                    this.matches(rule.matcher, localPath, isDirectory)
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    discoverGitIgnores(directory) {
        let entries;

        try {
            entries = fs.readdirSync(directory, {
                withFileTypes: true
            });
        } catch {
            return;
        }

        const gitignorePath = path.join(directory, ".gitignore");

        if (fs.existsSync(gitignorePath)) {
            const patterns = this.readPatterns(gitignorePath);
            const base = this.relative(directory);

            this.gitRules.push({
                base,
                matcher: ignore().add(patterns),
                file: gitignorePath
            });

            this.gitignoreFiles.push(gitignorePath);
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const childPath = path.join(directory, entry.name);

            // Never descend into Git metadata or dependency trees.
            if (this.isMandatory(this.relative(childPath))) {
                continue;
            }

            if (
                this.matches(this.customMatcher, this.relative(childPath), true)
            ) {
                continue;
            }

            this.discoverGitIgnores(childPath);
        }
    }

    report() {
        console.log(
            `[DevServer] Custom exclusions: ${this.customPatterns.length}`
        );

        console.log(
            `[DevServer] Git exclusions: ${this.excludeGit ? "Enabled" : "Disabled"}`
        );

        for (const file of this.gitignoreFiles) {
            console.log(
                `[DevServer] .gitignore found in ${path.dirname(file)}`
            );
        }
    }
}

module.exports = ExcludeManager;
