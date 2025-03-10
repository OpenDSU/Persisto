

let getSystemAudit = require('./src/audit/SystemAudit').getSystemAudit
let initialisePersisto = require('./src/persistence/Persisto').initialisePersisto
let getAutoSaverPersistence = require('./src/persistence/ObjectsAutoSaver').getAutoSaverPersistence

module.exports = {
    getSystemAudit: getSystemAudit,
   initialisePersisto: async function (logger) {
        if(!logger){
          logger = getSystemAudit(1000);
        }
       let autoSaver = await getAutoSaverPersistence();
        await autoSaver.init();
       return await initialisePersisto(autoSaver, logger);
   }
};