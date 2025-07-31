/**
 * Persisto Disk I/O Performance Test
 * 
 * This test measures disk I/O performance degradation as dataset size grows.
 * Specifically tracks write and read times to confirm performance bottlenecks.
 * 
 * Features:
 * - Individual disk write time measurement
 * - Individual disk read time measurement  
 * - Performance degradation tracking over dataset size
 * - Detailed reporting to separate file
 * - Memory usage correlation with I/O performance
 * 
 * Environment Variables:
 * - OBJECT_SIZE: Size of each test object in bytes (default: 1024 = 1KB)
 * - TEST_SIZE: Number of objects to create (default: 50000)
 * - SAMPLE_INTERVAL: How often to sample I/O times (default: 1000)
 * 
 * Output: Creates performance_report_[timestamp].json with detailed metrics
 */

import { } from "../../clean.mjs";

await $$.clean();

import { initialisePersisto } from '../../index.cjs';
import fs from 'fs/promises';

// Performance test configuration
const TEST_SIZE = parseInt(process.env.TEST_SIZE) || 50000; // Total objects to create
const SAMPLE_INTERVAL = parseInt(process.env.SAMPLE_INTERVAL) || 1000; // Sample I/O times every N objects
const OBJECT_SIZE_BYTES = parseInt(process.env.OBJECT_SIZE) || 1024; // Default 1KB object size
const RETRIEVAL_SAMPLES = 100; // Number of random retrievals to test at each sample point

/**
 * Utilities for I/O measurement and reporting
 */
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

/**
 * Measures disk write time for a single object creation
 */
async function measureDiskWrite(persisto, userData, objectCount) {
    const startTime = performance.now();
    const user = await persisto.createUser(userData);
    const endTime = performance.now();

    return {
        duration: endTime - startTime,
        objectId: user.id,
        objectCount: objectCount,
        timestamp: Date.now()
    };
}

/**
 * Measures disk read time for a single object load
 */
async function measureDiskRead(persisto, objectId, objectCount) {
    const startTime = performance.now();
    const user = await persisto.getUser(objectId);
    const endTime = performance.now();

    return {
        duration: endTime - startTime,
        objectId: objectId,
        objectCount: objectCount,
        timestamp: Date.now(),
        found: !!user
    };
}

/**
 * Calculate statistics for an array of measurements
 */
function calculateStats(measurements) {
    if (measurements.length === 0) return null;

    const durations = measurements.map(m => m.duration);
    durations.sort((a, b) => a - b);

    return {
        count: measurements.length,
        avg: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        min: durations[0],
        max: durations[durations.length - 1],
        median: durations[Math.floor(durations.length / 2)],
        p95: durations[Math.floor(durations.length * 0.95)],
        p99: durations[Math.floor(durations.length * 0.99)]
    };
}

/**
 * Creates a user object with specified size
 */
function createUserObjectWithSize(userIndex, departments, targetSizeBytes) {
    const baseUser = {
        email: `user${userIndex}@example.com`,
        name: `User ${userIndex}`,
        age: 25 + (userIndex % 40),
        department: departments[userIndex % departments.length],
        createdAt: new Date().toISOString(),
        isActive: userIndex % 3 !== 0,
        metadata: {
            loginCount: userIndex % 100,
            lastLoginIP: `192.168.1.${userIndex % 255}`,
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

async function createDiskIOTest() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = `performance_report_${timestamp}.json`;

    console.log("Starting Persisto Disk I/O Performance Test");
    console.log("===========================================");
    console.log(`Test size: ${TEST_SIZE} objects`);
    console.log(`Object size: ${OBJECT_SIZE_BYTES} bytes (${(OBJECT_SIZE_BYTES / 1024).toFixed(1)}KB)`);
    console.log(`Sampling every ${SAMPLE_INTERVAL} objects`);
    console.log(`Report file: ${reportFile}`);

    // Initialize test report structure
    const report = {
        testConfig: {
            testSize: TEST_SIZE,
            objectSizeBytes: OBJECT_SIZE_BYTES,
            sampleInterval: SAMPLE_INTERVAL,
            retrievalSamples: RETRIEVAL_SAMPLES,
            timestamp: timestamp
        },
        phases: [],
        summary: {}
    };

    // Clean and initialize
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

    await persistoInstance.createIndex("user", "email");
    await persistoInstance.createGrouping("usersByDept", "user", "department");

    const departments = ["Engineering", "Marketing", "Sales", "HR", "Finance"];
    const startTime = Date.now();
    const createdObjects = [];

    console.log("Starting object creation with I/O measurement...");

    // Main creation loop with detailed I/O measurement
    for (let i = 0; i < TEST_SIZE; i++) {
        const userData = createUserObjectWithSize(i, departments, OBJECT_SIZE_BYTES);

        // Measure write time for this object
        const writeResult = await measureDiskWrite(persistoInstance, userData, i + 1);
        createdObjects.push(writeResult.objectId);

        // Sample measurements at intervals
        if ((i + 1) % SAMPLE_INTERVAL === 0 || i === TEST_SIZE - 1) {
            const currentCount = i + 1;
            const currentMemory = getMemoryUsage();

            console.log(`Sampling at ${currentCount} objects...`);

            // Collect write samples for recent objects
            const recentWrites = [];
            const sampleStart = Math.max(0, currentCount - SAMPLE_INTERVAL);

            for (let j = 0; j < Math.min(100, SAMPLE_INTERVAL); j++) {
                const sampleIndex = sampleStart + j;
                if (sampleIndex < currentCount) {
                    const sampleData = createUserObjectWithSize(sampleIndex + TEST_SIZE, departments, OBJECT_SIZE_BYTES);
                    const sampleWrite = await measureDiskWrite(persistoInstance, sampleData, currentCount);
                    recentWrites.push(sampleWrite);
                    createdObjects.push(sampleWrite.objectId);
                }
            }

            // Collect read samples
            const readSamples = [];
            for (let j = 0; j < Math.min(RETRIEVAL_SAMPLES, currentCount); j++) {
                const randomIndex = Math.floor(Math.random() * currentCount);
                const randomObjectId = createdObjects[randomIndex];
                const readResult = await measureDiskRead(persistoInstance, randomObjectId, currentCount);
                readSamples.push(readResult);
            }

            // Calculate statistics
            const writeStats = calculateStats(recentWrites);
            const readStats = calculateStats(readSamples);

            // Calculate current creation rate
            const elapsedTime = Date.now() - startTime;
            const currentRate = currentCount / elapsedTime * 1000;

            const phase = {
                objectCount: currentCount,
                elapsedTimeMs: elapsedTime,
                creationRate: currentRate,
                memory: currentMemory,
                diskIO: {
                    writes: writeStats,
                    reads: readStats
                },
                rawMeasurements: {
                    writes: recentWrites.slice(-10), // Keep last 10 for debugging
                    reads: readSamples.slice(-10)
                }
            };

            report.phases.push(phase);

            console.log(`  Objects: ${currentCount}`);
            console.log(`  Rate: ${currentRate.toFixed(2)} objects/sec`);
            console.log(`  Write time - avg: ${writeStats.avg.toFixed(2)}ms, max: ${writeStats.max.toFixed(2)}ms`);
            console.log(`  Read time - avg: ${readStats.avg.toFixed(2)}ms, max: ${readStats.max.toFixed(2)}ms`);
            console.log(`  Memory: ${currentMemory.rss}MB RSS, ${currentMemory.heapUsed}MB heap`);
        }

        // Progress indicator
        if ((i + 1) % 5000 === 0) {
            const elapsedTime = Date.now() - startTime;
            const currentRate = (i + 1) / elapsedTime * 1000;
            const progress = ((i + 1) / TEST_SIZE * 100).toFixed(1);
            console.log(`Progress: ${progress}% (${i + 1}/${TEST_SIZE}) - ${currentRate.toFixed(2)} objects/sec`);
        }
    }

    const totalTime = Date.now() - startTime;

    // Generate summary analysis
    const phases = report.phases;
    const firstPhase = phases[0];
    const lastPhase = phases[phases.length - 1];

    report.summary = {
        totalTimeMs: totalTime,
        totalObjects: TEST_SIZE,
        averageRate: TEST_SIZE / totalTime * 1000,
        performance: {
            rateChange: ((lastPhase.creationRate / firstPhase.creationRate - 1) * 100),
            writeTimeChange: ((lastPhase.diskIO.writes.avg / firstPhase.diskIO.writes.avg - 1) * 100),
            readTimeChange: ((lastPhase.diskIO.reads.avg / firstPhase.diskIO.reads.avg - 1) * 100),
            memoryGrowth: ((lastPhase.memory.rss / firstPhase.memory.rss - 1) * 100)
        },
        trends: {},
        recommendations: []
    };

    // Analyze trends
    const writeAvgs = phases.map(p => p.diskIO.writes.avg);
    const readAvgs = phases.map(p => p.diskIO.reads.avg);
    const rates = phases.map(p => p.creationRate);

    report.summary.trends = {
        writeTimeProgression: writeAvgs,
        readTimeProgression: readAvgs,
        rateProgression: rates,
        memoryProgression: phases.map(p => p.memory.rss)
    };

    // Generate recommendations
    if (report.summary.performance.rateChange < -20) {
        report.summary.recommendations.push("Significant creation rate degradation detected - consider batch operations");
    }

    if (report.summary.performance.writeTimeChange > 50) {
        report.summary.recommendations.push("Disk write times increasing significantly - file system bottleneck likely");
    }

    if (report.summary.performance.readTimeChange > 30) {
        report.summary.recommendations.push("Read performance degrading - consider indexing improvements");
    }

    // Save report to file
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

    console.log("\n===========================================");
    console.log("DISK I/O PERFORMANCE ANALYSIS COMPLETE");
    console.log("===========================================");
    console.log(`Total time: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`Average rate: ${(TEST_SIZE / totalTime * 1000).toFixed(2)} objects/sec`);
    console.log(`Rate change: ${report.summary.performance.rateChange.toFixed(1)}%`);
    console.log(`Write time change: ${report.summary.performance.writeTimeChange.toFixed(1)}%`);
    console.log(`Read time change: ${report.summary.performance.readTimeChange.toFixed(1)}%`);
    console.log(`Memory growth: ${report.summary.performance.memoryGrowth.toFixed(1)}%`);
    console.log(`\nDetailed report saved to: ${reportFile}`);

    if (report.summary.recommendations.length > 0) {
        console.log("\nRecommendations:");
        report.summary.recommendations.forEach(rec => console.log(`  • ${rec}`));
    }

    await persistoInstance.shutDown();
    return report;
}

// Run the disk I/O test
try {
    await createDiskIOTest();
    process.exit(0);
} catch (error) {
    console.error("❌ Disk I/O test failed:", error);
    process.exit(1);
}