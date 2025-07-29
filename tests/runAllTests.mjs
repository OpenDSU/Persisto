import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let failedTests = [];
let missingPaths = [];

const tests = [
    './changeGroupingValue.mjs',
    './changeIndexValue.mjs',
    './getEveryIndexValue.mjs',
    './getObjectByOtherObjectId.mjs',
    './getObjectsRange.mjs',
    './groupingAfterObjectCreation.mjs',
    './indexingAfterObjectCreation.mjs',
    './lockedPoints.mjs',
    './namingConflictTest.mjs',
    './SimpleEconomyNFT.mjs',
    './smokeTest.mjs',
    './typesPersistence.mjs',
    './userIdTest.mjs',
    './joinTest.mjs',
];

import fs from 'node:fs/promises';
import { constants } from 'node:fs';

async function fileExists(filePath) {
    try {
        await fs.access(filePath, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

function identAndCleanStdErr(output) {
    let lines = output.split("\n");
    let cleanedLines = lines.map(line => "\t\t" + line.trim());
    cleanedLines = cleanedLines.filter(line => line !== "");
    return cleanedLines.join("\n");
}

async function runTestsSequentially(testsArray = tests) {
    let passed = 0, failed = 0;

    console.log('🔧 Running Persisto Tests...\n');

    for (const testPath of testsArray) {
        const absolutePath = path.resolve(__dirname, testPath);
        console.log(`▶️ Running test: ${testPath}`);
        try {
            if (!await fileExists(absolutePath)) {
                missingPaths.push(testPath);
                continue;
            }
        } catch {
            missingPaths.push(testPath);
            continue;
        }

        const exitCode = await new Promise((resolve) => {
            const child = fork(absolutePath, [], { stdio: 'pipe' });

            let stderrData = '';

            child.stderr.on('data', (data) => {
                stderrData += data.toString();
            });

            child.on('exit', (code) => {
                resolve({ code, stderr: stderrData });
            });
        });

        if (exitCode.code === 0 && exitCode.stderr === '') {
            console.log(`✅ PASSED: ${testPath}`);
            passed++;
        } else {
            console.log(`❌ FAILED: ${testPath} (exit code: ${exitCode.code}${exitCode.stderr ? `, stderr: ${exitCode.stderr.trim()}` : ''})`);
            failedTests.push({ testPath, stdErrResult: exitCode.stderr });
            failed++;
        }
    }

    console.log(`\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Persisto Summary:`);
    if (failed > 0) {
        console.log(`\tFailed tests:`);
        failedTests.forEach(test => console.log(`\t- ${test.testPath} \n${identAndCleanStdErr(test.stdErrResult)}`));
    }
    if (missingPaths.length) {
        console.log("\tFollowing paths do not exist:", missingPaths);
    }
    console.log(`\t🏁 Persisto Finished: ${passed} passed, ${failed} failed.`);
    
    return { passed, failed, failedTests, missingPaths };
}

// If run directly, execute tests
if (import.meta.url === `file://${process.argv[1]}`) {
    const result = await runTestsSequentially(tests);
    process.exit(result.failed > 0 ? 1 : 0);
}

// Export for use by other test runners
export { runTestsSequentially, tests }; 