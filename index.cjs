

let getSystemAudit = require('./src/audit/SystemAudit.cjs').getSystemAudit
let initialisePersisto = require('./src/persistence/Persisto.cjs').initialisePersisto
let getAutoSaverPersistence = require('./src/persistence/ObjectsAutoSaver.cjs').getAutoSaverPersistence

module.exports = {
    getSystemAudit: getSystemAudit,
   initialisePersisto: async function (logger) {
        if(!logger){
          logger = getSystemAudit(1000);
        }
        let autoSaver = await getAutoSaverPersistence();
        return await initialisePersisto(autoSaver, logger);
   }
};