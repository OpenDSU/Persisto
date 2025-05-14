let getSystemAudit = require('./src/audit/SystemAudit.cjs').getSystemAudit
let initialisePersisto = require('./src/persistence/Persisto.cjs').initialisePersisto
let getAutoSaverPersistence = require('./src/persistence/ObjectsAutoSaver.cjs').getAutoSaverPersistence

if (typeof globalThis.$$ === "undefined") {
    globalThis.$$ = {};
}
if (typeof globalThis.$$.throwError === "undefined") {
    async function throwError(error, ...args) {
        if (typeof error === "string") {
            let errorText = error + " " + args.join(" ");
            throw Error(errorText);
        }
        throw error;
    }
    $$.throwError = throwError;
}
if (typeof globalThis.$$.throwErrorSync === "undefined") {
    function throwErrorSync(error, ...args) {
        if (typeof error === "string") {
            error = new Error(error + " " + args.join(" "));
        }
        throw error;
    }
    $$.throwErrorSync = throwErrorSync;
}
module.exports = {
    getSystemAudit: getSystemAudit,
    initialisePersisto: async function (logger) {
        if (!logger) {
            logger = getSystemAudit(1000);
        }
        let autoSaver = await getAutoSaverPersistence();
        return await initialisePersisto(autoSaver, logger);
    }
};