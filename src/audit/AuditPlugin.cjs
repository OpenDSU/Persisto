function AuditPlugin() {
    const logsFolder = process.env.LOGS_FOLDER;
    const auditFolder = process.env.AUDIT_FOLDER;
    const flushInterval = process.env.FLUSH_INTERVAL || 1;
    const SystemAudit = require('./SystemAudit.cjs');
    const systemAudit = SystemAudit.getSystemAudit(flushInterval, logsFolder, auditFolder);

    this.getAllLogs = async () => {
        // get all audit logs and create a json file in the format 
        // {year: {month: {day: {hash: string, entries: []}}}}
        try {
            // Get list of all audit files
            const auditFiles = await systemAudit.listAuditFiles();
            const result = {};
            
            // Process each file
            for (const file of auditFiles) {
                // Extract date components
                const [year, month, day] = file.date.split('-');
                
                // Initialize nested structure if needed
                if (!result[year]) result[year] = {};
                if (!result[year][month]) result[year][month] = {};
                
                // Get file content (entries)
                const content = await systemAudit.getAuditLogs(file.date);
                const entries = content.split('\n').filter(line => line.trim() !== '');
                
                // Store data for this day
                result[year][month][day] = {
                    hash: file.hash,
                    entries: entries
                };
            }
            
            return result;
        } catch (error) {
            console.error('Error getting all logs:', error);
            return {};
        }
    }

    this.getLogsForMonth = async (year, month) => {
        try {
            const allLogs = await this.getAllLogs();
            return allLogs[year] && allLogs[year][month] ? allLogs[year][month] : {};
        } catch (error) {
            console.error(`Error getting logs for month ${year}-${month}:`, error);
            return {};
        }
    }

    this.getLogsForYear = async (year) => {
        try {
            const allLogs = await this.getAllLogs();
            return allLogs[year] || {};
        } catch (error) {
            console.error(`Error getting logs for year ${year}:`, error);
            return {};
        }
    }

    this.getLogsForDay = async (year, month, day) => {
        try {
            const allLogs = await this.getAllLogs();
            return allLogs[year] && allLogs[year][month] && allLogs[year][month][day] 
                ? allLogs[year][month][day] 
                : { hash: '', entries: [] };
        } catch (error) {
            console.error(`Error getting logs for day ${year}-${month}-${day}:`, error);
            return { hash: '', entries: [] };
        }
    }

    this.getLogsDates = async () => {
        return  await systemAudit.listAuditDates();
    }
}

module.exports = {
    getInstance: async function(){
        return new AuditPlugin();
    },
    getDependencies: async function () {
        return [];
    },
    getAllow: function () {
        return function () {
            return true;
        }
    }
}
