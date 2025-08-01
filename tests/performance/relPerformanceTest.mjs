/**
 * Persisto Rels Performance Test
 * 
 * This test evaluates Persisto's rel performance with configurable object sizes.
 * Tests 8 different types of rel operations across multiple data sizes to analyze scaling behavior.
 * 
 * Test Types:
 * 1. Left-to-Right Rels: Basic rel retrieval (user -> projects)
 * 2. Right-to-Left Rels: Reverse rel retrieval (project -> users) 
 * 3. Rel with Data: Rels that load full object data
 * 4. Rel with Sorting: Rels with result sorting
 * 5. Rel with Pagination: Paginated rel results
 * 6. Chained Rels: Multi-level rels (user -> projects -> tasks)
 * 7. Bidirectional Rels: Both directions simultaneously
 * 8. Multiple Rel Types: Multiple rel types from same object
 * 
 * Environment Variables:
 * - OBJECT_SIZE: Size of each test object in bytes (default: 1024 = 1KB)
 * - JOIN_RATIO: Ratio of rel relationships to create (default: 0.8 = 80%)
 * 
 * Usage Examples:
 * - Default (1KB objects): node relsPerformanceTest.mjs
 * - 512 byte objects: OBJECT_SIZE=512 node relsPerformanceTest.mjs
 * - 4KB objects with fewer rels: OBJECT_SIZE=4096 JOIN_RATIO=0.5 node relsPerformanceTest.mjs
 * - Large objects with many rels: OBJECT_SIZE=8192 JOIN_RATIO=0.9 node relsPerformanceTest.mjs
 */

import { } from "../../clean.mjs";

await $$.clean();

import { initialisePersisto } from '../../index.cjs';

// Performance test configuration
const TEST_SIZES = [10000, 50000, 100000];
const JOINS_TESTS_PER_SIZE = 100; // Number of rel operations to test per size
const OBJECT_SIZE_BYTES = parseInt(process.env.OBJECT_SIZE) || 1024; // Default 1KB object size
const JOIN_RATIO = parseFloat(process.env.JOIN_RATIO) || 0.8; // Ratio of objects to rel

/**
 * Memory usage tracking utilities
 */
function getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
        rss: usage.rss, // Resident Set Size - total memory allocated
        heapUsed: usage.heapUsed, // Heap actually used
        heapTotal: usage.heapTotal, // Total heap allocated
        external: usage.external, // Memory used by C++ objects
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
 * Creates an object with approximately the specified size in bytes
 * @param {number} index - Index for generating unique data
 * @param {string} type - Type of object (user, project, task)
 * @param {string[]} categories - Array of category values for variation
 * @param {number} targetSizeBytes - Target size in bytes
 * @returns {object} Object with padding to reach target size
 */
function createObjectWithSize(index, type, categories, targetSizeBytes) {
    let baseObject;

    if (type === 'user') {
        baseObject = {
            email: `user${index}@company.com`,
            name: `User ${index}`,
            age: 25 + (index % 40),
            department: categories[index % categories.length],
            salary: 50000 + (index % 100) * 1000,
            relDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
            isActive: index % 10 !== 0,
            skills: ["JavaScript", "Python", "Java"][index % 3],
            metadata: {
                loginCount: Math.floor(Math.random() * 1000),
                lastLogin: new Date().toISOString(),
                preferences: {
                    theme: index % 2 === 0 ? "dark" : "light",
                    notifications: index % 3 === 0
                }
            },
            projects: [], // Will be synced via rels
            tasks: []     // Will be synced via rels
        };
    } else if (type === 'project') {
        baseObject = {
            name: `Project ${index}`,
            description: `Description for project ${index}`,
            status: categories[index % categories.length],
            priority: ["Low", "Medium", "High", "Critical"][index % 4],
            budget: 10000 + (index % 100) * 5000,
            startDate: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000).toISOString(),
            expectedEndDate: new Date(Date.now() + Math.random() * 180 * 24 * 60 * 60 * 1000).toISOString(),
            techStack: ["JavaScript", "Python", "React"][index % 3],
            complexity: (index % 5) + 1,
            teamSize: (index % 10) + 3,
            users: [], // Will be synced via rels
            tasks: []  // Will be synced via rels
        };
    } else { // task
        baseObject = {
            title: `Task ${index}`,
            description: `Task description ${index}`,
            priority: categories[index % categories.length],
            status: ["Todo", "In Progress", "Review", "Done"][index % 4],
            estimatedHours: (index % 40) + 1,
            actualHours: Math.max(0, (index % 40) + 1 + (Math.random() - 0.5) * 10),
            dueDate: new Date(Date.now() + Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString(),
            tags: ["bug", "feature", "refactor"][index % 3],
            blockers: index % 5 === 0 ? ["dependency", "resource"] : [],
            users: [],    // Will be synced via rels
            projects: []  // Will be synced via rels
        };
    }

    // Calculate current size
    let currentSize = JSON.stringify(baseObject).length;

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

            baseObject.paddingData = padding;
        }
    }

    return baseObject;
}

async function createRelsPerformanceTest() {
    console.log("Starting Persisto Rels Performance Test");
    console.log("=========================================");
    console.log(`Object size: ${OBJECT_SIZE_BYTES} bytes (${(OBJECT_SIZE_BYTES / 1024).toFixed(1)}KB)`);
    console.log(`Rel ratio: ${(JOIN_RATIO * 100).toFixed(0)}%`);

    const results = [];

    for (const testSize of TEST_SIZES) {
        console.log(`\n Testing with ${testSize} objects...`);

        // Measure initial memory
        const initialMemory = getMemoryUsage();

        // Clean and initialize fresh instance for each test
        await $$.clean();
        const persistoInstance = await initialisePersisto();

        // Configure types
        await persistoInstance.configureTypes({
            user: {},
            project: {},
            task: {}
        });

        // Create indexes for better performance
        await persistoInstance.createIndex("user", "email");
        await persistoInstance.createIndex("project", "name");
        await persistoInstance.createIndex("task", "title");

        // Create rels
        await persistoInstance.createRel("userProjects", "user", "project");
        await persistoInstance.createRel("userTasks", "user", "task");
        await persistoInstance.createRel("projectTasks", "project", "task");

        // Create grouping for department-based queries
        await persistoInstance.createGrouping("usersByDept", "user", "department");

        console.log("   Creating test objects...");
        const createStartTime = Date.now();
        const beforeCreationMemory = getMemoryUsage();

        // Create test data
        const { userIds, projectIds, taskIds } = await createTestData(persistoInstance, testSize);

        const createEndTime = Date.now();
        const afterCreationMemory = getMemoryUsage();
        const creationTime = createEndTime - createStartTime;
        const creationMemoryDelta = calculateMemoryDelta(beforeCreationMemory, afterCreationMemory);

        console.log(`   Created ${testSize * 3} objects in ${creationTime}ms`);
        console.log(`   Creation rate: ${(testSize * 3 / creationTime * 1000).toFixed(2)} objects/second`);
        console.log(`   Memory used: ${formatMemorySize(creationMemoryDelta.heapUsedChange)} heap, ${formatMemorySize(creationMemoryDelta.rssChange)} RSS`);

        // Setup rel relationships
        console.log("   Setting up rel relationships...");
        const setupStartTime = Date.now();
        const beforeRelSetupMemory = getMemoryUsage();
        const relStats = await setupRelRelationships(persistoInstance, userIds, projectIds, taskIds);
        const setupEndTime = Date.now();
        const afterRelSetupMemory = getMemoryUsage();
        const setupTime = setupEndTime - setupStartTime;
        const relSetupMemoryDelta = calculateMemoryDelta(beforeRelSetupMemory, afterRelSetupMemory);

        console.log(`   Created ${relStats.totalRels} rel relationships in ${setupTime}ms (expected: ${relStats.expectedRels})`);
        if (relStats.relErrors > 0) {
            console.log(`   Rel creation errors: ${relStats.relErrors}`);
        }
        console.log(`   Rel creation rate: ${(relStats.totalRels / setupTime * 1000).toFixed(2)} rels/second`);
        console.log(`   Rel setup memory: ${formatMemorySize(relSetupMemoryDelta.heapUsedChange)} heap, ${formatMemorySize(relSetupMemoryDelta.rssChange)} RSS`);

        // Test rel performance
        console.log("   Testing rel performance...");
        const beforeRelTestMemory = getMemoryUsage();
        const relResults = await testRelPerformance(persistoInstance, userIds, projectIds, taskIds);
        const afterRelTestMemory = getMemoryUsage();
        const relTestMemoryDelta = calculateMemoryDelta(beforeRelTestMemory, afterRelTestMemory);
        const totalMemoryDelta = calculateMemoryDelta(initialMemory, afterRelTestMemory);

        const testResult = {
            objectCount: testSize,
            creationTime,
            creationRate: testSize * 3 / creationTime * 1000,
            setupTime,
            relStats,
            rels: relResults,
            memory: {
                creation: {
                    heapUsed: creationMemoryDelta.heapUsedChange,
                    rss: creationMemoryDelta.rssChange,
                    heapTotal: creationMemoryDelta.heapTotalChange
                },
                relSetup: {
                    heapUsed: relSetupMemoryDelta.heapUsedChange,
                    rss: relSetupMemoryDelta.rssChange,
                    heapTotal: relSetupMemoryDelta.heapTotalChange
                },
                relTest: {
                    heapUsed: relTestMemoryDelta.heapUsedChange,
                    rss: relTestMemoryDelta.rssChange,
                    heapTotal: relTestMemoryDelta.heapTotalChange
                },
                total: {
                    heapUsed: totalMemoryDelta.heapUsedChange,
                    rss: totalMemoryDelta.rssChange,
                    heapTotal: totalMemoryDelta.heapTotalChange
                },
                final: {
                    heapUsed: afterRelTestMemory.heapUsed,
                    rss: afterRelTestMemory.rss,
                    heapTotal: afterRelTestMemory.heapTotal
                }
            }
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

async function createTestData(persisto, size) {
    const userIds = [];
    const projectIds = [];
    const taskIds = [];

    const departments = ["Engineering", "Marketing", "Sales", "HR", "Finance", "Operations"];
    const projectStatuses = ["Planning", "Active", "Testing", "Completed", "On Hold"];
    const taskPriorities = ["Low", "Medium", "High", "Critical"];

    // Create users
    for (let i = 0; i < size; i++) {
        const userData = createObjectWithSize(i, 'user', departments, OBJECT_SIZE_BYTES);
        const user = await persisto.createUser(userData);
        userIds.push(user.id);

        // Progress indicator for large datasets
        if (i > 0 && i % 10000 === 0) {
            const elapsed = Date.now();
            console.log(`     Created ${i} users...`);
        }
    }

    // Create projects
    for (let i = 0; i < size; i++) {
        const projectData = createObjectWithSize(i, 'project', projectStatuses, OBJECT_SIZE_BYTES);
        const project = await persisto.createProject(projectData);
        projectIds.push(project.id);

        // Progress indicator for large datasets
        if (i > 0 && i % 10000 === 0) {
            console.log(`     Created ${i} projects...`);
        }
    }

    // Create tasks
    for (let i = 0; i < size; i++) {
        const taskData = createObjectWithSize(i, 'task', taskPriorities, OBJECT_SIZE_BYTES);
        const task = await persisto.createTask(taskData);
        taskIds.push(task.id);

        // Progress indicator for large datasets
        if (i > 0 && i % 10000 === 0) {
            console.log(`     Created ${i} tasks...`);
        }
    }

    return { userIds, projectIds, taskIds };
}

async function setupRelRelationships(persisto, userIds, projectIds, taskIds) {
    let totalRels = 0;
    let relErrors = 0;

    const relCount = Math.floor(userIds.length * JOIN_RATIO);

    // Try different ways to access the storage
    const storage = persisto.systemLogger?.smartStorage || persisto._smartStorage;

    if (!storage) {
        console.log("   Warning: Could not access storage for rel creation");
        return { totalRels: 0, expectedRels: relCount * 3, relErrors };
    }

    // Create user-project relationships
    for (let i = 0; i < relCount; i++) {
        const userId = userIds[i];
        const projectId = projectIds[i % projectIds.length];
        try {
            // Try the direct persisto method first
            await persisto.systemLogger.smartStorage.addRel("userProjects", userId, projectId);
            totalRels++;
        } catch (error) {
            // Fallback to storage directly
            try {
                if (storage && storage.addRel) {
                    await storage.addRel("userProjects", userId, projectId);
                    totalRels++;
                } else {
                    throw new Error("Storage not accessible");
                }
            } catch (error2) {
                relErrors++;
                if (relErrors <= 3) { // Only log first few errors
                    console.log(`   Rel error (user-project): ${error2.message}`);
                }
            }
        }
    }

    // Create user-task relationships
    for (let i = 0; i < relCount; i++) {
        const userId = userIds[i];
        const taskId = taskIds[i % taskIds.length];
        try {
            // Try the direct persisto method first
            await persisto.systemLogger.smartStorage.addRel("userTasks", userId, taskId);
            totalRels++;
        } catch (error) {
            // Fallback to storage directly
            try {
                if (storage && storage.addRel) {
                    await storage.addRel("userTasks", userId, taskId);
                    totalRels++;
                } else {
                    throw new Error("Storage not accessible");
                }
            } catch (error2) {
                relErrors++;
                if (relErrors <= 3) { // Only log first few errors
                    console.log(`   Rel error (user-task): ${error2.message}`);
                }
            }
        }
    }

    // Create project-task relationships
    for (let i = 0; i < relCount; i++) {
        const projectId = projectIds[i];
        const taskId = taskIds[i % taskIds.length];
        try {
            // Try the direct persisto method first
            await persisto.systemLogger.smartStorage.addRel("projectTasks", projectId, taskId);
            totalRels++;
        } catch (error) {
            // Fallback to storage directly
            try {
                if (storage && storage.addRel) {
                    await storage.addRel("projectTasks", projectId, taskId);
                    totalRels++;
                } else {
                    throw new Error("Storage not accessible");
                }
            } catch (error2) {
                relErrors++;
                if (relErrors <= 3) { // Only log first few errors
                    console.log(`   Rel error (project-task): ${error2.message}`);
                }
            }
        }
    }

    if (relErrors > 3) {
        console.log(`   ... and ${relErrors - 3} more rel errors`);
    }

    return { totalRels, expectedRels: relCount * 3, relErrors };
}

async function testRelPerformance(persisto, userIds, projectIds, taskIds) {
    const results = {};

    // Test 1: Get project IDs for users (high-level method - IDs only)
    let times = [];
    for (let i = 0; i < JOINS_TESTS_PER_SIZE; i++) {
        const userId = userIds[i % userIds.length];
        const startTime = performance.now();
        try {
            await persisto.getProjectIdsFromRelForUser(userId);
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.getUserProjectIds = calculateStats(times);

    // Test 2: Get user IDs for projects (high-level method - IDs only)
    times = [];
    for (let i = 0; i < JOINS_TESTS_PER_SIZE; i++) {
        const projectId = projectIds[i % projectIds.length];
        const startTime = performance.now();
        try {
            await persisto.getUserIdsFromRelForProject(projectId);
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.getProjectUserIds = calculateStats(times);

    // Test 3: Get full project objects for users (high-level method - full data)
    times = [];
    for (let i = 0; i < Math.floor(JOINS_TESTS_PER_SIZE / 2); i++) {
        const userId = userIds[i % userIds.length];
        const startTime = performance.now();
        try {
            await persisto.getProjectsFromRelForUser(userId, null, 0, 10);
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.getUserProjectsData = calculateStats(times);

    // Test 4: Get tasks with sorting (high-level method - sorted data)
    times = [];
    for (let i = 0; i < Math.floor(JOINS_TESTS_PER_SIZE / 2); i++) {
        const projectId = projectIds[i % projectIds.length];
        const startTime = performance.now();
        try {
            await persisto.getTasksFromRelForProject(projectId, "title", 0, 10, false);
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.getProjectTasksSorted = calculateStats(times);

    // Test 5: Get tasks with pagination (high-level method - paginated data)
    times = [];
    for (let i = 0; i < Math.floor(JOINS_TESTS_PER_SIZE / 2); i++) {
        const userId = userIds[i % userIds.length];
        const startTime = performance.now();
        try {
            await persisto.getTasksFromRelForUser(userId, null, i * 5, (i * 5) + 5);
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.getUserTasksPaginated = calculateStats(times);

    // Test 6: Department grouping (like getUsersFromRelWithDepartments)
    times = [];
    const departments = ["Engineering", "Marketing", "Sales", "HR", "Finance"];
    for (let i = 0; i < Math.floor(JOINS_TESTS_PER_SIZE / 2); i++) {
        const department = departments[i % departments.length];
        const startTime = performance.now();
        try {
            await persisto.getUsersByDeptByDepartment(department);
        } catch (error) {
            // Continue on error
        }
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.getUsersByDepartment = calculateStats(times);

    // Test 7: Chained rels using high-level methods (user -> projects -> tasks)
    times = [];
    for (let i = 0; i < Math.floor(JOINS_TESTS_PER_SIZE / 4); i++) {
        const userId = userIds[i % userIds.length];
        const startTime = performance.now();

        try {
            // Get user's project IDs using high-level method
            const userProjectIds = await persisto.getProjectIdsFromRelForUser(userId) || [];

            // For each project, get its task IDs using high-level method (limit to 3 projects for performance)
            let allTaskIds = [];
            for (const projectId of userProjectIds.slice(0, 3)) {
                const projectTaskIds = await persisto.getTaskIdsFromRelForProject(projectId) || [];
                allTaskIds = allTaskIds.concat(projectTaskIds);
            }
        } catch (error) {
            // Continue on error
        }

        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.chainedRelsHighLevel = calculateStats(times);

    // Test 8: Bidirectional rels using high-level methods
    times = [];
    for (let i = 0; i < Math.floor(JOINS_TESTS_PER_SIZE / 2); i++) {
        const userId = userIds[i % userIds.length];
        const projectId = projectIds[i % projectIds.length];
        const startTime = performance.now();

        try {
            // Get both directions using high-level methods
            await Promise.all([
                persisto.getProjectIdsFromRelForUser(userId),
                persisto.getUserIdsFromRelForProject(projectId)
            ]);
        } catch (error) {
            // Continue on error
        }

        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.bidirectionalRelsHighLevel = calculateStats(times);

    // Test 9: Multiple rel types from same object using high-level methods
    times = [];
    for (let i = 0; i < Math.floor(JOINS_TESTS_PER_SIZE / 4); i++) {
        const userId = userIds[i % userIds.length];
        const startTime = performance.now();

        try {
            // Get all related object IDs for a user using high-level methods
            await Promise.all([
                persisto.getProjectIdsFromRelForUser(userId),
                persisto.getTaskIdsFromRelForUser(userId)
            ]);
        } catch (error) {
            // Continue on error
        }

        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    results.multipleRelTypesHighLevel = calculateStats(times);

    return results;
}

function calculateStats(times) {
    if (times.length === 0) return { avg: 0, min: 0, max: 0, total: 0, count: 0 };

    const total = times.reduce((sum, time) => sum + time, 0);
    const avg = total / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    return { avg, min, max, total, count: times.length };
}

function displayTestResults(testResult) {
    console.log("  High-Level Method Results:");
    console.log(`    getUserProjectIds: ${testResult.rels.getUserProjectIds.avg.toFixed(3)}ms avg (${testResult.rels.getUserProjectIds.min.toFixed(3)}-${testResult.rels.getUserProjectIds.max.toFixed(3)}ms range)`);
    console.log(`    getProjectUserIds: ${testResult.rels.getProjectUserIds.avg.toFixed(3)}ms avg (${testResult.rels.getProjectUserIds.min.toFixed(3)}-${testResult.rels.getProjectUserIds.max.toFixed(3)}ms range)`);
    console.log(`    getUserProjectsData: ${testResult.rels.getUserProjectsData.avg.toFixed(3)}ms avg`);
    console.log(`    getProjectTasksSorted: ${testResult.rels.getProjectTasksSorted.avg.toFixed(3)}ms avg`);
    console.log(`    getUserTasksPaginated: ${testResult.rels.getUserTasksPaginated.avg.toFixed(3)}ms avg`);
    console.log(`    getUsersByDepartment: ${testResult.rels.getUsersByDepartment.avg.toFixed(3)}ms avg`);
    console.log(`    chainedRelsHighLevel: ${testResult.rels.chainedRelsHighLevel.avg.toFixed(3)}ms avg`);
    console.log(`    bidirectionalRelsHighLevel: ${testResult.rels.bidirectionalRelsHighLevel.avg.toFixed(3)}ms avg`);
    console.log(`    multipleRelTypesHighLevel: ${testResult.rels.multipleRelTypesHighLevel.avg.toFixed(3)}ms avg`);
    console.log(`  Memory Usage:`);
    console.log(`    Object Creation: ${formatMemorySize(testResult.memory.creation.heapUsed)} heap, ${formatMemorySize(testResult.memory.creation.rss)} RSS`);
    console.log(`    Rel Setup: ${formatMemorySize(testResult.memory.relSetup.heapUsed)} heap, ${formatMemorySize(testResult.memory.relSetup.rss)} RSS`);
    console.log(`    Total Used: ${formatMemorySize(testResult.memory.total.heapUsed)} heap, ${formatMemorySize(testResult.memory.total.rss)} RSS`);
    console.log(`    Memory per Object: ${(testResult.memory.creation.heapUsed / (testResult.objectCount * 3) / 1024).toFixed(2)}KB heap/object`);
}

function generateFinalReport(results) {
    console.log("\n JOINS PERFORMANCE ANALYSIS");
    console.log("============================");

    console.log("\n High-Level Relationship Methods - Basic Operations:");
    console.log("Objects\t\tUserProjs(ms)\tProjUsers(ms)\tProjectData(ms)\tChained(ms)");
    console.log("-------\t\t-------------\t-------------\t---------------\t-----------");
    results.forEach(result => {
        console.log(`${result.objectCount}\t\t${result.rels.getUserProjectIds.avg.toFixed(1)}\t\t${result.rels.getProjectUserIds.avg.toFixed(1)}\t\t${result.rels.getUserProjectsData.avg.toFixed(1)}\t\t${result.rels.chainedRelsHighLevel.avg.toFixed(1)}`);
    });

    console.log("\n High-Level Relationship Methods - Advanced Operations:");
    console.log("Objects\t\tSorted(ms)\tPaging(ms)\tDepts(ms)\tBidir(ms)\tMultiple(ms)");
    console.log("-------\t\t----------\t----------\t---------\t---------\t------------");
    results.forEach(result => {
        console.log(`${result.objectCount}\t\t${result.rels.getProjectTasksSorted.avg.toFixed(1)}\t\t${result.rels.getUserTasksPaginated.avg.toFixed(1)}\t\t${result.rels.getUsersByDepartment.avg.toFixed(1)}\t\t${result.rels.bidirectionalRelsHighLevel.avg.toFixed(1)}\t\t${result.rels.multipleRelTypesHighLevel.avg.toFixed(1)}`);
    });

    // Scaling Analysis
    console.log("\nSCALING ANALYSIS:");
    console.log("==================");

    if (results.length > 1) {
        const firstResult = results[0];
        const lastResult = results[results.length - 1];
        const scaleFactor = lastResult.objectCount / firstResult.objectCount;

        const userProjectIdsScaling = lastResult.rels.getUserProjectIds.avg / firstResult.rels.getUserProjectIds.avg;
        const projectUserIdsScaling = lastResult.rels.getProjectUserIds.avg / firstResult.rels.getProjectUserIds.avg;
        const chainedRelScaling = lastResult.rels.chainedRelsHighLevel.avg / firstResult.rels.chainedRelsHighLevel.avg;
        const dataRelScaling = lastResult.rels.getUserProjectsData.avg / firstResult.rels.getUserProjectsData.avg;
        const departmentScaling = lastResult.rels.getUsersByDepartment.avg / firstResult.rels.getUsersByDepartment.avg;

        console.log(`Data scale factor: ${scaleFactor.toFixed(1)}x`);
        console.log(`getUserProjectIds scaling: ${userProjectIdsScaling.toFixed(2)}x`);
        console.log(`getProjectUserIds scaling: ${projectUserIdsScaling.toFixed(2)}x`);
        console.log(`getUserProjectsData scaling: ${dataRelScaling.toFixed(2)}x`);
        console.log(`getUsersByDepartment scaling: ${departmentScaling.toFixed(2)}x`);
        console.log(`Chained rel scaling: ${chainedRelScaling.toFixed(2)}x`);

        // Performance evaluation
        console.log("\nPERFORMANCE EVALUATION:");
        console.log("=======================");

        if (userProjectIdsScaling < scaleFactor * 0.5) {
            console.log("✅ High-level ID retrieval methods scale well");
        } else {
            console.log("⚠️  High-level ID retrieval scaling could be improved");
        }

        if (chainedRelScaling < scaleFactor * 2) {
            console.log("✅ Chained high-level rel performance is acceptable");
        } else {
            console.log("⚠️  Chained high-level rels become expensive at scale");
        }

        if (dataRelScaling < scaleFactor * 1.5) {
            console.log("✅ High-level data loading methods scale reasonably");
        } else {
            console.log("⚠️  High-level data loading becomes bottleneck at scale");
        }

        if (departmentScaling < scaleFactor * 1.2) {
            console.log("✅ Department grouping methods scale well");
        } else {
            console.log("⚠️  Department grouping performance degrades at scale");
        }
    }


    // Memory Usage Analysis
    console.log("\nMEMORY USAGE ANALYSIS:");
    console.log("======================");

    console.log("\nMemory Usage by Dataset Size:");
    console.log("Objects\t\tCreation(MB)\tRel Setup(MB)\tTotal(MB)\tPer Object(KB)");
    console.log("-------\t\t------------\t--------------\t---------\t--------------");
    results.forEach(result => {
        const creationMB = result.memory.creation.heapUsed / (1024 * 1024);
        const relSetupMB = result.memory.relSetup.heapUsed / (1024 * 1024);
        const totalMB = result.memory.total.heapUsed / (1024 * 1024);
        const perObjectKB = result.memory.creation.heapUsed / (result.objectCount * 3) / 1024;
        console.log(`${result.objectCount}\t\t${creationMB.toFixed(1)}\t\t${relSetupMB.toFixed(1)}\t\t${totalMB.toFixed(1)}\t\t${perObjectKB.toFixed(2)}`);
    });

    // Memory efficiency analysis
    const avgMemoryPerObject = results.reduce((sum, r) => sum + (r.memory.creation.heapUsed / (r.objectCount * 3)), 0) / results.length;

    // Calculate average rel memory per relation (with safety check for zero rels)
    const validRelResults = results.filter(r => r.relStats.totalRels > 0 && r.memory.relSetup.heapUsed > 0);
    const avgRelMemoryPerRelation = validRelResults.length > 0
        ? validRelResults.reduce((sum, r) => sum + (r.memory.relSetup.heapUsed / r.relStats.totalRels), 0) / validRelResults.length
        : 0;

    const expectedMemoryPerObject = OBJECT_SIZE_BYTES;
    const memoryEfficiency = avgMemoryPerObject > 0 ? expectedMemoryPerObject / avgMemoryPerObject : 0;

    console.log("\nMemory Efficiency:");
    console.log(`Expected size per object: ${(expectedMemoryPerObject / 1024).toFixed(2)}KB`);
    console.log(`Actual memory per object: ${(avgMemoryPerObject / 1024).toFixed(2)}KB`);
    console.log(`Memory efficiency: ${(memoryEfficiency * 100).toFixed(1)}% (${memoryEfficiency < 0.5 ? "⚠️  Poor" : memoryEfficiency < 0.8 ? "📊 Fair" : "✅ Good"})`);

    if (avgRelMemoryPerRelation > 0) {
        console.log(`Rel memory per relation: ${(avgRelMemoryPerRelation / 1024).toFixed(2)}KB`);
    } else {
        console.log(`Rel memory per relation: N/A (no valid rel measurements)`);
    }

    // Rel memory scaling analysis
    if (results.length > 1) {
        const firstResult = results[0];
        const lastResult = results[results.length - 1];

        // Check if we have valid rel measurements for scaling analysis
        const firstRelMemoryPerRelation = firstResult.relStats.totalRels > 0 && firstResult.memory.relSetup.heapUsed > 0
            ? firstResult.memory.relSetup.heapUsed / firstResult.relStats.totalRels
            : 0;
        const lastRelMemoryPerRelation = lastResult.relStats.totalRels > 0 && lastResult.memory.relSetup.heapUsed > 0
            ? lastResult.memory.relSetup.heapUsed / lastResult.relStats.totalRels
            : 0;

        if (firstRelMemoryPerRelation > 0 && lastRelMemoryPerRelation > 0) {
            const relMemoryScaling = lastRelMemoryPerRelation / firstRelMemoryPerRelation;
            console.log(`Rel memory scaling: ${relMemoryScaling.toFixed(2)}x (${relMemoryScaling < 1.5 ? "✅ Good" : "⚠️  Concerning"})`);
        } else {
            console.log(`Rel memory scaling: N/A (insufficient rel memory data)`);
        }
    }

    console.log("\n Rels performance test completed successfully!");
}

// Run the performance test
try {
    await createRelsPerformanceTest();
    process.exit(0);
} catch (error) {
    console.error("❌ Rels performance test failed:", error);
    process.exit(1);
}