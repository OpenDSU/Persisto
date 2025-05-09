// loading strategy is a function that loads the audit logs
// the code in checks.js will run in browser, but for testing purposes, we can use a different strategy
// for example, we can use a function that loads the audit logs from a file
const cryptoUtils = require('./cryptoUtils.cjs');
// Helper function to verify a single entry's hash
const verifyEntryHash = async (entry, previousHash = '') => {
    if (!entry || entry.trim() === '') {
        return { valid: true, entry: null };
    }

    // Parse the entry - format is: hash; [timestamp]; auditType; details;
    const parts = entry.split('; ');
    if (parts.length < 4) {
        console.log('Invalid entry format, parts:', parts);
        return { valid: false, entry, error: 'Invalid entry format' };
    }

    const storedHash = parts[0];
    // Skip the timestamp (parts[1]) and just use the audit type and details for content hash
    const auditType = parts[2];

    // Get the details part and ensure we don't add extra semicolons
    let details = parts.slice(3).join('; ');
    // Remove the trailing semicolon if it exists
    if (details.endsWith(';')) {
        details = details.substring(0, details.length - 1);
    }

    // Construct the entry content to match how it was originally created
    const entryContent = `${auditType}; ${details};`;

    console.log('DEBUG Entry:', entry.substring(0, 50) + '...');
    console.log('DEBUG Stored Hash:', storedHash);
    console.log('DEBUG Previous Hash:', previousHash);
    console.log('DEBUG Entry Content:', entryContent);

    // Calculate hash for entry content - matches calculateHash function in SystemAudit.cjs
    const contentHash = await cryptoUtils.sha256Base64(entryContent);
    console.log('DEBUG Content Hash:', contentHash);

    // Calculate line hash by combining with previous hash
    // This matches generateLineHash function in SystemAudit.cjs
    const calculatedHash = await cryptoUtils.sha256Base64(previousHash + contentHash);
    console.log('DEBUG Calculated Hash:', calculatedHash);
    console.log('DEBUG Match:', storedHash === calculatedHash);
    console.log('-----------------------------------');

    return {
        valid: storedHash === calculatedHash,
        entry,
        storedHash,
        calculatedHash,
        previousHash
    };
};

// Helper function to verify a collection of entries
const verifyEntryCollection = async (entries) => {
    if (!entries || entries.length === 0) {
        return { valid: true, entries: [], results: [] };
    }

    let previousHash = '';
    const results = [];
    let allValid = true;

    for (const entry of entries) {
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
        entries,
        results
    };
};

// Helper function to check if an entry is a previous file hash reference
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

// Function to verify cross-file hash chain
const verifyFileHashChain = async (loadingStrategy) => {
    const auditLogs = await loadingStrategy.getAllAuditLogs();
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

    // Verify file chain
    let previousFileContent = '';
    let previousDate = '';

    for (const dateInfo of allDates) {
        const { year, month, day, date } = dateInfo;
        const dayData = auditLogs[year][month][day];
        const entries = dayData.entries;

        // Check if first entry is a PREV_FILE_HASH entry
        const hasFileHashEntry = entries.length > 0 && isPrevFileHashEntry(entries[0]);
        const fileHashResult = {
            date,
            hasFileHashEntry
        };

        if (hasFileHashEntry) {
            const declaredPrevHash = extractPrevFileHash(entries[0]);
            fileHashResult.declaredPrevHash = declaredPrevHash;

            if (previousDate) {
                // Calculate the actual hash of the previous file
                const calculatedPrevHash = await cryptoUtils.sha256Base64(previousFileContent);

                fileHashResult.previousDate = previousDate;
                fileHashResult.calculatedPrevHash = calculatedPrevHash;
                fileHashResult.hashesMatch = declaredPrevHash === calculatedPrevHash;

                // Mark the entire chain as invalid if any link is broken
                if (!fileHashResult.hashesMatch) {
                    results.valid = false;
                }
            } else {
                // This is the first file, so no previous file to verify against
                fileHashResult.isPreviousFileMissing = true;
            }
        } else if (previousDate) {
            // No file hash entry but there was a previous file
            fileHashResult.error = 'Missing previous file hash entry';
            results.valid = false;
        }

        results.fileChainResults.push(fileHashResult);

        // Store the current file content for the next iteration
        previousFileContent = entries.join('\n');
        previousDate = date;
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
                results[year][month][day] = await verifyEntryCollection(dayData.entries);
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
            results[month][day] = await verifyEntryCollection(dayData.entries);
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
        results[day] = await verifyEntryCollection(dayData.entries);
    }

    return results;
}

const checkHashForDay = async (year, month, day, loadingStrategy) => {
    const auditLog = await loadingStrategy.getAuditLogsForDay(year, month, day);
    return await verifyEntryCollection(auditLog.entries);
}

module.exports = {
    checkAllHashes,
    checkHashForYear,
    checkHashForMonth,
    checkHashForDay,
    verifyFileHashChain
};
