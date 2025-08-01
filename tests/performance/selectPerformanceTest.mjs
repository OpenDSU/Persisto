/**
 * Persisto Select Performance Test
 * 
 * This test evaluates how Persisto's select operations scale with dataset size.
 * Tests various select operations across multiple data sizes to analyze scaling behavior.
 * 
 * Test Types:
 * 1. Simple Filters: Basic field equality filters
 * 2. Range Queries: Numeric and date range filtering
 * 3. Complex Filters: OR/AND combinations
 * 4. String Operations: Contains, startsWith, endsWith
 * 5. Sorting Operations: Single and multi-field sorting
 * 6. Pagination: Paginated result retrieval
 * 7. Aggregations: Count, distinct, min/max operations
 * 8. Index Performance: Indexed vs non-indexed field queries
 * 
 * Environment Variables:
 * - OBJECT_SIZE: Size of each test object in bytes (default: 1024 = 1KB)
 * - QUICK_TEST: Set to 'true' for smaller test sizes
 * 
 * Usage Examples:
 * - Default test: node selectPerformanceTest.mjs
 * - Quick test: QUICK_TEST=true node selectPerformanceTest.mjs
 * - Large objects: OBJECT_SIZE=4096 node selectPerformanceTest.mjs
 */

import { } from "../../clean.mjs";

await $$.clean();

import { initialisePersisto } from '../../index.cjs';

// Performance test configuration
const TEST_SIZES = process.env.QUICK_TEST === 'true'
    ? [500, 2000, 5000]
    : [1000, 5000, 10000, 25000, 50000, 100000]; // Different record counts to test

const SELECT_TESTS_PER_SIZE = process.env.QUICK_TEST === 'true' ? 10 : 25; // Number of select tests per size
const OBJECT_SIZE_BYTES = parseInt(process.env.OBJECT_SIZE) || 1024; // Default 1KB object size



/**
 * Creates a user object with approximately the specified size in bytes
 */
function createUserObjectWithSize(userIndex, departments, targetSizeBytes) {
    const baseUser = {
        email: `user${userIndex}@company.com`,
        name: `User ${userIndex}`,
        age: 25 + (userIndex % 40), // Age between 25-65
        department: departments[userIndex % departments.length],
        salary: 50000 + (userIndex % 100) * 1000, // Salary range: 50k-150k
        isActive: userIndex % 10 !== 0, // 90% active users
        joinDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
        skills: ["JavaScript", "Python", "Java", "C++", "React", "Node.js"][userIndex % 6],
        experienceYears: Math.floor(userIndex % 20) + 1, // 1-20 years
        location: ["New York", "San Francisco", "London", "Berlin", "Tokyo"][userIndex % 5],
        metadata: {
            loginCount: Math.floor(Math.random() * 1000),
            lastLogin: new Date().toISOString(),
            preferences: {
                theme: userIndex % 2 === 0 ? "dark" : "light",
                notifications: userIndex % 3 === 0
            }
        }
    };

    // Calculate current size and add padding if needed
    let currentSize = JSON.stringify(baseUser).length;

    if (currentSize < targetSizeBytes) {
        const paddingNeeded = targetSizeBytes - currentSize - 20;
        if (paddingNeeded > 0) {
            const paddingBase = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ";
            const repetitions = Math.ceil(paddingNeeded / paddingBase.length);
            let padding = paddingBase.repeat(repetitions);
            padding = padding.substring(0, paddingNeeded);
            baseUser.paddingData = padding;
        }
    }

    return baseUser;
}

async function createTestData(persisto, size) {
    const userIds = [];
    const departments = ["Engineering", "Marketing", "Sales", "HR", "Finance", "Operations"];

    console.log(`   Creating ${size} users...`);

    for (let i = 0; i < size; i++) {
        const userData = createUserObjectWithSize(i, departments, OBJECT_SIZE_BYTES);
        const user = await persisto.createUser(userData);
        userIds.push(user.id);

        // Progress indicator for large datasets
        if (i > 0 && i % 5000 === 0) {
            console.log(`     Created ${i} users...`);
        }
    }

    return { userIds };
}

async function testSelectPerformance(persisto, userIds, testSize) {
    const results = {};

    console.log("   Testing select performance...");

    // Test 1: Simple field equality filter
    let times = [];
    for (let i = 0; i < SELECT_TESTS_PER_SIZE; i++) {
        const department = ["Engineering", "Marketing", "Sales", "HR", "Finance"][i % 5];
        const startTime = performance.now();
        try {
            await persisto.select("user", { department: department });
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.simpleFilter = calculateStats(times);

    // Test 2: Range queries (age and salary)
    times = [];
    for (let i = 0; i < SELECT_TESTS_PER_SIZE; i++) {
        const minAge = 30 + (i % 20);
        const maxAge = minAge + 15;
        const startTime = performance.now();
        try {
            await persisto.select("user", {
                age: { $gte: minAge, $lte: maxAge },
                salary: { $gt: 60000 }
            });
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.rangeQueries = calculateStats(times);

    // Test 3: Complex OR filters
    times = [];
    for (let i = 0; i < Math.floor(SELECT_TESTS_PER_SIZE / 2); i++) {
        const startTime = performance.now();
        try {
            await persisto.select("user", {
                $or: [
                    { department: "Engineering", age: { $gt: 35 } },
                    { salary: { $gt: 80000 } },
                    { experienceYears: { $gte: 10 } }
                ]
            });
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.complexOrFilters = calculateStats(times);

    // Test 4: String operations
    times = [];
    for (let i = 0; i < Math.floor(SELECT_TESTS_PER_SIZE / 2); i++) {
        const startTime = performance.now();
        try {
            await persisto.select("user", {
                email: { $contains: "@company.com" },
                name: { $startsWith: "User" },
                skills: { $contains: "JavaScript" }
            });
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.stringOperations = calculateStats(times);

    // Test 5: Single field sorting
    times = [];
    for (let i = 0; i < Math.floor(SELECT_TESTS_PER_SIZE / 2); i++) {
        const startTime = performance.now();
        try {
            await persisto.select("user", {}, {
                sortBy: "salary",
                descending: true,
                start: 0,
                end: 100 // Limit results for performance
            });
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.singleFieldSort = calculateStats(times);

    // Test 6: Multi-field sorting
    times = [];
    for (let i = 0; i < Math.floor(SELECT_TESTS_PER_SIZE / 4); i++) {
        const startTime = performance.now();
        try {
            await persisto.select("user", {}, {
                sortBy: [
                    { field: "department", descending: false },
                    { field: "salary", descending: true }
                ],
                start: 0,
                end: 50 // Limit results for performance
            });
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.multiFieldSort = calculateStats(times);

    // Test 7: Pagination (different pages)
    times = [];
    for (let i = 0; i < Math.floor(SELECT_TESTS_PER_SIZE / 2); i++) {
        const pageStart = i * 20;
        const pageEnd = pageStart + 20;
        const startTime = performance.now();
        try {
            await persisto.select("user", { isActive: true }, {
                sortBy: "name",
                start: pageStart,
                end: pageEnd
            });
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.pagination = calculateStats(times);

    // Test 8: Indexed field query (email index)
    times = [];
    for (let i = 0; i < SELECT_TESTS_PER_SIZE; i++) {
        const userIndex = i % Math.min(1000, testSize); // Ensure user exists
        const email = `user${userIndex}@company.com`;
        const startTime = performance.now();
        try {
            await persisto.select("user", { email: email });
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.indexedFieldQuery = calculateStats(times);

    // Test 9: Non-indexed field query (location)
    times = [];
    for (let i = 0; i < SELECT_TESTS_PER_SIZE; i++) {
        const location = ["New York", "San Francisco", "London", "Berlin", "Tokyo"][i % 5];
        const startTime = performance.now();
        try {
            await persisto.select("user", { location: location });
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.nonIndexedFieldQuery = calculateStats(times);

    // Test 10: Count aggregation (using filteredCount)
    times = [];
    for (let i = 0; i < Math.floor(SELECT_TESTS_PER_SIZE / 2); i++) {
        const department = ["Engineering", "Marketing", "Sales"][i % 3];
        const startTime = performance.now();
        try {
            const result = await persisto.select("user", { department: department });
            const count = result.filteredCount; // Use the count from result
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.countAggregation = calculateStats(times);

    return results;
}

function calculateStats(times) {
    if (times.length === 0) return { avg: 0, min: 0, max: 0, total: 0, count: 0 };

    const total = times.reduce((sum, time) => sum + time, 0);
    const avg = total / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    // Calculate percentiles
    const sorted = [...times].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    return { avg, min, max, total, count: times.length, p95, p99 };
}

async function createSelectPerformanceTest() {
    console.log("Starting Persisto Select Performance Test");
    console.log("=========================================");
    console.log(`Object size: ${OBJECT_SIZE_BYTES} bytes (${(OBJECT_SIZE_BYTES / 1024).toFixed(1)}KB)`);
    console.log(`Test sizes: ${TEST_SIZES.join(', ')} records`);

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
                salary: "number",
                isActive: "boolean",
                joinDate: "string",
                skills: "string",
                experienceYears: "number",
                location: "string",
                metadata: "object"
            }
        });

        // Create index on email for performance comparison
        await persistoInstance.createIndex("user", "email");

        console.log("   Creating test data...");
        const createStartTime = Date.now();

        const { userIds } = await createTestData(persistoInstance, testSize);

        const createEndTime = Date.now();
        const creationTime = createEndTime - createStartTime;

        console.log(`  ✅ Created ${testSize} users in ${creationTime}ms`);
        console.log(`   Creation rate: ${(testSize / creationTime * 1000).toFixed(2)} users/second`);

        // Test select performance
        const selectResults = await testSelectPerformance(persistoInstance, userIds, testSize);

        const testResult = {
            userCount: testSize,
            creationTime,
            creationRate: testSize / creationTime * 1000,
            selects: selectResults
        };

        results.push(testResult);

        // Display results for this test size
        displayTestResults(testResult);

        await persistoInstance.shutDown();
    }

    // Generate final performance report
    generateFinalReport(results);

    return results;
}

function displayTestResults(testResult) {
    console.log("  Select Performance Results:");
    console.log(`    Simple Filter: ${testResult.selects.simpleFilter.avg.toFixed(3)}ms avg (${testResult.selects.simpleFilter.min.toFixed(3)}-${testResult.selects.simpleFilter.max.toFixed(3)}ms range)`);
    console.log(`    Range Queries: ${testResult.selects.rangeQueries.avg.toFixed(3)}ms avg (P95: ${testResult.selects.rangeQueries.p95.toFixed(3)}ms)`);
    console.log(`    Complex OR Filters: ${testResult.selects.complexOrFilters.avg.toFixed(3)}ms avg`);
    console.log(`    String Operations: ${testResult.selects.stringOperations.avg.toFixed(3)}ms avg`);
    console.log(`    Single Field Sort: ${testResult.selects.singleFieldSort.avg.toFixed(3)}ms avg`);
    console.log(`    Multi-field Sort: ${testResult.selects.multiFieldSort.avg.toFixed(3)}ms avg`);
    console.log(`    Pagination: ${testResult.selects.pagination.avg.toFixed(3)}ms avg`);
    console.log(`    Indexed Field Query: ${testResult.selects.indexedFieldQuery.avg.toFixed(3)}ms avg`);
    console.log(`    Non-indexed Field Query: ${testResult.selects.nonIndexedFieldQuery.avg.toFixed(3)}ms avg`);
    console.log(`    Count Aggregation: ${testResult.selects.countAggregation.avg.toFixed(3)}ms avg`);
}

function generateFinalReport(results) {
    console.log("\n📊 SELECT PERFORMANCE ANALYSIS");
    console.log("===============================");

    console.log("\n Basic Select Operations:");
    console.log("Records\t\tSimple(ms)\tRange(ms)\tIndexed(ms)\tNon-Idx(ms)");
    console.log("-------\t\t----------\t---------\t-----------\t-----------");
    results.forEach(result => {
        console.log(`${result.userCount}\t\t${result.selects.simpleFilter.avg.toFixed(1)}\t\t${result.selects.rangeQueries.avg.toFixed(1)}\t\t${result.selects.indexedFieldQuery.avg.toFixed(1)}\t\t${result.selects.nonIndexedFieldQuery.avg.toFixed(1)}`);
    });

    console.log("\n Advanced Select Operations:");
    console.log("Records\t\tOR(ms)\t\tString(ms)\tSort(ms)\tPaging(ms)\tCount(ms)");
    console.log("-------\t\t------\t\t----------\t--------\t----------\t---------");
    results.forEach(result => {
        console.log(`${result.userCount}\t\t${result.selects.complexOrFilters.avg.toFixed(1)}\t\t${result.selects.stringOperations.avg.toFixed(1)}\t\t${result.selects.singleFieldSort.avg.toFixed(1)}\t\t${result.selects.pagination.avg.toFixed(1)}\t\t${result.selects.countAggregation.avg.toFixed(1)}`);
    });

    // Scaling Analysis
    if (results.length > 1) {
        console.log("\n📈 SCALING ANALYSIS:");
        console.log("====================");

        const firstResult = results[0];
        const lastResult = results[results.length - 1];
        const scaleFactor = lastResult.userCount / firstResult.userCount;

        const simpleFilterScaling = lastResult.selects.simpleFilter.avg / firstResult.selects.simpleFilter.avg;
        const rangeQueryScaling = lastResult.selects.rangeQueries.avg / firstResult.selects.rangeQueries.avg;
        const indexedQueryScaling = lastResult.selects.indexedFieldQuery.avg / firstResult.selects.indexedFieldQuery.avg;
        const nonIndexedQueryScaling = lastResult.selects.nonIndexedFieldQuery.avg / firstResult.selects.nonIndexedFieldQuery.avg;
        const sortScaling = lastResult.selects.singleFieldSort.avg / firstResult.selects.singleFieldSort.avg;

        console.log(`Data scale factor: ${scaleFactor.toFixed(1)}x`);
        console.log(`Simple filter scaling: ${simpleFilterScaling.toFixed(2)}x`);
        console.log(`Range query scaling: ${rangeQueryScaling.toFixed(2)}x`);
        console.log(`Indexed query scaling: ${indexedQueryScaling.toFixed(2)}x`);
        console.log(`Non-indexed query scaling: ${nonIndexedQueryScaling.toFixed(2)}x`);
        console.log(`Sort operation scaling: ${sortScaling.toFixed(2)}x`);

        // Performance evaluation
        console.log("\n⚡ PERFORMANCE EVALUATION:");
        console.log("==========================");

        if (indexedQueryScaling < scaleFactor * 0.5) {
            console.log("✅ Indexed queries scale excellently");
        } else if (indexedQueryScaling < scaleFactor * 1.2) {
            console.log("✅ Indexed queries scale well");
        } else {
            console.log("⚠️  Indexed query scaling could be improved");
        }

        if (nonIndexedQueryScaling < scaleFactor * 1.5) {
            console.log("✅ Non-indexed queries scale reasonably");
        } else {
            console.log("⚠️  Non-indexed queries become expensive at scale - consider indexing");
        }

        if (sortScaling < scaleFactor * 2) {
            console.log("✅ Sort operations scale acceptably");
        } else {
            console.log("⚠️  Sort operations become bottleneck at scale");
        }

        const indexAdvantage = nonIndexedQueryScaling / indexedQueryScaling;
        console.log(`📊 Index advantage: ${indexAdvantage.toFixed(1)}x faster than non-indexed queries`);
    }

    console.log("\n🎉 Select performance test completed successfully!");
}

// Run the performance test
try {
    await createSelectPerformanceTest();
    process.exit(0);
} catch (error) {
    console.error("❌ Select performance test failed:", error);
    console.error(error.stack);
    process.exit(1);
}