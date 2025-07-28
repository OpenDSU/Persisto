const fs = require('fs').promises;
const path = require('path');

function LockManager() {
    const lockFolder = process.env.LOCK_FOLDER;
    const lockTimeout = 30000; // 30 seconds timeout for stale locks
    const processId = process.pid;
    const isEnabled = !!lockFolder; // Only enabled if LOCK_FOLDER is set
    console.log('LockManager', lockFolder, lockTimeout, processId, isEnabled);

    const init = async () => {
        if (!isEnabled) {
            return;
        }

        try {
            await fs.mkdir(lockFolder, { recursive: true });
        } catch (error) {
            console.error('Error creating lock folder:', error);
        }
    }

    if (isEnabled) {
        init();
    }

    const getLockFilePath = (lockName) => {
        if (!isEnabled) {
            return null;
        }
        return path.join(lockFolder, `${lockName}.lock`);
    }

    this.createLock = async (lockName) => {
        if (!isEnabled) {
            console.debug(`Lock system disabled (LOCK_FOLDER not set), skipping lock creation: ${lockName}`);
            return true; // Return success to maintain compatibility
        }

        const lockFile = getLockFilePath(lockName);
        const lockData = {
            pid: processId,
            timestamp: Date.now(),
            hostname: require('os').hostname()
        };

        try {
            // Check if lock already exists and is still valid
            if (await this.isLockActive(lockName)) {
                throw new Error(`Lock '${lockName}' is already active`);
            }

            await fs.writeFile(lockFile, JSON.stringify(lockData, null, 2), 'utf8');
            console.debug(`Created lock: ${lockName}`);
            return true;
        } catch (error) {
            if (error.message.includes('already active')) {
                throw error;
            }
            console.error(`Error creating lock '${lockName}':`, error);
            return false;
        }
    }

    this.removeLock = async (lockName) => {
        console.log('removeLock', lockName);
        if (!isEnabled) {
            console.debug(`Lock system disabled (LOCK_FOLDER not set), skipping lock removal: ${lockName}`);
            return true; // Return success to maintain compatibility
        }

        const lockFile = getLockFilePath(lockName);

        try {
            await fs.unlink(lockFile);
            console.debug(`Removed lock: ${lockName}`);
            return true;
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`Error removing lock '${lockName}':`, error);
            }
            return false;
        }
    }

    this.isLockActive = async (lockName) => {
        console.log('isLockActive', lockName);
        if (!isEnabled) {
            return false; // No locks when system is disabled
        }

        const lockFile = getLockFilePath(lockName);

        try {
            const lockData = JSON.parse(await fs.readFile(lockFile, 'utf8'));
            const now = Date.now();

            // Check if lock is stale (older than timeout)
            if (now - lockData.timestamp > lockTimeout) {
                console.warn(`Removing stale lock: ${lockName}`);
                await removeLock(lockName);
                return false;
            }

            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return false; // Lock file doesn't exist
            }
            console.error(`Error checking lock '${lockName}':`, error);
            return false;
        }
    }

    this.hasAnyLocks = async () => {
        console.log('hasAnyLocks');
        if (!isEnabled) {
            return false; // No locks when system is disabled
        }

        try {
            const files = await fs.readdir(lockFolder);
            const lockFiles = files.filter(file => file.endsWith('.lock'));

            // Check if any locks are still active (not stale)
            for (const file of lockFiles) {
                const lockName = path.basename(file, '.lock');
                if (await isLockActive(lockName)) {
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error('Error checking for locks:', error);
            return false;
        }
    }

    this.listActiveLocks = async () => {
        console.log('listActiveLocks');
        if (!isEnabled) {
            return []; // Empty list when system is disabled
        }

        try {
            const files = await fs.readdir(lockFolder);
            const lockFiles = files.filter(file => file.endsWith('.lock'));
            const activeLocks = [];

            for (const file of lockFiles) {
                const lockName = path.basename(file, '.lock');
                if (await isLockActive(lockName)) {
                    activeLocks.push(lockName);
                }
            }

            return activeLocks;
        } catch (error) {
            console.error('Error listing locks:', error);
            return [];
        }
    }

    this.cleanupStaleLocks = async () => {
        console.log('cleanupStaleLocks');
        if (!isEnabled) {
            console.log('cleanupStaleLocks');
            return; // No cleanup needed when system is disabled
        }

        try {
            const files = await fs.readdir(lockFolder);
            const lockFiles = files.filter(file => file.endsWith('.lock'));

            for (const file of lockFiles) {
                const lockName = path.basename(file, '.lock');
                // isLockActive will automatically remove stale locks
                await isLockActive(lockName);
            }
        } catch (error) {
            console.error('Error cleaning up stale locks:', error);
        }
    }
}


let lockManager;

module.exports = {
    getLockManager: () => {
        if (!lockManager) {
            lockManager = new LockManager();
        }
        return lockManager;
    }
}