const fs = require('fs').promises;
const path = require('path');
const cryptoUtils = require('./cryptoUtils.cjs');

function SystemAudit(flushInterval = 1, logDir, auditDir) {
    if (!logDir) {
        if (process.env.LOGS_FOLDER === undefined) {
            console.error("LOGS_FOLDER environment variable is not set. Please set it to the path where the logs should be stored. Defaults to './logs/'");
            process.env.LOGS_FOLDER = "./logs/"
        }
        logDir = process.env.LOGS_FOLDER;
    }
    if (!auditDir) {
        if (process.env.AUDIT_FOLDER === undefined) {
            console.error("AUDIT_FOLDER environment variable is not set. Please set it to the path where the audit logs should be stored. Defaults to './audit/'");
            process.env.AUDIT_FOLDER = "./audit/"
        }
        auditDir = process.env.AUDIT_FOLDER;
    }
    let buffer = [];
    let auditBuffer = [];
    let usersBuffer = {};
    let previousLineHash = '';
    let currentDate = new Date().toISOString().split('T')[0];

    let logsTimer = null;
    let auditTimer = null;

    fs.mkdir(logDir, {recursive: true}).catch(console.error);
    fs.mkdir(auditDir, {recursive: true}).catch(console.error);
    initDayAuditFile();

    function getLogFileName() {
        const date = new Date().toISOString().split('T')[0];
        return path.join(logDir, `syslog_${date}.log`);
    }

    function getAuditLogFileName() {
        const date = new Date().toISOString().split('T')[0];
        return path.join(auditDir, `audit_${date}.log`);
    }

    function getLogFileNameForUser(userID) {
        return path.join(logDir, `user-${userID}.log`);
    }

    // Function to initialize a new day's audit file
    async function initDayAuditFile() {
        const today = new Date().toISOString().split('T')[0];
        const auditFilePath = path.join(auditDir, `audit_${today}.log`);

        try {
            // Check if file exists
            await fs.access(auditFilePath).catch(async () => {
                // Calculate yesterday's date
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];
                const yesterdayFilePath = path.join(auditDir, `audit_${yesterdayStr}.log`);

                // Check if yesterday's file exists and get its hash
                let previousFileHash = '';
                try {
                    await fs.access(yesterdayFilePath);
                    const content = await fs.readFile(yesterdayFilePath, 'utf8');
                    previousFileHash = await cryptoUtils.sha256Base64(content);
                } catch (err) {
                    // Yesterday's file doesn't exist, proceed with empty hash
                    console.log(`No previous day file (${yesterdayStr}) found, starting new chain.`);
                }

                // Initialize the file with the previous file hash
                await fs.writeFile(auditFilePath, '', 'utf8');

                // Add the first entry with the previous file hash if we have one
                if (previousFileHash) {
                    const timestamp = new Date().toISOString();
                    const firstEntry = `PREV_FILE_HASH; ${previousFileHash}`;
                    const contentHash = await cryptoUtils.sha256Base64(firstEntry);
                    const entryHash = await cryptoUtils.sha256Base64('' + contentHash);

                    const completeEntry = `${entryHash}; [${timestamp}]; SYSTEM; ${firstEntry};`;
                    await fs.appendFile(auditFilePath, completeEntry + '\n', 'utf8');

                    // Set the previous line hash for subsequent entries
                    previousLineHash = entryHash;
                } else {
                    // Initialize the previous line hash
                    previousLineHash = '';
                }
            });
        } catch (error) {
            console.error(`Error initializing audit file for ${today}:`, error);
        }
    }

    // Function to check if the day has changed and we need a new file
    function checkAndUpdateDay() {
        const today = new Date().toISOString().split('T')[0];
        if (today !== currentDate) {
            // Day has changed, update the current date
            currentDate = today;
            // Reset the previous line hash for the new day
            previousLineHash = '';
            // Initialize the new day's file
            initDayAuditFile();
            return true;
        }
        return false;
    }

    // Set up a daily check at midnight
    setupDailyCheck();

    function setupDailyCheck() {
        // Calculate time until next midnight
        function getMillisecondsUntilMidnight() {
            const now = new Date();
            const midnight = new Date(now);
            midnight.setHours(24, 0, 0, 0);
            return midnight.getTime() - now.getTime();
        }

        // Set timeout for midnight
        const msUntilMidnight = getMillisecondsUntilMidnight();
        setTimeout(() => {
            // Check and update day at midnight
            checkAndUpdateDay();
            // Recursively setup for next day
            setupDailyCheck();
        }, msUntilMidnight);
    }

    function makeCSVCompliant(input) {
        // Replace semicolons with commas
        let output = input.replace(/;/g, ',');

        // Check if the string contains commas, double quotes, or newlines
        if (/[,"\n]/.test(output)) {
            // Escape double quotes by doubling them
            output = output.replace(/"/g, '""');
            // Enclose the string in double quotes
            output = `"${output}"`;
        }

        return output;
    }

    async function calculateHash(data) {
        return await cryptoUtils.sha256Base64(data);
    }

    async function generateLineHash(line, prevHash) {
        return await cryptoUtils.sha256Base64(prevHash + line);
    }

    async function prepareAuditEntry(auditType, details) {
        const timestamp = makeCSVCompliant(new Date().toISOString());
        auditType = makeCSVCompliant(auditType);

        const formattedDetails = Array.isArray(details)
            ? makeCSVCompliant(details.join(" "))
            : makeCSVCompliant(details);

        let entryContent = `[${timestamp}]; ${auditType.trim()}; ${formattedDetails.trim()};`;
        const currentLineHash = await calculateHash(entryContent);
        const lineHash = await generateLineHash(currentLineHash, previousLineHash);
        entryContent = `${lineHash}; [${timestamp}]; ${auditType.trim()}; ${formattedDetails.trim()};`;
        previousLineHash = lineHash;

        return {
            timestamp,
            entryContent
        };
    }

    this.audit = async function (auditType, details) {
        checkAndUpdateDay();
        const entry = await prepareAuditEntry(auditType, details);
        auditBuffer.push(entry.entryContent);

        if (!auditTimer) {
            auditTimer = setTimeout(() => this.auditFlush(), flushInterval);
        }
    }

    this.log = function (forUser, details) {
        // if (arguments.length > 2) {
        //     throw new Error("log() only takes two arguments: forUser and details");
        // }
        forUser = makeCSVCompliant(forUser);
        const timestamp = makeCSVCompliant(new Date().toISOString());
        const formattedDetails = Array.isArray(details)
            ? makeCSVCompliant(details.join(" "))
            : makeCSVCompliant(details);
        const entryContent = `[${timestamp}]; ${forUser.trim()}; ${formattedDetails.trim()};`;
        const entry = {
            timestamp,
            entryContent,
            userEntry: `[${timestamp}]; ${formattedDetails.trim()};`
        };

        buffer.push(entry.entryContent);
        usersBuffer[forUser] = usersBuffer[forUser] || [];
        usersBuffer[forUser].push(entry.userEntry);

        if (!logsTimer) {
            logsTimer = setTimeout(() => this.flush(), flushInterval);
        }
    };

    async function appendFile(filePath, logData) {
        try {
            await fs.appendFile(filePath, logData, 'utf8');
        } catch (error) {
            console.error('Error writing to log file:', error);
        }
    }

    let duringLogFlush = false;
    let duringAuditFlush = false;

    this.auditFlush = async function () {
        if (duringAuditFlush) {
            return;
        }
        duringAuditFlush = true;

        // Handle audit logs
        if (auditBuffer.length !== 0) {
            const auditFileName = getAuditLogFileName();
            // Capture the current buffer and reset it immediately to avoid data loss
            const currentAuditBuffer = [...auditBuffer];
            auditBuffer = [];
            const auditData = currentAuditBuffer.join('\n') + '\n';
            await appendFile(auditFileName, auditData);
        }

        auditTimer = undefined;
        duringAuditFlush = false;
    };

    this.flush = async function () {
        if (duringLogFlush) {
            return;
        }
        duringLogFlush = true;

        // Handle regular logs
        if (buffer.length !== 0) {
            const fileName = getLogFileName();
            const currentBuffer = [...buffer];
            buffer = [];
            const logData = currentBuffer.join('\n') + '\n';
            await appendFile(fileName, logData);
        }

        // Handle user logs
        const currentUsersBuffer = {...usersBuffer};
        usersBuffer = {};

        for (const user in currentUsersBuffer) {
            const fileName = getLogFileNameForUser(user);
            const logData = currentUsersBuffer[user].join('\n') + '\n';
            await appendFile(fileName, logData);
        }

        logsTimer = undefined;
        duringLogFlush = false;
    };

    this.getUserLogs = async function (userID) {
        const fileName = getLogFileNameForUser(userID);
        try {
            if (duringLogFlush) {
                await new Promise(resolve => setTimeout(resolve, flushInterval));
            } else {
                await this.flush();
            }
            return await fs.readFile(fileName, 'utf8');
        } catch (error) {
            console.error('Error reading user log file:', error);
            return 'No logs available';
        }
    }

    // New method to get audit logs for a specific date
    this.getAuditLogs = async function (date) {
        try {
            // Ensure any pending audit entries are written
            if (duringAuditFlush) {
                await new Promise(resolve => setTimeout(resolve, flushInterval));
            } else {
                await this.auditFlush();
            }

            const defaultDate = new Date().toISOString().split('T')[0];
            const dateStr = !date ? defaultDate :
                typeof date === 'string' ? date :
                    date.toISOString().split('T')[0];

            const auditFileName = path.join(auditDir, `audit_${dateStr}.log`);

            return await fs.readFile(auditFileName, 'utf8');
        } catch (error) {
            console.error(`Error reading audit file for date ${date}:`, error);
            return `No audit data available for ${date || 'specified date'}`;
        }
    }

    // New method to list available audit dates and their info
    this.listAuditFiles = async function () {
        try {
            await this.flush();
            const files = await fs.readdir(auditDir);

            // Filter and process only audit log files
            const auditFiles = [];
            for (const file of files) {
                if (file.startsWith('audit_') && file.endsWith('.log')) {
                    const dateStr = file.replace('audit_', '').replace('.log', '');
                    const filePath = path.join(auditDir, file);

                    try {
                        const content = await fs.readFile(filePath, 'utf8');
                        const lines = content.split('\n').filter(line => line.trim() !== '');
                        const hash = await cryptoUtils.sha256Base64(content);

                        auditFiles.push({
                            date: dateStr,
                            hash: hash,
                            entriesCount: lines.length,
                            filePath: filePath
                        });
                    } catch (error) {
                        console.error(`Error processing audit file ${filePath}:`, error);
                        auditFiles.push({
                            date: dateStr,
                            hash: 'Error',
                            entriesCount: 0,
                            filePath: filePath
                        });
                    }
                }
            }

            // Sort by date (newest first)
            return auditFiles.sort((a, b) => b.date.localeCompare(a.date));
        } catch (error) {
            console.error('Error listing audit files:', error);
            return [];
        }
    }

    this.listAuditDates = async function () {
        try {
            await this.flush();
            const files = await fs.readdir(auditDir);
            const result = {};
            for (const file of files) {
                if (file.startsWith('audit_') && file.endsWith('.log')) {
                    const dateStr = file.replace('audit_', '').replace('.log', '');
                    const [year, month, day] = dateStr.split('-');
                    if (!result[year]) result[year] = {};
                    if (!result[year][month]) {
                        result[year][month] = [];
                    }
                    if (!result[year][month].find((item) => item === day)) {
                        result[year][month].push(day);
                    }
                }
            }
            return result;
        } catch (error) {
            console.error('Error listing audit dates:', error);
            return [];
        }
    }

    process.on('exit', async () => {
        await this.flush();
        await this.auditFlush();
    });

    process.on('SIGINT', async () => {
        await this.flush();
        await this.auditFlush();
    });
}

module.exports = {
    getSystemAudit: function (flushInterval, logDir, auditDir) {
        return new SystemAudit(flushInterval, logDir, auditDir);
    }
}


