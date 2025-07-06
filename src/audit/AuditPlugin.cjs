function AuditPlugin() {
    const logsFolder = process.env.LOGS_FOLDER;
    const auditFolder = process.env.AUDIT_FOLDER;
    const flushInterval = process.env.FLUSH_INTERVAL || 1;
    const SystemAudit = require('./SystemAudit.cjs');
    const systemAudit = SystemAudit.getSystemAudit(flushInterval, logsFolder, auditFolder);

    this.getAllLogs = async () => {
        // get all audit logs and create a json file in the format
        // {year: {month: {day: {hash: string, previousDayContentHash: string, entries: []}}}}
        try {
            // Get list of all audit files
            const auditFiles = await systemAudit.listAuditFiles(); // Sorted newest first
            const result = {};

            // Process each file
            for (const file of auditFiles) {
                // Extract date components
                const [year, month, day] = file.date.split('-');

                // Initialize nested structure if needed
                if (!result[year]) result[year] = {};
                if (!result[year][month]) result[year][month] = {};

                // Get file content (entries)
                const content = await systemAudit.getAuditLogs(file.date); // Gets full content of audit_YYYY-MM-DD.log
                const rawLines = content.split('\n');

                // Remove trailing empty line if content ended with a newline
                if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
                    rawLines.pop();
                }

                let previousDayContentHashFromFile = '';
                let currentDayEntries = [];

                if (rawLines.length > 0) {
                    // Check if the first line is an audit entry (contains ';') or a prepended hash
                    if (rawLines[0].includes(';')) {
                        // First line is an actual audit entry, meaning no previous day hash was prepended
                        previousDayContentHashFromFile = '';
                        currentDayEntries = rawLines.filter(line => line.trim() !== '');
                    } else {
                        // First line is assumed to be the prepended hash (or empty if file was initialized empty and no entries yet)
                        previousDayContentHashFromFile = rawLines[0];
                        currentDayEntries = rawLines.slice(1).filter(line => line.trim() !== '');
                    }
                }
                // If rawLines is empty (file was empty), previousDayContentHashFromFile remains '' and currentDayEntries remains [].

                // Store data for this day
                result[year][month][day] = {
                    hash: file.hash, // hash of the entire content of the current day's file
                    previousDayContentHash: previousDayContentHashFromFile,
                    entries: currentDayEntries
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
                : { hash: '', previousDayContentHash: '', entries: [] };
        } catch (error) {
            console.error(`Error getting logs for day ${year}-${month}-${day}:`, error);
            return { hash: '', previousDayContentHash: '', entries: [] };
        }
    }

    this.getLogsDates = async () => {
        return await systemAudit.listAuditDates();
    }

    this.getPublicMethods = function () {
        return [];
    }
}

module.exports = {
    getInstance: async function () {
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
