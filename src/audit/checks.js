// loading strategy is a function that loads the audit logs
// the code in checks.js will run in browser, but for testing purposes, we can use a different strategy
// for example, we can use a function that loads the audit logs from a file
const { sha256Base64 } = require('./cryptoUtils.cjs');
// Helper function to verify a single entry's hash
const verifyEntryHash = async (entry, previousHash = '') => {
    if (!entry || entry.trim() === '') {
        return { valid: true, entry: null };
    }

    // Parse the entry - format is: hash; [timestamp]; auditType; details;
    const parts = entry.split('; ');
    if (parts.length < 4) {
        return { valid: false, entry, error: 'Invalid entry format' };
    }

    const storedHash = parts[0];
    // Skip the timestamp (parts[1]) and just use the audit type and details for content hash
    const auditType = parts[2].trim();

    // Get the details part and ensure we don't add extra semicolons
    let details = parts.slice(3).join('; ');
    // Remove the trailing semicolon if it exists
    if (details.endsWith(';')) {
        details = details.substring(0, details.length - 1);
    }

    details = details.trim();
    // Construct the entry content to match how it was originally created in SystemAudit.cjs
    const entryContent = `${auditType}; ${details};`;

    // Calculate hash for entry content - matches calculateHash function in SystemAudit.cjs
    const contentHash = await sha256Base64(entryContent);

    // Calculate line hash by combining with previous hash
    // This matches generateLineHash function in SystemAudit.cjs
    const calculatedHash = await sha256Base64(previousHash + contentHash);
    return {
        valid: storedHash === calculatedHash,
        entry,
        storedHash,
        calculatedHash,
        previousHash
    };
};

// Helper function to extract timestamp from an entry
const extractTimestamp = (entry) => {
    const parts = entry.split('; ');
    if (parts.length < 2) return null;

    // Extract timestamp from format: [YYYY-MM-DDTHH:MM:SS.sssZ]
    const timestampMatch = parts[1].match(/\[(.*?)\]/);
    return timestampMatch ? new Date(timestampMatch[1]).getTime() : 0;
};

// Helper function to sort entries by timestamp
const sortEntriesByTimestamp = (entries) => {
    return [...entries].sort((a, b) => {
        const timestampA = extractTimestamp(a);
        const timestampB = extractTimestamp(b);
        return timestampA - timestampB;
    });
};

// Helper function to verify a collection of entries
const verifyEntryCollection = async (entries, initialPreviousHash = '') => {
    if (!entries || entries.length === 0) {
        return { valid: true, entries: [], results: [] };
    }

    // Sort entries by timestamp to ensure proper hash chain verification
    const sortedEntries = sortEntriesByTimestamp(entries);

    let previousHash = initialPreviousHash; // Use provided initialPreviousHash
    const results = [];
    let allValid = true;

    for (const entry of sortedEntries) {
        const result = await verifyEntryHash(entry, previousHash);
        if (!result.valid) {
            allValid = false;
        }
        results.push(result);

        // Update previousHash for next entry with the stored hash
        // This is important for the chain to work correctly
        previousHash = result.storedHash;
    }

    return {
        valid: allValid,
        entries: sortedEntries,
        results
    };
};

// Helper function to check if an entry is a previous file hash reference
/*
const isPrevFileHashEntry = (entry) => {
    return entry && entry.includes('SYSTEM; PREV_FILE_HASH;');
};

// Helper function to extract the previous file hash from an entry
const extractPrevFileHash = (entry) => {
    if (!isPrevFileHashEntry(entry)) return null;

    const parts = entry.split('; ');
    // Format should be: hash; [timestamp]; SYSTEM; PREV_FILE_HASH; actualHash;
    const prevHashIndex = parts.findIndex(part => part === 'PREV_FILE_HASH') + 1;

    return prevHashIndex < parts.length ? parts[prevHashIndex] : null;
};
*/

// Function to verify cross-file hash chain
const verifyFileHashChain = async (loadingStrategy) => {
    const auditLogs = await loadingStrategy.getAllAuditLogs(); // Expects { year: { month: { day: { hash, previousDayContentHash, entries } } } }
    const results = {
        valid: true,
        fileChainResults: []
    };

    // Get all dates in chronological order
    const allDates = [];
    for (const year in auditLogs) {
        for (const month in auditLogs[year]) {
            for (const day in auditLogs[year][month]) {
                allDates.push({
                    year,
                    month,
                    day,
                    date: `${year}-${month}-${day}`
                });
            }
        }
    }

    // Sort dates chronologically (oldest first)
    allDates.sort((a, b) => a.date.localeCompare(b.date));

    let actualHashOfPreviousDayFileContent = null; // Stores the full hash of the previous day's file content

    for (const dateInfo of allDates) {
        const { year, month, day, date } = dateInfo;
        const currentDayData = auditLogs[year][month][day];

        const declaredPrevHashInCurrentFile = currentDayData.previousDayContentHash;
        const currentDayFileHash = currentDayData.hash; // Full hash of the current day's file

        const fileHashResult = {
            date,
            declaredPrevHashInCurrentFile,
            actualHashOfPreviousDayFileContent: null, // Will be populated if not the first file
            hashesMatch: null // Will be populated if not the first file
        };

        if (actualHashOfPreviousDayFileContent !== null) {
            // This is not the first file in the chain, so we expect a match
            fileHashResult.actualHashOfPreviousDayFileContent = actualHashOfPreviousDayFileContent;
            fileHashResult.hashesMatch = declaredPrevHashInCurrentFile === actualHashOfPreviousDayFileContent;

            if (!fileHashResult.hashesMatch) {
                results.valid = false;
            }
        } else {
            // This is the first file in the (sorted) sequence.
            // There's no preceding file in this batch to compare its hash against.
            fileHashResult.isFirstFile = true;
            // If declaredPrevHashInCurrentFile is not empty for the very first file, it might indicate
            // a chain starting from a known hash or an anomaly. For now, just note its presence.
            // The validity here depends on the system's rules for the very first audit file ever.
            // If it *must* be empty, then results.valid might be set to false here if declaredPrevHashInCurrentFile is not empty.
            // Current logic: if it's the first file, we don't fail it based on declaredPrevHashInCurrentFile.
            // The chain's integrity starts from the *next* file.
        }

        results.fileChainResults.push(fileHashResult);

        // The current file's actual hash becomes the one to check against for the next day.
        actualHashOfPreviousDayFileContent = currentDayFileHash;
    }

    return results;
};

const checkAllHashes = async (loadingStrategy) => {
    const auditLogs = await loadingStrategy.getAllAuditLogs();
    const results = {};

    // Process each year
    for (const year in auditLogs) {
        results[year] = {};

        // Process each month
        for (const month in auditLogs[year]) {
            results[year][month] = {};

            // Process each day
            for (const day in auditLogs[year][month]) {
                const dayData = auditLogs[year][month][day];
                results[year][month][day] = await verifyEntryCollection(dayData.entries, dayData.previousDayContentHash);
            }
        }
    }

    return results;
}

const checkHashForYear = async (year, loadingStrategy) => {
    const auditLogs = await loadingStrategy.getAuditLogsForYear(year);
    const results = {};

    // Process each month in the year
    for (const month in auditLogs) {
        results[month] = {};

        // Process each day in the month
        for (const day in auditLogs[month]) {
            const dayData = auditLogs[month][day];
            results[month][day] = await verifyEntryCollection(dayData.entries, dayData.previousDayContentHash);
        }
    }

    return results;
}

const checkHashForMonth = async (year, month, loadingStrategy) => {
    const auditLogs = await loadingStrategy.getAuditLogsForMonth(year, month);
    const results = {};

    // Process each day in the month
    for (const day in auditLogs) {
        const dayData = auditLogs[day];
        results[day] = await verifyEntryCollection(dayData.entries, dayData.previousDayContentHash);
    }

    return results;
}

const checkHashForDay = async (year, month, day, loadingStrategy) => {
    const auditLog = await loadingStrategy.getAuditLogsForDay(year, month, day);
    // The first line (previousDayContentHash) is already handled by verifyFileHashChain.
    // verifyEntryCollection should check the integrity of the day's actual entries.
    // The `previousHash` for the first *actual* entry in a day's log should be the `previousDayContentHash`
    // which was recorded as the first line in the file.
    return await verifyEntryCollection(auditLog.entries, auditLog.previousDayContentHash);
}
module.exports = {
    checkAllHashes,
    checkHashForYear,
    checkHashForMonth,
    checkHashForDay,
    verifyFileHashChain
};
