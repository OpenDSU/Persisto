const fs = require('fs').promises;
const path = require('path');
const cryptoUtils = require('./cryptoUtils.cjs');
const AUDIT_EVENTS = require("./AuditEvents.cjs");

function SystemAudit(flushInterval = 1, logDir, auditDir) {
    if (!logDir) {
        if (process.env.LOGS_FOLDER === undefined) {
            console.log("LOGS_FOLDER environment variable is not set. Please set it to the path where the logs should be stored. Defaults to './logs/'");
            process.env.LOGS_FOLDER = "./logs/"
        }
        logDir = process.env.LOGS_FOLDER;
    }
    if (!auditDir) {
        if (process.env.AUDIT_FOLDER === undefined) {
            console.log("AUDIT_FOLDER environment variable is not set. Please set it to the path where the audit logs should be stored. Defaults to './audit/'");
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

    fs.mkdir(logDir, { recursive: true }).catch(console.error);
    fs.mkdir(auditDir, { recursive: true }).catch(console.error);
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
                // File for today does not exist, so we create it.
                // Calculate yesterday's date
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];
                const yesterdayFilePath = path.join(auditDir, `audit_${yesterdayStr}.log`);

                // Check if yesterday's file exists and get its content hash
                let previousFileContentHash = '';
                try {
                    await fs.access(yesterdayFilePath); // Check if yesterday's file exists
                    const content = await fs.readFile(yesterdayFilePath, 'utf8');
                    // If content is an empty string, cryptoUtils.sha256Base64 should still produce a valid hash.
                    // We only proceed if content could be read.
                    previousFileContentHash = await cryptoUtils.sha256Base64(content);
                } catch (err) {
                    // Yesterday's file doesn't exist, or there was an error reading/hashing it.
                    console.log(`No previous day file (${yesterdayStr}) found or error processing it. Starting new chain. Error: ${err.message}`);
                    // previousFileContentHash remains ''
                }

                // Initialize the new day's audit file
                if (previousFileContentHash) {
                    // Write the hash of the previous file's content as the first line
                    await fs.writeFile(auditFilePath, previousFileContentHash + '\n', 'utf8');
                    // Set the previousLineHash for the first *actual* audit entry to be this hash
                    previousLineHash = previousFileContentHash;
                } else {
                    // No valid previous file hash (e.g., file didn't exist, was empty and hashing empty gave '', or read error),
                    // so start the new audit file empty.
                    await fs.writeFile(auditFilePath, '', 'utf8');
                    // And initialize previousLineHash to empty for the first actual audit entry.
                    previousLineHash = '';
                }
            });
            // If fs.access(auditFilePath) succeeded, the file already exists.
            // The current logic does not re-load previousLineHash from an existing file here.
            // This change focuses only on new file creation as per the request.
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
            : JSON.stringify(details);

        let entryContent = `${auditType.trim()}; ${formattedDetails.trim()};`;
        const currentLineHash = await calculateHash(entryContent);
        const lineHash = await generateLineHash(currentLineHash, previousLineHash);
        let hashEntry = `${lineHash}; [${timestamp}]; ${auditType.trim()}; ${formattedDetails.trim()};`;
        previousLineHash = lineHash;

        return {
            timestamp,
            entryContent,
            hashEntry
        };
    }

    this.auditLog = async function (auditType, details) {
        checkAndUpdateDay();
        const entry = await prepareAuditEntry(auditType, details);
        auditBuffer.push(entry.hashEntry);

        if (!auditTimer) {
            auditTimer = setTimeout(() => this.auditFlush(), flushInterval);
        }
    }

    this.systemLog = function (eventType, details) {
        const timestamp = makeCSVCompliant(new Date().toISOString());
        eventType = makeCSVCompliant(eventType);

        const entryContent = `[${timestamp}];  ${eventType.trim()}; ${JSON.stringify(details)};`;
        buffer.push(entryContent);

        if (!logsTimer) {
            logsTimer = setTimeout(() => this.flush(), flushInterval);
        }
    }

    this.userLog = function (userID, log) {
        // if (arguments.length > 2) {
        //     throw new Error("log() only takes two arguments: forUser and details");
        // }
        let forUser = makeCSVCompliant(userID);
        const timestamp = makeCSVCompliant(new Date().toISOString());
        /*const formattedDetails = Array.isArray(details)
            ? makeCSVCompliant(details.join(" "))
            : makeCSVCompliant(details);*/

        usersBuffer[forUser] = usersBuffer[forUser] || [];
        usersBuffer[forUser].push(`[${timestamp}]; ${log.trim()};`);
        if (!logsTimer) {
            logsTimer = setTimeout(() => this.flush(), flushInterval);
        }
    };

    this.smartLog = async function (eventType, details) {
        switch (eventType) {
            case AUDIT_EVENTS.TRANSFER:
            case AUDIT_EVENTS.TRANSFER_LOCKED:
            case AUDIT_EVENTS.MINT:
                await this.auditLog(AUDIT_EVENTS[eventType], details);
                this.systemLog(AUDIT_EVENTS[eventType], details);
                break;
            case AUDIT_EVENTS.PASSKEY_REGISTER:
                this.auditLog(AUDIT_EVENTS[eventType], { publicKey: details.publicKey });
                this.systemLog(AUDIT_EVENTS[eventType], details);
                break;
            case AUDIT_EVENTS.LOCK:
            case AUDIT_EVENTS.UNLOCK:
                this.auditLog(AUDIT_EVENTS[eventType], details);
                this.userLog(details.userID, `${details.amount} points ${details.reason}`);
                this.systemLog(AUDIT_EVENTS[eventType], details);
                break;
            case AUDIT_EVENTS.INVITE_SENT:
                this.userLog(details.userID, `You have sent an invite to ${details.email}`);
                break;
            case AUDIT_EVENTS.REWARD:
                this.userLog(details.userID, `You have received ${details.amount} points ${details.reason}`);
                this.systemLog(AUDIT_EVENTS[eventType], details);
                break;
            case AUDIT_EVENTS.CONFISCATE_LOCKED:
                await this.auditLog(AUDIT_EVENTS[eventType], details);
                this.userLog(details.userID, `${details.amount} points  have been confiscated because ${details.reason}`);
                this.systemLog(AUDIT_EVENTS[eventType], details);
                break;
            default:
                this.systemLog(AUDIT_EVENTS[eventType], details);
        }
    }

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
        const currentUsersBuffer = { ...usersBuffer };
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

let systemAudit = null;
module.exports = {
    getSystemAudit: function (flushInterval, logDir, auditDir) {
        if (!systemAudit) {
            systemAudit = new SystemAudit(flushInterval, logDir, auditDir);
        }
        return systemAudit;
    }
}


