import { promises as fs } from "fs";

let plugins = {};

if (typeof globalThis.$$ === "undefined") {
    globalThis.$$ = {};
}

if (typeof globalThis.$$.registerPlugin === "undefined") {
    async function registerPlugin(pluginName, path) {
        let plug = await import(path);
        let pluginInstance = await plug.getInstance();
        if (typeof pluginInstance === "undefined") {
            await $$.throwError("Invalid plugin. getInstance() method returned undefined for plugin", pluginName);
        }
        plugins[pluginName] = pluginInstance;
    }
    $$.registerPlugin = registerPlugin;
}
if (typeof globalThis.$$.loadPlugin === "undefined") {
    function loadPlugin(pluginName) {
        return plugins[pluginName];
    }
    $$.loadPlugin = loadPlugin;
}

import path from 'path';
if (!process["env"].PERSISTENCE_FOLDER) {
    process["env"].PERSISTENCE_FOLDER = path.join(process.cwd(), "temp_persistence");
}
async function createTempDir(prefix = 'temp-') {
    let root = process["env"].PERSISTENCE_FOLDER;
    try {
        await fs.rm(root, { recursive: true, force: true });
        await fs.mkdir(root);
    }
    // eslint-disable-next-line no-unused-vars
    catch (err) {
        console.log("Folder already exists");
    }

    try {
        const tempDir = await fs.mkdtemp(path.join(root, prefix));
        return tempDir;
    } catch (error) {
        console.error('Error creating temporary folder:', error);
        throw error;
    }
}

$$.clean = async function () {
    process["env"].PERSISTENCE_FOLDER = await createTempDir();
}

