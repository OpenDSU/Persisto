import { } from "../../clean.mjs";

await $$.clean();

import { initialisePersisto } from '../../index.cjs';

// Performance test configuration
const TEST_SIZES = process.env.QUICK_TEST === 'true'
    ? [1000, 5000, 10000]
    : [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000]; // Array of test sizes to run
const OBJECT_SIZE_BYTES = parseInt(process.env.OBJECT_SIZE) || 1024; // Default 1KB object size
const RETRIEVAL_TESTS_PER_SIZE = process.env.QUICK_TEST === 'true' ? 25 : 100; // Number of retrieval tests per size

function getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
        rss: Math.round(usage.rss / (1024 * 1024)), // MB
        heapUsed: Math.round(usage.heapUsed / (1024 * 1024)), // MB
        heapTotal: Math.round(usage.heapTotal / (1024 * 1024)), // MB
        external: Math.round(usage.external / (1024 * 1024)), // MB
        timestamp: Date.now()
    };
}

function formatMemorySize(bytes) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)}MB`;
}

function calculateMemoryDelta(beforeMem, afterMem) {
    return {
        rssChange: afterMem.rss - beforeMem.rss,
        heapUsedChange: afterMem.heapUsed - beforeMem.heapUsed,
        heapTotalChange: afterMem.heapTotal - beforeMem.heapTotal,
        externalChange: afterMem.external - beforeMem.external
    };
}

/**
 * Creates a user object with approximately the specified size in bytes
 * @param {number} userIndex - Index of the user for generating unique data
 * @param {string[]} departments - Array of department names
 * @param {number} targetSizeBytes - Target size in bytes
 * @returns {object} User object with padding to reach target size
 */
function createUserObjectWithSize(userIndex, departments, targetSizeBytes) {
    // Create base user object
    const baseUser = {
        email: `user${userIndex}@company.com`,
        name: `User ${userIndex}`,
        age: 25 + (userIndex % 40), // Age between 25-65
        department: departments[userIndex % departments.length],
        createdAt: new Date().toISOString(),
        isActive: userIndex % 10 !== 0, // 90% active users
        metadata: {
            loginCount: Math.floor(Math.random() * 1000),
            lastLogin: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
            preferences: {
                theme: userIndex % 2 === 0 ? "dark" : "light",
                notifications: userIndex % 3 === 0
            }
        }
    };

    // Calculate current size
    let currentSize = JSON.stringify(baseUser).length;

    // Add padding if needed to reach target size
    if (currentSize < targetSizeBytes) {
        const paddingNeeded = targetSizeBytes - currentSize - 20; // Reserve space for property name and quotes
        if (paddingNeeded > 0) {
            // Create padding string with varied content to make it more realistic
            const paddingBase = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ";
            const repetitions = Math.ceil(paddingNeeded / paddingBase.length);
            let padding = paddingBase.repeat(repetitions);

            // Trim to exact size needed
            padding = padding.substring(0, paddingNeeded);

            baseUser.paddingData = padding;
        }
    }

    return baseUser;
}

async function createPerformanceTest() {
    console.log("Starting Persisto Performance Test");
    console.log("=====================================");
    console.log(`Object size: ${OBJECT_SIZE_BYTES} bytes (${(OBJECT_SIZE_BYTES / 1024).toFixed(1)}KB)`);

    if (!global.gc) {
        console.log("⚠️  Note: Run with 'node --expose-gc' for more accurate memory measurements");
    } else {
        console.log("✅ Garbage collection available for accurate memory measurements");
    }

    const results = [];

    for (const testSize of TEST_SIZES) {
        console.log(`\n Testing with ${testSize} users...`);

        // Clean and initialize fresh instance for each test
        await $$.clean();

        // Force garbage collection if available (run with --expose-gc)
        if (global.gc) {
            global.gc();
        }

        const persistoInstance = await initialisePersisto();

        // Measure initial memory after cleanup and initialization
        const initialMemory = getMemoryUsage();

        // Configure user type
        await persistoInstance.configureTypes({
            user: {
                email: "string",
                name: "string",
                age: "number",
                department: "string",
                createdAt: "string",
                isActive: "boolean",
                metadata: "object"
            }
        });

        // Create index on email for fast retrieval
        await persistoInstance.createIndex("user", "email");

        // Create grouping by department
        await persistoInstance.createGrouping("usersByDept", "user", "department");

        console.log("   Creating users...");
        const createStartTime = Date.now();

        // Force garbage collection before measuring baseline memory
        if (global.gc) {
            global.gc();
        }
        const beforeCreationMemory = getMemoryUsage();

        // Store initial memory state for more accurate measurement
        const initialHeapUsed = beforeCreationMemory.heapUsed;
        const initialRss = beforeCreationMemory.rss;

        // Create users with varied data
        const userIds = [];
        const userEmails = [];
        const departments = ["Engineering", "Marketing", "Sales", "HR", "Finance"];

        // Track peak memory during creation
        let peakHeapUsed = initialHeapUsed;
        let peakRss = initialRss;

        for (let i = 0; i < testSize; i++) {
            const userData = createUserObjectWithSize(i, departments, OBJECT_SIZE_BYTES);

            const user = await persistoInstance.createUser(userData);
            userIds.push(user.id);
            userEmails.push(user.email);

            // Track peak memory (check every 1000 users to avoid performance impact)
            if (i > 0 && i % 1000 === 0) {
                const currentMemory = getMemoryUsage();
                peakHeapUsed = Math.max(peakHeapUsed, currentMemory.heapUsed);
                peakRss = Math.max(peakRss, currentMemory.rss);

                const elapsedTime = Date.now() - createStartTime;
                const currentRate = (i / elapsedTime * 1000).toFixed(2);
                console.log(`    Created ${i} users... (${currentRate} users/sec)`);
            }

            // More frequent progress updates for very large datasets
            if (testSize >= 50000 && i > 0 && i % 10000 === 0) {
                const elapsedTime = Date.now() - createStartTime;
                const estimatedTotal = (elapsedTime / i) * testSize;
                const remainingTime = estimatedTotal - elapsedTime;
                console.log(`     Progress: ${((i / testSize) * 100).toFixed(1)}% - ETA: ${(remainingTime / 1000 / 60).toFixed(1)} minutes`);
            }
        }

        const createEndTime = Date.now();

        // Force garbage collection to get accurate memory reading
        if (global.gc) {
            global.gc();
        }
        const afterCreationMemory = getMemoryUsage();
        const creationTime = createEndTime - createStartTime;

        // Calculate memory using peak values to avoid GC interference
        const peakMemoryDelta = {
            heapUsedChange: peakHeapUsed - initialHeapUsed,
            rssChange: peakRss - initialRss
        };
        const creationMemoryDelta = calculateMemoryDelta(beforeCreationMemory, afterCreationMemory);

        console.log(`  ✅ Created ${testSize} users in ${creationTime}ms`);
        console.log(`   Creation rate: ${(testSize / creationTime * 1000).toFixed(2)} users/second`);
        console.log(`   Memory used: ${peakMemoryDelta.heapUsedChange.toFixed(1)}MB heap (peak), ${peakMemoryDelta.rssChange.toFixed(1)}MB RSS (peak)`);
        console.log(`   Memory debug: Initial=${initialHeapUsed}MB, Peak=${peakHeapUsed}MB, Final=${afterCreationMemory.heapUsed}MB`);
        console.log(`   Memory deltas: Peak=${peakMemoryDelta.heapUsedChange}MB, Final=${creationMemoryDelta.heapUsedChange}MB`);

        // Add more detailed memory debugging for anomaly detection
        if (creationMemoryDelta.heapUsedChange < 0) {
            console.log(`   ⚠️  WARNING: Negative final memory delta detected! This may indicate garbage collection interference.`);
            console.log(`   Peak memory delta: ${peakMemoryDelta.heapUsedChange}MB (this is more accurate)`);
        }

        // Test retrieval performance
        console.log("   Testing retrieval performance...");
        const beforeRetrievalMemory = getMemoryUsage();

        // Test 1: Get user by ID (direct object retrieval)
        const idRetrievalTimes = [];
        for (let i = 0; i < RETRIEVAL_TESTS_PER_SIZE; i++) {
            const randomIndex = Math.floor(Math.random() * userIds.length);
            const userId = userIds[randomIndex];

            const startTime = performance.now();
            await persistoInstance.getUser(userId);
            const endTime = performance.now();

            idRetrievalTimes.push(endTime - startTime);
        }

        // Test 2: Get user by email (indexed field retrieval)
        const emailRetrievalTimes = [];
        for (let i = 0; i < RETRIEVAL_TESTS_PER_SIZE; i++) {
            const randomIndex = Math.floor(Math.random() * userEmails.length);
            const userEmail = userEmails[randomIndex];

            const startTime = performance.now();
            await persistoInstance.getUserByEmail(userEmail);
            const endTime = performance.now();

            emailRetrievalTimes.push(endTime - startTime);
        }

        // Test 3: Get all users (full collection scan)
        const getAllStartTime = performance.now();
        const allUsers = await persistoInstance.getEveryUser();
        const getAllEndTime = performance.now();
        const getAllTime = getAllEndTime - getAllStartTime;

        // Test 4: Get users by department (grouping retrieval)
        const deptRetrievalStartTime = performance.now();
        const engineeringUsers = await persistoInstance.getUsersByDeptByDepartment("Engineering");
        const deptRetrievalEndTime = performance.now();
        const deptRetrievalTime = deptRetrievalEndTime - deptRetrievalStartTime;

        // Measure memory after retrieval tests
        const afterRetrievalMemory = getMemoryUsage();
        const retrievalMemoryDelta = calculateMemoryDelta(beforeRetrievalMemory, afterRetrievalMemory);
        const totalMemoryDelta = calculateMemoryDelta(initialMemory, afterRetrievalMemory);

        // Calculate statistics
        const avgIdRetrievalTime = idRetrievalTimes.reduce((a, b) => a + b, 0) / idRetrievalTimes.length;
        const minIdRetrievalTime = Math.min(...idRetrievalTimes);
        const maxIdRetrievalTime = Math.max(...idRetrievalTimes);

        const avgEmailRetrievalTime = emailRetrievalTimes.reduce((a, b) => a + b, 0) / emailRetrievalTimes.length;
        const minEmailRetrievalTime = Math.min(...emailRetrievalTimes);
        const maxEmailRetrievalTime = Math.max(...emailRetrievalTimes);

        const testResult = {
            userCount: testSize,
            creationTime,
            creationRate: testSize / creationTime * 1000,
            idRetrieval: {
                avg: avgIdRetrievalTime,
                min: minIdRetrievalTime,
                max: maxIdRetrievalTime
            },
            emailRetrieval: {
                avg: avgEmailRetrievalTime,
                min: minEmailRetrievalTime,
                max: maxEmailRetrievalTime
            },
            getAllTime,
            getAllRate: testSize / getAllTime * 1000,
            deptRetrievalTime,
            deptRetrievalCount: engineeringUsers.length,
            memory: {
                creation: {
                    heapUsed: peakMemoryDelta.heapUsedChange, // Use peak values for more accurate measurement
                    rss: peakMemoryDelta.rssChange,
                    heapTotal: creationMemoryDelta.heapTotalChange
                },
                retrieval: {
                    heapUsed: retrievalMemoryDelta.heapUsedChange,
                    rss: retrievalMemoryDelta.rssChange,
                    heapTotal: retrievalMemoryDelta.heapTotalChange
                },
                total: {
                    heapUsed: totalMemoryDelta.heapUsedChange,
                    rss: totalMemoryDelta.rssChange,
                    heapTotal: totalMemoryDelta.heapTotalChange
                },
                final: {
                    heapUsed: afterRetrievalMemory.heapUsed,
                    rss: afterRetrievalMemory.rss,
                    heapTotal: afterRetrievalMemory.heapTotal
                }
            },
            verifications: {
                allUsersCount: allUsers.length,
                expectedCount: testSize
            }
        };

        results.push(testResult);

        // Display results for this test size
        console.log("  Results:");
        console.log(`    ID Retrieval: ${avgIdRetrievalTime.toFixed(3)}ms avg (${minIdRetrievalTime.toFixed(3)}-${maxIdRetrievalTime.toFixed(3)}ms range)`);
        console.log(`    Email Retrieval: ${avgEmailRetrievalTime.toFixed(3)}ms avg (${minEmailRetrievalTime.toFixed(3)}-${maxEmailRetrievalTime.toFixed(3)}ms range)`);
        console.log(`    Get All Users: ${getAllTime.toFixed(3)}ms (${(testSize / getAllTime * 1000).toFixed(2)} users/sec)`);
        console.log(`    Dept Retrieval: ${deptRetrievalTime.toFixed(3)}ms (${engineeringUsers.length} users found)`);
        console.log(`    Memory Usage:`);
        console.log(`    Creation (peak): ${testResult.memory.creation.heapUsed.toFixed(1)}MB heap, ${testResult.memory.creation.rss.toFixed(1)}MB RSS`);
        console.log(`    Total Used: ${testResult.memory.total.heapUsed.toFixed(1)}MB heap, ${testResult.memory.total.rss.toFixed(1)}MB RSS`);
        console.log(`    Memory per Object: ${(testResult.memory.creation.heapUsed / testSize * 1024).toFixed(2)}KB heap/object`);

        // Verify data integrity
        if (allUsers.length !== testSize) {
            throw new Error(`Data integrity check failed: expected ${testSize} users, got ${allUsers.length}`);
        }

        await persistoInstance.shutDown();
    }

    // Generate final performance report
    console.log("\n PERFORMANCE ANALYSIS");
    console.log("=======================");

    console.log("\n Creation Performance:");
    console.log("Users\t\tTime(ms)\tRate(users/sec)");
    console.log("----\t\t--------\t---------------");
    results.forEach(result => {
        console.log(`${result.userCount}\t\t${result.creationTime}\t\t${result.creationRate.toFixed(2)}`);
    });

    console.log("\nID Retrieval Performance (Average):");
    console.log("Users\t\tAvg Time(ms)\tScaling Factor");
    console.log("----\t\t------------\t--------------");
    const baselineIdTime = results[0].idRetrieval.avg;
    results.forEach(result => {
        const scalingFactor = result.idRetrieval.avg / baselineIdTime;
        console.log(`${result.userCount}\t\t${result.idRetrieval.avg.toFixed(3)}\t\t${scalingFactor.toFixed(2)}x`);
    });

    console.log("\nEmail Retrieval Performance (Average):");
    console.log("Users\t\tAvg Time(ms)\tScaling Factor");
    console.log("----\t\t------------\t--------------");
    const baselineEmailTime = results[0].emailRetrieval.avg;
    results.forEach(result => {
        const scalingFactor = result.emailRetrieval.avg / baselineEmailTime;
        console.log(`${result.userCount}\t\t${result.emailRetrieval.avg.toFixed(3)}\t\t${scalingFactor.toFixed(2)}x`);
    });

    console.log("\nFull Collection Retrieval Performance:");
    console.log("Users\t\tTime(ms)\tRate(users/sec)\tScaling Factor");
    console.log("----\t\t--------\t---------------\t--------------");
    const baselineGetAllTime = results[0].getAllTime;
    results.forEach(result => {
        const scalingFactor = result.getAllTime / baselineGetAllTime;
        console.log(`${result.userCount}\t\t${result.getAllTime.toFixed(1)}\t\t${result.getAllRate.toFixed(2)}\t\t${scalingFactor.toFixed(2)}x`);
    });

    // Performance analysis
    console.log("\nPERFORMANCE INSIGHTS:");
    console.log("========================");

    // Analyze ID retrieval scaling
    const largestTest = results[results.length - 1];
    const smallestTest = results[0];
    const idScalingFactor = largestTest.idRetrieval.avg / smallestTest.idRetrieval.avg;
    const emailScalingFactor = largestTest.emailRetrieval.avg / smallestTest.emailRetrieval.avg;
    const collectionScalingFactor = largestTest.getAllTime / smallestTest.getAllTime;

    console.log(`• ID Retrieval: ${idScalingFactor.toFixed(2)}x slower with ${largestTest.userCount / smallestTest.userCount}x more data`);
    console.log(`• Email Retrieval: ${emailScalingFactor.toFixed(2)}x slower with ${largestTest.userCount / smallestTest.userCount}x more data`);
    console.log(`• Full Collection: ${collectionScalingFactor.toFixed(2)}x slower with ${largestTest.userCount / smallestTest.userCount}x more data`);

    // Memory Usage Analysis
    console.log("\nMEMORY USAGE ANALYSIS:");
    console.log("======================");

    console.log("\nMemory Usage by Dataset Size:");
    console.log("Users\t\tCreation(MB)\tTotal(MB)\tPer Object(KB)\tRaw Delta(MB)");
    console.log("-----\t\t------------\t---------\t--------------\t-------------");
    results.forEach(result => {
        // Values are already in MB from getMemoryUsage(), no need to divide again
        const creationMB = result.memory.creation.heapUsed;
        const totalMB = result.memory.total.heapUsed;
        const perObjectKB = result.memory.creation.heapUsed * 1024 / result.userCount; // Convert MB to KB for per-object
        const rawDelta = result.memory.creation.heapUsed; // Show the actual delta, even if negative
        console.log(`${result.userCount}\t\t${creationMB.toFixed(1)}\t\t${totalMB.toFixed(1)}\t\t${perObjectKB.toFixed(2)}\t\t${rawDelta.toFixed(1)}`);
    });

    // Memory efficiency analysis
    const avgMemoryPerObjectMB = results.reduce((sum, r) => sum + (r.memory.creation.heapUsed / r.userCount), 0) / results.length;
    const avgMemoryPerObjectBytes = avgMemoryPerObjectMB * 1024 * 1024; // Convert MB to bytes
    const expectedMemoryPerObject = OBJECT_SIZE_BYTES;
    const memoryEfficiency = expectedMemoryPerObject / avgMemoryPerObjectBytes;

    console.log("\nMemory Efficiency:");
    console.log(`Expected size per object: ${(expectedMemoryPerObject / 1024).toFixed(2)}KB`);
    console.log(`Actual memory per object: ${(avgMemoryPerObjectBytes / 1024).toFixed(2)}KB`);
    console.log(`Memory efficiency: ${(memoryEfficiency * 100).toFixed(1)}% (${memoryEfficiency < 0.5 ? "⚠️  Poor" : memoryEfficiency < 0.8 ? "📊 Fair" : "✅ Good"})`);

    console.log("\n Performance test completed successfully!");

    return results;
}

// Run the performance test
try {
    await createPerformanceTest();
    process.exit(0);
} catch (error) {
    console.error("❌ Performance test failed:", error);
    process.exit(1);
} 