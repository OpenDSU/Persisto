import { } from "../../clean.mjs";
import { initialisePersisto } from '../../index.cjs';

// Performance test configuration for 100k users
const TEST_SIZE = 100000;
const RETRIEVAL_TESTS = 200; // Number of random retrievals to test
const PROGRESS_INTERVAL = 5000; // Report progress every 5k users
const MEMORY_CHECK_INTERVAL = 10000; // Check memory usage every 10k users

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
        const usage = process.memoryUsage();
        return {
            rss: formatBytes(usage.rss),
            heapUsed: formatBytes(usage.heapUsed),
            heapTotal: formatBytes(usage.heapTotal),
            external: formatBytes(usage.external)
        };
    }
    return null;
}

async function create100kPerformanceTest() {
    console.log("Starting Persisto 100k Users Performance Test");
    console.log("=================================================");
    console.log(`Target: ${TEST_SIZE.toLocaleString()} users`);
    console.log(`Retrieval tests: ${RETRIEVAL_TESTS} per test type`);

    const initialMemory = getMemoryUsage();
    if (initialMemory) {
        console.log("Initial memory usage:", initialMemory);
    }

    // Clean and initialize fresh instance
    await $$.clean();
    const persistoInstance = await initialisePersisto();

    // Configure user type with comprehensive schema and indexes all at once
    console.log("Configuring types and indexes...");
    await persistoInstance.configureTypes({
        user: {
            email: "string",
            name: "string",
            age: "number",
            department: "string",
            role: "string",
            salary: "number",
            createdAt: "string",
            lastLoginAt: "string",
            isActive: "boolean",
            skills: "array",
            metadata: "object",
            projectCount: "number",
            performanceRating: "number"
        }
    });

    // Create index on email for fast retrieval (matching original test pattern)
    await persistoInstance.createIndex("user", "email");

    // Create grouping by department (matching original test pattern)
    await persistoInstance.createGrouping("usersByDept", "user", "department");

    console.log("Creating 100,000 users...");
    const createStartTime = Date.now();

    // Prepare data arrays for retrieval tests
    const userIds = [];
    const userEmails = [];
    const departments = ["Engineering", "Marketing", "Sales", "HR", "Finance", "Operations", "Legal", "Support"];
    const roles = ["Junior", "Mid", "Senior", "Lead", "Manager", "Director", "VP"];
    const skills = ["JavaScript", "Python", "Java", "React", "Node.js", "SQL", "AWS", "Docker", "Kubernetes", "GraphQL"];

    // Track performance metrics during creation
    let lastProgressTime = Date.now();
    let lastProgressCount = 0;
    let usersCreatedCount = 0;

    try {
        for (let i = 0; i < TEST_SIZE; i++) {
            const userData = {
                email: `user${i}@company.com`,
                name: `User ${i}`,
                age: 22 + (i % 45), // Age between 22-67
                department: departments[i % departments.length],
                role: roles[i % roles.length],
                salary: 50000 + (i % 150000), // Salary between 50k-200k
                createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
                lastLoginAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
                isActive: i % 20 !== 0, // 95% active users
                skills: skills.slice(0, 2 + (i % 4)).map(skill => `${skill} Level ${1 + (i % 5)}`),
                projectCount: i % 50,
                performanceRating: 1 + (i % 10) / 2, // Rating between 1-5
                metadata: {
                    loginCount: Math.floor(Math.random() * 5000),
                    lastLogin: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
                    preferences: {
                        theme: i % 3 === 0 ? "dark" : i % 3 === 1 ? "light" : "auto",
                        notifications: i % 4 !== 0,
                        language: i % 5 === 0 ? "es" : i % 5 === 1 ? "fr" : "en"
                    },
                    certificates: Array.from({ length: i % 5 }, (_, idx) => `Cert ${idx + 1}`),
                    biography: `Experienced professional with ${i % 20} years in ${departments[i % departments.length]}`
                }
            };

            const user = await persistoInstance.createUser(userData);
            userIds.push(user.id);
            userEmails.push(user.email);
            usersCreatedCount = i + 1; // Update count after successful creation

            // Progress reporting
            if ((i + 1) % PROGRESS_INTERVAL === 0) {
                const currentTime = Date.now();
                const elapsedTime = currentTime - createStartTime;
                const progressElapsed = currentTime - lastProgressTime;
                const progressCount = (i + 1) - lastProgressCount;
                const currentRate = (progressCount / progressElapsed * 1000).toFixed(2);
                const overallRate = ((i + 1) / elapsedTime * 1000).toFixed(2);
                const progressPercent = ((i + 1) / TEST_SIZE * 100).toFixed(1);

                console.log(`    ${(i + 1).toLocaleString()} users created (${progressPercent}%) - Current: ${currentRate} users/sec, Overall: ${overallRate} users/sec`);

                lastProgressTime = currentTime;
                lastProgressCount = i + 1;
            }

            // Memory usage reporting
            if ((i + 1) % MEMORY_CHECK_INTERVAL === 0) {
                const memoryUsage = getMemoryUsage();
                if (memoryUsage) {
                    console.log(`    Memory usage: ${memoryUsage.heapUsed} heap, ${memoryUsage.rss} RSS`);
                }
            }

            // ETA calculation for larger milestones
            if ((i + 1) % 25000 === 0) {
                const elapsedTime = Date.now() - createStartTime;
                const estimatedTotal = (elapsedTime / (i + 1)) * TEST_SIZE;
                const remainingTime = estimatedTotal - elapsedTime;
                console.log(`    ETA: ${(remainingTime / 1000 / 60).toFixed(1)} minutes remaining`);
            }
        }
    } catch (creationError) {
        const creationTime = Date.now() - createStartTime;
        console.error(`\n❌ User creation failed after creating ${usersCreatedCount.toLocaleString()} out of ${TEST_SIZE.toLocaleString()} users`);
        console.error(`⏱️  Time elapsed before failure: ${(creationTime / 1000 / 60).toFixed(2)} minutes`);
        console.error(`📈 Average rate before failure: ${(usersCreatedCount / creationTime * 1000).toFixed(2)} users/second`);
        console.error(`🔍 Error details:`, creationError.message);

        // Try to shut down cleanly before re-throwing
        try {
            await persistoInstance.shutDown();
        } catch (shutdownError) {
            console.error(`⚠️  Additional error during shutdown:`, shutdownError.message);
        }

        throw new Error(`User creation failed after ${usersCreatedCount.toLocaleString()} users: ${creationError.message}`);
    }

    const createEndTime = Date.now();
    const creationTime = createEndTime - createStartTime;

    console.log(`\n✅ Created ${usersCreatedCount.toLocaleString()} users in ${(creationTime / 1000 / 60).toFixed(2)} minutes`);
    console.log(`📈 Average creation rate: ${(usersCreatedCount / creationTime * 1000).toFixed(2)} users/second`);

    const postCreationMemory = getMemoryUsage();
    if (postCreationMemory) {
        console.log("Memory after creation:", postCreationMemory);
    }

    // Performance testing phase
    console.log(`\n🔍 Starting retrieval performance tests with ${usersCreatedCount.toLocaleString()} users...`);

    // Test 1: Get user by ID (direct object retrieval)
    console.log("  Testing ID-based retrieval...");
    const idRetrievalTimes = [];
    const idTestStartTime = Date.now();

    for (let i = 0; i < RETRIEVAL_TESTS; i++) {
        const randomIndex = Math.floor(Math.random() * userIds.length);
        const userId = userIds[randomIndex];

        const startTime = performance.now();
        const user = await persistoInstance.getUser(userId);
        const endTime = performance.now();

        idRetrievalTimes.push(endTime - startTime);

        if (i === 0) {
            console.log(`    Sample user retrieved: ${user.name} (${user.email})`);
        }
    }
    const idTestEndTime = Date.now();

    // Test 2: Get user by email (indexed field retrieval)
    console.log("  Testing email-based retrieval...");
    const emailRetrievalTimes = [];
    const emailTestStartTime = Date.now();

    for (let i = 0; i < RETRIEVAL_TESTS; i++) {
        const randomIndex = Math.floor(Math.random() * userEmails.length);
        const userEmail = userEmails[randomIndex];

        const startTime = performance.now();
        await persistoInstance.getUserByEmail(userEmail);
        const endTime = performance.now();

        emailRetrievalTimes.push(endTime - startTime);
    }
    const emailTestEndTime = Date.now();

    // Test 3: Get all users (full collection scan)
    console.log("  Testing full collection retrieval...");
    const getAllStartTime = performance.now();
    const allUsers = await persistoInstance.getEveryUser();
    const getAllEndTime = performance.now();
    const getAllTime = getAllEndTime - getAllStartTime;

    // Test 4: Get users by department (grouping retrieval)
    console.log("  Testing department-based retrieval...");
    const deptRetrievalStartTime = performance.now();
    const engineeringUsers = await persistoInstance.getUsersByDeptByDepartment("Engineering");
    const deptRetrievalEndTime = performance.now();
    const deptRetrievalTime = deptRetrievalEndTime - deptRetrievalStartTime;



    // Calculate detailed statistics
    const calculateStats = (times) => ({
        avg: times.reduce((a, b) => a + b, 0) / times.length,
        min: Math.min(...times),
        max: Math.max(...times),
        median: times.sort((a, b) => a - b)[Math.floor(times.length / 2)],
        p95: times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)],
        p99: times.sort((a, b) => a - b)[Math.floor(times.length * 0.99)]
    });

    const idStats = calculateStats(idRetrievalTimes);
    const emailStats = calculateStats(emailRetrievalTimes);

    // Data integrity verification
    console.log("\n✅ Verifying data integrity...");
    if (allUsers.length !== usersCreatedCount) {
        throw new Error(`Data integrity check failed: expected ${usersCreatedCount} users, got ${allUsers.length}`);
    }
    console.log(`  ✓ All ${usersCreatedCount.toLocaleString()} users retrieved correctly`);
    console.log(`  ✓ Engineering department has ${engineeringUsers.length} users`);

    // Generate comprehensive performance report
    console.log("\nComprehensive Performance Report");
    console.log("=====================================");

    console.log(`\nData Creation Performance:`);
    console.log(`   Users Created: ${usersCreatedCount.toLocaleString()} out of ${TEST_SIZE.toLocaleString()} target`);
    console.log(`   Total Time: ${(creationTime / 1000 / 60).toFixed(2)} minutes`);
    console.log(`   Average Rate: ${(usersCreatedCount / creationTime * 1000).toFixed(2)} users/second`);
    console.log(`   Peak Memory: ${postCreationMemory ? postCreationMemory.heapUsed : 'N/A'}`);

    console.log(`\nRetrieval Performance (${RETRIEVAL_TESTS} tests each):`);
    console.log(`   ID Retrieval:`);
    console.log(`     Average: ${idStats.avg.toFixed(3)}ms`);
    console.log(`     Median:  ${idStats.median.toFixed(3)}ms`);
    console.log(`     Min/Max: ${idStats.min.toFixed(3)}ms / ${idStats.max.toFixed(3)}ms`);
    console.log(`     95th %:  ${idStats.p95.toFixed(3)}ms`);
    console.log(`     99th %:  ${idStats.p99.toFixed(3)}ms`);
    console.log(`     Total Test Time: ${((idTestEndTime - idTestStartTime) / 1000).toFixed(2)}s`);

    console.log(`\n   Email Retrieval (Indexed):`);
    console.log(`     Average: ${emailStats.avg.toFixed(3)}ms`);
    console.log(`     Median:  ${emailStats.median.toFixed(3)}ms`);
    console.log(`     Min/Max: ${emailStats.min.toFixed(3)}ms / ${emailStats.max.toFixed(3)}ms`);
    console.log(`     95th %:  ${emailStats.p95.toFixed(3)}ms`);
    console.log(`     99th %:  ${emailStats.p99.toFixed(3)}ms`);
    console.log(`     Total Test Time: ${((emailTestEndTime - emailTestStartTime) / 1000).toFixed(2)}s`);

    console.log(`\nBulk Operations:`);
    console.log(`   Get All Users: ${(getAllTime / 1000).toFixed(2)}s (${(usersCreatedCount / getAllTime * 1000).toFixed(2)} users/sec)`);
    console.log(`   Dept Retrieval: ${deptRetrievalTime.toFixed(2)}ms (${engineeringUsers.length} users)`);

    console.log(`\nPerformance Characteristics:`);
    console.log(`   ID lookup appears to be O(1) - Direct object access`);
    console.log(`   Email lookup appears to be O(log n) - Indexed access`);
    console.log(`   Full scan is O(n) - Linear with dataset size`);
    console.log(`   Index performance ratio: ${(emailStats.avg / idStats.avg).toFixed(2)}:1 (email:id)`);

    const finalMemory = getMemoryUsage();
    if (finalMemory) {
        console.log(`\nFinal Memory Usage:`);
        console.log(`   Heap Used: ${finalMemory.heapUsed}`);
        console.log(`   RSS: ${finalMemory.rss}`);
        console.log(`   Heap Total: ${finalMemory.heapTotal}`);
    }

    console.log("\n100k Performance test completed successfully!");
    console.log(`Total test duration: ${((Date.now() - createStartTime) / 1000 / 60).toFixed(2)} minutes`);

    await persistoInstance.shutDown();

    return {
        testSize: TEST_SIZE,
        actualUsersCreated: usersCreatedCount,
        results: {
            creation: {
                time: creationTime,
                rate: usersCreatedCount / creationTime * 1000
            },
            idRetrieval: idStats,
            emailRetrieval: emailStats,
            bulkOperations: {
                getAllTime,
                getAllRate: usersCreatedCount / getAllTime * 1000,
                deptRetrievalTime
            },
            verification: {
                totalUsers: allUsers.length,
                engineeringUsers: engineeringUsers.length
            }
        }
    };
}

// Run the 100k performance test
try {
    await create100kPerformanceTest();
        console.log("\nTest completed successfully!");
    process.exit(0);
} catch (error) {
    console.error("\n100k Performance test failed:", error);
    console.error(error.stack);
    process.exit(1);
} 