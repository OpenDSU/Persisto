const fs = require('fs').promises;
const path = require('path');
const cryptoUtils = require('./cryptoUtils.cjs');
const AUDIT_EVENTS = require("./AuditEvents.cjs");
const SYSLOG_EVENTS = require("./SyslogEvents.cjs");
const {getShortName} = require("../persistence/utils.cjs");

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

    let auditProcessingPromise = Promise.resolve();

    async function initDayAuditFile() {
        const today = new Date().toISOString().split('T')[0];
        const auditFilePath = path.join(auditDir, `audit_${today}.log`);
        let fileExists = false;

        try {
            await fs.access(auditFilePath);
            fileExists = true;
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`Error checking existence of audit file for ${today}:`, error);
                return; // Cannot proceed if access check fails for unknown reasons
            }
            // ENOENT means file does not exist, which is expected for a new day's file.
            fileExists = false;
        }

        if (!fileExists) {
            // File for today does not exist, so we create it.
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            const yesterdayFilePath = path.join(auditDir, `audit_${yesterdayStr}.log`);

            let lastHashFromPreviousDay = '';
            try {
                const content = await fs.readFile(yesterdayFilePath, 'utf8');
                const lines = content.split('\n').filter(line => line.trim() !== '');

                if (lines.length > 0) {
                    // Get the last line and extract the hash (first part before semicolon)
                    const lastLine = lines[lines.length - 1];
                    const parts = lastLine.split('; ');
                    if (parts.length > 0) {
                        lastHashFromPreviousDay = parts[0];
                        console.log(`[AUDIT_DEBUG] initDayAuditFile: Extracted last hash from previous day: ${lastHashFromPreviousDay}`);
                    }
                }
            } catch (err) {
                if (err.code === 'ENOENT') {
                    console.log(`No previous day file (${yesterdayStr}) found. Starting new chain.`);
                } else {
                    console.log(`Error reading previous day file (${yesterdayStr}): ${err.message}. Starting new chain.`);
                }
            }

            if (lastHashFromPreviousDay) {
                // Create a proper audit entry for the previous day reference
                const referenceDetails = `Reference to previous day: ${lastHashFromPreviousDay}`;
                const referenceContent = `REFERENCE; ${referenceDetails};`;
                const referenceContentHash = await cryptoUtils.sha256Base58(referenceContent);
                const referenceLineHash = await cryptoUtils.sha256Base58(lastHashFromPreviousDay + referenceContentHash);
                const timestamp = new Date().toISOString();
                const referenceEntry = `${referenceLineHash}; [${timestamp}]; REFERENCE; ${referenceDetails};\n`;

                await fs.writeFile(auditFilePath, referenceEntry, 'utf8');
                previousLineHash = referenceLineHash;
                console.log(`[AUDIT_DEBUG] initDayAuditFile (new file for ${today}): Created reference entry with hash: ${referenceLineHash}`);
            } else {
                await fs.writeFile(auditFilePath, '', 'utf8'); // Start with an empty file if no prev hash
                previousLineHash = '';
                console.log(`[AUDIT_DEBUG] initDayAuditFile (new file for ${today}): previousLineHash reset (no yesterday hash): ${previousLineHash}`);
            }
        } else {
            console.log(`[AUDIT_DEBUG] initDayAuditFile (file for ${today} already existed). Attempting to load last hash.`);
            try {
                const content = await fs.readFile(auditFilePath, 'utf8');
                const lines = content.split('\n').filter(line => line.trim() !== '');

                if (lines.length > 0) {
                    const lastLine = lines[lines.length - 1];
                    const parts = lastLine.split('; ');
                    previousLineHash = parts[0];
                    console.log(`[AUDIT_DEBUG] initDayAuditFile (existing file ${today}): previousLineHash set from last line: ${previousLineHash}`);
                } else {
                    previousLineHash = '';
                    console.log(`[AUDIT_DEBUG] initDayAuditFile (existing file ${today} was empty): previousLineHash set to empty.`);
                }
            } catch (readError) {
                console.error(`Error reading existing audit file ${auditFilePath} to determine previousLineHash:`, readError);
                console.log(`[AUDIT_DEBUG] initDayAuditFile (existing file ${today} - error reading): previousLineHash not changed due to read error. Current value: ${previousLineHash}`);
            }
        }
    }

    async function checkAndUpdateDay() {
        const today = new Date().toISOString().split('T')[0];
        if (today !== currentDate) {
            console.log(`[AUDIT_DEBUG] checkAndUpdateDay: Day changed! From ${currentDate} to ${today}. Resetting previousLineHash.`);
            currentDate = today;
            previousLineHash = ''; // Reset for the new day *before* initDayAuditFile
            await initDayAuditFile(); // This will set previousLineHash based on yesterday's file if it's a new file
            return true;
        }

        // Even if day hasn't changed, verify sync when buffer is empty
        await verifyPreviousHashSync();
        return false;
    }

    // INITIALIZATION CHAIN: Ensure directories exist and initial audit file is ready.
    auditProcessingPromise = auditProcessingPromise.then(async () => {
        await fs.mkdir(logDir, {recursive: true});
        await fs.mkdir(auditDir, {recursive: true});
        await initDayAuditFile(); // Sets up previousLineHash for the first time

        await verifyPreviousHashSync();

        if (!auditTimer) {
            auditTimer = setInterval(() => this.auditFlush(), flushInterval);
            console.log('[AUDIT_DEBUG] Started continuous audit timer for daily file creation');
        }
    }).catch(err => {
        console.error("Critical error during SystemAudit initial setup (mkdir or initDayAuditFile):", err);
        // This instance might be in a bad state.
    });

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
        return await cryptoUtils.sha256Base58(data);
    }

    async function generateLineHash(line, prevHash) {
        return await cryptoUtils.sha256Base58(prevHash + line);
    }

    async function prepareAuditEntry(auditType, details) {
        const timestamp = makeCSVCompliant(new Date().toISOString());
        auditType = makeCSVCompliant(auditType);
        if (details.userID) {
            details.userID = getShortName(details.userID, details.userID[0])
        }
        if (details.fromID) {
            details.fromID = details.fromID === "system" ? details.fromID : getShortName(details.fromID, details.fromID[0])
        }
        if (details.toID) {
            details.toID = details.toID === "system" ? details.toID : getShortName(details.toID, details.toID[0])
        }
        const formattedDetails = Array.isArray(details)
            ? makeCSVCompliant(details.join(" "))
            : JSON.stringify(details);

        // The content whose hash is chained with the previous line's hash
        let entryContentForChaining = `${auditType.trim()}; ${formattedDetails.trim()};`;
        const currentEntryContentHash = await calculateHash(entryContentForChaining);
        // The actual line hash, chained with the previous line's hash
        console.log(`[AUDIT_DEBUG] prepareAuditEntry (before generateLineHash for type ${auditType}): Using previousLineHash: ${previousLineHash}`);
        const lineHash = await generateLineHash(currentEntryContentHash, previousLineHash);

        // The full line to be written to the audit log
        let hashEntry = `${lineHash}; [${timestamp}]; ${auditType.trim()}; ${formattedDetails.trim()};`;
        previousLineHash = lineHash; // CRITICAL: Update previousLineHash *after* new hash is generated
        console.log(`[AUDIT_DEBUG] prepareAuditEntry (after lineHash generated for type ${auditType}): previousLineHash updated to: ${previousLineHash}`);

        return {
            timestamp, // Not directly used in hashEntry but kept for consistency
            entryContent: entryContentForChaining, // The content that was hashed (without timestamp/linehash)
            hashEntry // The full line for the log file
        };
    }

    // Helper function to verify and sync previousLineHash with file state
    async function verifyPreviousHashSync() {
        // Only verify when buffer is empty (no pending writes)
        if (auditBuffer.length > 0) {
            return; // Buffer has pending entries, memory state is expected to be ahead
        }

        try {
            const auditFilePath = getAuditLogFileName();
            const content = await fs.readFile(auditFilePath, 'utf8');
            const lines = content.split('\n').filter(line => line.trim() !== '');

            let fileLastHash = '';
            if (lines.length > 0) {
                const lastLine = lines[lines.length - 1];
                const parts = lastLine.split('; ');
                if (parts.length > 0) {
                    fileLastHash = parts[0];
                }
            }

            if (previousLineHash !== fileLastHash) {
                console.log(`[AUDIT_SYNC] Memory/file hash mismatch detected. Memory: ${previousLineHash}, File: ${fileLastHash}. Syncing to file state.`);
                previousLineHash = fileLastHash;
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('[AUDIT_SYNC] Error verifying hash sync:', error);
            }
            // If file doesn't exist, memory state is likely correct
        }
    }

    this.auditLog = function (auditType, details) { // Outer function can remain synchronous
        auditProcessingPromise = auditProcessingPromise.then(async () => {
            await checkAndUpdateDay(); // Ensures day change is handled and previousLineHash is correct for the day

            // Verify memory/file sync when buffer is empty (safety check)
            await verifyPreviousHashSync();

            const entry = await prepareAuditEntry(auditType, details); // This reads and then updates previousLineHash
            auditBuffer.push(entry.hashEntry);
        }).catch(err => {
            console.error("Error in serialized audit processing chain (auditLog):", err);
            // Depending on the error, previousLineHash might be in an inconsistent state.
            // For now, just log. The chain continues with the next operation.
        });
    };

    this.systemLog = function (eventType, details) {
        const timestamp = makeCSVCompliant(new Date().toISOString());
        eventType = makeCSVCompliant(eventType);

        const entryContent = `[${timestamp}];  ${eventType.trim()}; ${JSON.stringify(details)};`;
        buffer.push(entryContent);

        if (!logsTimer) {
            logsTimer = setInterval(() => this.flush(), flushInterval);
        }
    }

    this.userLog = function (userID, log) {
        let forUser = makeCSVCompliant(userID);
        const timestamp = makeCSVCompliant(new Date().toISOString());

        usersBuffer[forUser] = usersBuffer[forUser] || [];
        usersBuffer[forUser].push(`[${timestamp}]; ${log.trim()};`);
        if (!logsTimer) {
            logsTimer = setInterval(() => this.flush(), flushInterval);
        }
    };

    this.smartLog = async function (eventType, details) {
        let auditDetails;
        let userDetails;
        switch (eventType) {
            case AUDIT_EVENTS.TRANSFER:
            case AUDIT_EVENTS.TRANSFER_LOCKED:
                this.auditLog(AUDIT_EVENTS[eventType], details);
                this.systemLog(AUDIT_EVENTS[eventType], details);
                    this.userLog(details.toID, details.userLogToID || `You have received ${details.amount} ${details.amount === 1 ? 'point' : 'points'} ${details.reason}`);
                this.userLog(details.fromID, details.userLogFromID || `You have transferred ${details.amount} ${details.amount === 1 ? 'point' : 'points'} ${details.reason}`);
                break;
            case AUDIT_EVENTS.MINT:
                this.auditLog(AUDIT_EVENTS[eventType], details);
                this.systemLog(AUDIT_EVENTS[eventType], details);
                break;
            case AUDIT_EVENTS.PASSKEY_REGISTER:
                this.auditLog(AUDIT_EVENTS[eventType], details);
                this.systemLog(AUDIT_EVENTS[eventType], details);
                break;
            case AUDIT_EVENTS.PASSKEY_DELETE:
                this.auditLog(AUDIT_EVENTS[eventType], details);
                this.systemLog(AUDIT_EVENTS[eventType], details);
                break;
            case AUDIT_EVENTS.LOCK:
            case AUDIT_EVENTS.UNLOCK:
                if (typeof details.reason === "object" && details.reason["auditLogReason"]) {
                    auditDetails = JSON.parse(JSON.stringify(details));
                    auditDetails.reason = details.reason.auditLogReason;
                } else {
                    auditDetails = details;
                }
                if (typeof details.reason === "object" && details.reason["userLogReason"]) {
                    userDetails = JSON.parse(JSON.stringify(details));
                    userDetails.reason = details.reason.userLogReason;
                } else {
                    userDetails = details;
                }
                this.auditLog(AUDIT_EVENTS[eventType], auditDetails);
                this.userLog(details.userID, `${details.amount} ${details.amount === 1 ? 'point' : 'points'} ${userDetails.reason}`);
                this.systemLog(AUDIT_EVENTS[eventType], auditDetails);
                break;
            case SYSLOG_EVENTS.INVITE_SENT:
                this.userLog(details.userID, `You have sent an invite to ${details.email}`);
                this.systemLog(SYSLOG_EVENTS[eventType], details);
                break;
            case AUDIT_EVENTS.REWARD:
                this.userLog(details.userID, `You have received ${details.amount} ${details.amount === 1 ? 'point' : 'points'} ${details.reason}`);
                this.systemLog(AUDIT_EVENTS[eventType], details);
                break;
            case AUDIT_EVENTS.CONFISCATE_LOCKED:
                this.auditLog(AUDIT_EVENTS[eventType], details);
                this.userLog(details.userID, `${details.amount} ${details.amount === 1 ? 'point' : 'points'} have been confiscated because ${details.reason}`);
                this.systemLog(AUDIT_EVENTS[eventType], details);
                break;
            default:
                this.systemLog(SYSLOG_EVENTS[eventType], details);
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

        await checkAndUpdateDay();

        // Handle audit logs
        if (auditBuffer.length !== 0) {
            const auditFileName = getAuditLogFileName();
            // Capture the current buffer and reset it immediately to avoid data loss
            const currentAuditBuffer = [...auditBuffer];
            auditBuffer = [];
            const auditData = currentAuditBuffer.join('\n') + '\n';
            await appendFile(auditFileName, auditData);
        }

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

        const hasUserLogs = Object.keys(currentUsersBuffer).length > 0;

        for (const user in currentUsersBuffer) {
            const fileName = getLogFileNameForUser(user);
            const logData = currentUsersBuffer[user].join('\n') + '\n';
            await appendFile(fileName, logData);
        }

        // If there's nothing to flush, clear the interval
        if (buffer.length === 0 && !hasUserLogs) {
            if (logsTimer) {
                clearInterval(logsTimer);
                logsTimer = null;
            }
        }

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
                        const hash = await cryptoUtils.sha256Base58(content);

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
        // Clear intervals
        if (logsTimer) {
            clearInterval(logsTimer);
        }
        if (auditTimer) {
            clearInterval(auditTimer);
        }

        await this.flush(); // Ensure logs are flushed
        await this.auditFlush();
    });

    process.on('SIGINT', async () => {
        // Clear intervals
        if (logsTimer) {
            clearInterval(logsTimer);
        }
        if (auditTimer) {
            clearInterval(auditTimer);
        }

        await this.flush();
        // Similar to 'exit', robustly awaiting all pending audit ops could be added.
        // await auditProcessingPromise;
        await this.auditFlush();
        // process.exit(); // Typically, SIGINT handlers call process.exit if they are done.
    });

    this.TEST_ONLY_awaitAuditProcessingCompletion = async function () {
        // This returns a new promise that effectively waits for the current tail of auditProcessingPromise.
        return auditProcessingPromise.then(() => {
        });
    };
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


