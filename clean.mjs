import { promises as fs } from "fs";
class MockObservableResponse {
    constructor() {
        this._promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
        this._progressData = [];
    }

    then(onFulfilled, onRejected) {
        return this._promise.then(onFulfilled, onRejected);
    }

    catch(onRejected) {
        return this._promise.catch(onRejected);
    }

    finally(onFinally) {
        return this._promise.finally(onFinally);
    }

    progress(progressData) {
        this._progressData.push(progressData);
        if (this._onProgress) {
            this._onProgress(progressData);
        }
    }
    onProgress(callback) {
        this._onProgress = callback;
    }
    end(result) {
        this._resolve(result);
    }

    getProgressData() {
        return this._progressData;
    }
}

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

if (typeof globalThis.$$.createObservableResponse === "undefined") {
    function createObservableResponse() {
        return new MockObservableResponse();
    }
    $$.createObservableResponse = createObservableResponse;
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

