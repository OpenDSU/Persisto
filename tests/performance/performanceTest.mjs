import { } from "../../clean.mjs";

await $$.clean();

import { initialisePersisto } from '../../index.cjs';

// Performance test configuration
const TEST_SIZES = process.env.QUICK_TEST === 'true'
    ? [100, 500, 1000]
    : [100, 500, 1000, 2500, 5000, 10000];
const RETRIEVAL_TESTS_PER_SIZE = process.env.QUICK_TEST === 'true' ? 50 : 100; // Number of random retrievals to test per size

async function createPerformanceTest() {
    console.log("🚀 Starting Persisto Performance Test");
    console.log("=====================================");

    const results = [];

    for (const testSize of TEST_SIZES) {
        console.log(`\n📊 Testing with ${testSize} users...`);

        // Clean and initialize fresh instance for each test
        await $$.clean();
        const persistoInstance = await initialisePersisto();

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

        console.log("  ⏱️  Creating users...");
        const createStartTime = Date.now();

        // Create users with varied data
        const userIds = [];
        const userEmails = [];
        const departments = ["Engineering", "Marketing", "Sales", "HR", "Finance"];

        for (let i = 0; i < testSize; i++) {
            const userData = {
                email: `user${i}@company.com`,
                name: `User ${i}`,
                age: 25 + (i % 40), // Age between 25-65
                department: departments[i % departments.length],
                createdAt: new Date().toISOString(),
                isActive: i % 10 !== 0, // 90% active users
                metadata: {
                    loginCount: Math.floor(Math.random() * 1000),
                    lastLogin: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
                    preferences: {
                        theme: i % 2 === 0 ? "dark" : "light",
                        notifications: i % 3 === 0
                    }
                }
            };

            const user = await persistoInstance.createUser(userData);
            userIds.push(user.id);
            userEmails.push(user.email);

            // Progress indicator for large datasets
            if (i > 0 && i % 1000 === 0) {
                const elapsedTime = Date.now() - createStartTime;
                const currentRate = (i / elapsedTime * 1000).toFixed(2);
                console.log(`    Created ${i} users... (${currentRate} users/sec)`);
            }

            // More frequent progress updates for very large datasets
            if (testSize >= 50000 && i > 0 && i % 10000 === 0) {
                const elapsedTime = Date.now() - createStartTime;
                const estimatedTotal = (elapsedTime / i) * testSize;
                const remainingTime = estimatedTotal - elapsedTime;
                console.log(`    📊 Progress: ${((i / testSize) * 100).toFixed(1)}% - ETA: ${(remainingTime / 1000 / 60).toFixed(1)} minutes`);
            }
        }

        const createEndTime = Date.now();
        const creationTime = createEndTime - createStartTime;

        console.log(`  ✅ Created ${testSize} users in ${creationTime}ms`);
        console.log(`  📈 Creation rate: ${(testSize / creationTime * 1000).toFixed(2)} users/second`);

        // Test retrieval performance
        console.log("  🔍 Testing retrieval performance...");

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
            verifications: {
                allUsersCount: allUsers.length,
                expectedCount: testSize
            }
        };

        results.push(testResult);

        // Display results for this test size
        console.log("  📊 Results:");
        console.log(`    ID Retrieval: ${avgIdRetrievalTime.toFixed(3)}ms avg (${minIdRetrievalTime.toFixed(3)}-${maxIdRetrievalTime.toFixed(3)}ms range)`);
        console.log(`    Email Retrieval: ${avgEmailRetrievalTime.toFixed(3)}ms avg (${minEmailRetrievalTime.toFixed(3)}-${maxEmailRetrievalTime.toFixed(3)}ms range)`);
        console.log(`    Get All Users: ${getAllTime.toFixed(3)}ms (${(testSize / getAllTime * 1000).toFixed(2)} users/sec)`);
        console.log(`    Dept Retrieval: ${deptRetrievalTime.toFixed(3)}ms (${engineeringUsers.length} users found)`);

        // Verify data integrity
        if (allUsers.length !== testSize) {
            throw new Error(`Data integrity check failed: expected ${testSize} users, got ${allUsers.length}`);
        }

        await persistoInstance.shutDown();
    }

    // Generate final performance report
    console.log("\n📈 PERFORMANCE ANALYSIS");
    console.log("=======================");

    console.log("\n🏗️  Creation Performance:");
    console.log("Users\t\tTime(ms)\tRate(users/sec)");
    console.log("----\t\t--------\t---------------");
    results.forEach(result => {
        console.log(`${result.userCount}\t\t${result.creationTime}\t\t${result.creationRate.toFixed(2)}`);
    });

    console.log("\n🔍 ID Retrieval Performance (Average):");
    console.log("Users\t\tAvg Time(ms)\tScaling Factor");
    console.log("----\t\t------------\t--------------");
    const baselineIdTime = results[0].idRetrieval.avg;
    results.forEach(result => {
        const scalingFactor = result.idRetrieval.avg / baselineIdTime;
        console.log(`${result.userCount}\t\t${result.idRetrieval.avg.toFixed(3)}\t\t${scalingFactor.toFixed(2)}x`);
    });

    console.log("\n📧 Email Retrieval Performance (Average):");
    console.log("Users\t\tAvg Time(ms)\tScaling Factor");
    console.log("----\t\t------------\t--------------");
    const baselineEmailTime = results[0].emailRetrieval.avg;
    results.forEach(result => {
        const scalingFactor = result.emailRetrieval.avg / baselineEmailTime;
        console.log(`${result.userCount}\t\t${result.emailRetrieval.avg.toFixed(3)}\t\t${scalingFactor.toFixed(2)}x`);
    });

    console.log("\n📋 Full Collection Retrieval Performance:");
    console.log("Users\t\tTime(ms)\tRate(users/sec)\tScaling Factor");
    console.log("----\t\t--------\t---------------\t--------------");
    const baselineGetAllTime = results[0].getAllTime;
    results.forEach(result => {
        const scalingFactor = result.getAllTime / baselineGetAllTime;
        console.log(`${result.userCount}\t\t${result.getAllTime.toFixed(1)}\t\t${result.getAllRate.toFixed(2)}\t\t${scalingFactor.toFixed(2)}x`);
    });

    // Performance analysis
    console.log("\n🎯 PERFORMANCE INSIGHTS:");
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

    // Performance recommendations
    console.log("\n💡 RECOMMENDATIONS:");
    console.log("===================");

    if (idScalingFactor < 2) {
        console.log("✅ ID retrieval scales well - likely using efficient direct access");
    } else {
        console.log("⚠️  ID retrieval scaling could be improved");
    }

    if (emailScalingFactor < 2) {
        console.log("✅ Email retrieval scales well - indexing is effective");
    } else {
        console.log("⚠️  Email retrieval scaling suggests index optimization needed");
    }

    if (collectionScalingFactor > largestTest.userCount / smallestTest.userCount * 1.5) {
        console.log("⚠️  Full collection retrieval scaling is worse than linear - consider pagination");
    } else {
        console.log("✅ Full collection retrieval scales reasonably");
    }





    console.log("\n🎉 Performance test completed successfully!");

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