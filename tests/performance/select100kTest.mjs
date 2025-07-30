import { } from "../../clean.mjs";

await $$.clean();

import { initialisePersisto } from '../../index.cjs';

// Performance test configuration for large datasets
const TEST_SIZE = process.env.TEST_SIZE ? parseInt(process.env.TEST_SIZE) : 100000;
const BATCH_SIZE = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 1000;
const SELECT_TESTS = process.env.SELECT_TESTS ? parseInt(process.env.SELECT_TESTS) : 100;

async function create100kPerformanceTest() {
    console.log("Starting Persisto 100K+ Objects Performance Test");
    console.log("===================================================");
    console.log(`Target size: ${TEST_SIZE.toLocaleString()} objects`);
    console.log(`Batch size: ${BATCH_SIZE.toLocaleString()} objects per batch`);
    console.log(`Select tests: ${SELECT_TESTS} iterations per operation`);

    const persisto = await initialisePersisto();

    // Configure types
    await persisto.configureTypes({
        user: {},
        product: {},
        order: {}
    });

    // Create indexes for faster operations
    await persisto.createIndex("user", "email");
    await persisto.createIndex("product", "sku");
    await persisto.createIndex("order", "orderNumber");

    // Create groupings for efficient queries
    await persisto.createGrouping("usersByDept", "user", "department");
    await persisto.createGrouping("productsByCategory", "product", "category");
    await persisto.createGrouping("ordersByStatus", "order", "status");

    console.log("Configuration complete");

    // Memory usage tracking
    function getMemoryUsage() {
        const used = process.memoryUsage();
        return {
            rss: Math.round(used.rss / 1024 / 1024 * 100) / 100,
            heapTotal: Math.round(used.heapTotal / 1024 / 1024 * 100) / 100,
            heapUsed: Math.round(used.heapUsed / 1024 / 1024 * 100) / 100,
            external: Math.round(used.external / 1024 / 1024 * 100) / 100
        };
    }

    console.log(`Initial memory usage:`, getMemoryUsage());

    // Create test data in batches
    console.log(`\nCreating ${TEST_SIZE.toLocaleString()} objects in batches...`);
    const overallStartTime = Date.now();

    const userIds = [];
    const productIds = [];
    const orderIds = [];

    const departments = ["Engineering", "Marketing", "Sales", "HR", "Finance", "Operations", "Support", "Legal"];
    const categories = ["Electronics", "Clothing", "Books", "Home", "Sports", "Automotive", "Health", "Beauty"];
    const statuses = ["pending", "processing", "shipped", "delivered", "cancelled", "returned"];
    const cities = ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego"];

    // Create users in batches
    console.log("Creating users...");
    for (let batch = 0; batch < Math.ceil(TEST_SIZE / BATCH_SIZE); batch++) {
        const batchStart = Date.now();
        const startIdx = batch * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, TEST_SIZE);
        const batchSize = endIdx - startIdx;

        const promises = [];
        for (let i = startIdx; i < endIdx; i++) {
            const userData = {
                email: `user${i}@company.com`,
                name: `User ${i}`,
                age: 22 + (i % 43), // Age between 22-65
                department: departments[i % departments.length],
                salary: 40000 + (i % 150) * 1000, // Salary between 40k-190k
                city: cities[i % cities.length],
                joinDate: new Date(Date.now() - Math.random() * 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
                isActive: i % 20 !== 0, // 95% active
                skillLevel: (i % 10) + 1, // 1-10 skill level
                projectCount: i % 25, // 0-24 projects
                performance: {
                    rating: (i % 5) + 1, // 1-5 rating
                    lastReview: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString()
                }
            };

            promises.push(persisto.createUser(userData));
        }

        const batchUsers = await Promise.all(promises);
        userIds.push(...batchUsers.map(u => u.id));

        const batchTime = Date.now() - batchStart;
        const rate = (batchSize / batchTime * 1000).toFixed(1);
        const progress = ((endIdx / TEST_SIZE) * 100).toFixed(1);

        console.log(`  Batch ${batch + 1}: Created ${batchSize} users in ${batchTime}ms (${rate} users/sec) - ${progress}% complete`);

        // Memory check every 10 batches
        if ((batch + 1) % 10 === 0) {
            const memory = getMemoryUsage();
            console.log(`    Memory: RSS ${memory.rss}MB, Heap ${memory.heapUsed}/${memory.heapTotal}MB`);
        }
    }

    // Create products in batches
    console.log("Creating products...");
    for (let batch = 0; batch < Math.ceil(TEST_SIZE / BATCH_SIZE); batch++) {
        const batchStart = Date.now();
        const startIdx = batch * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, TEST_SIZE);
        const batchSize = endIdx - startIdx;

        const promises = [];
        for (let i = startIdx; i < endIdx; i++) {
            const productData = {
                sku: `SKU-${String(i).padStart(8, '0')}`,
                name: `Product ${i}`,
                category: categories[i % categories.length],
                price: (10 + (i % 990)) + ((i % 100) / 100), // Price between $10-$1000
                inStock: i % 10 !== 0, // 90% in stock
                stockQuantity: i % 1000, // 0-999 in stock
                weight: (i % 50) + 0.1, // Weight in kg
                dimensions: {
                    length: (i % 100) + 1,
                    width: (i % 80) + 1,
                    height: (i % 60) + 1
                },
                tags: categories.slice(0, (i % 3) + 1),
                createdAt: new Date(Date.now() - Math.random() * 2 * 365 * 24 * 60 * 60 * 1000).toISOString()
            };

            promises.push(persisto.createProduct(productData));
        }

        const batchProducts = await Promise.all(promises);
        productIds.push(...batchProducts.map(p => p.id));

        const batchTime = Date.now() - batchStart;
        const rate = (batchSize / batchTime * 1000).toFixed(1);
        const progress = ((endIdx / TEST_SIZE) * 100).toFixed(1);

        console.log(`  Batch ${batch + 1}: Created ${batchSize} products in ${batchTime}ms (${rate} products/sec) - ${progress}% complete`);
    }

    // Create orders in batches  
    console.log("Creating orders...");
    for (let batch = 0; batch < Math.ceil(TEST_SIZE / BATCH_SIZE); batch++) {
        const batchStart = Date.now();
        const startIdx = batch * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, TEST_SIZE);
        const batchSize = endIdx - startIdx;

        const promises = [];
        for (let i = startIdx; i < endIdx; i++) {
            const orderData = {
                orderNumber: `ORD-${String(i).padStart(8, '0')}`,
                customerId: userIds[i % userIds.length],
                status: statuses[i % statuses.length],
                totalAmount: (10 + (i % 2000)) + ((i % 100) / 100), // $10-$2010
                itemCount: (i % 10) + 1, // 1-10 items
                shippingCity: cities[i % cities.length],
                orderDate: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000).toISOString(),
                isPriority: i % 20 === 0, // 5% priority orders
                discountPercent: i % 20, // 0-19% discount
                metadata: {
                    source: ["web", "mobile", "phone", "store"][i % 4],
                    campaign: i % 5 === 0 ? `campaign-${i % 10}` : null
                }
            };

            promises.push(persisto.createOrder(orderData));
        }

        const batchOrders = await Promise.all(promises);
        orderIds.push(...batchOrders.map(o => o.id));

        const batchTime = Date.now() - batchStart;
        const rate = (batchSize / batchTime * 1000).toFixed(1);
        const progress = ((endIdx / TEST_SIZE) * 100).toFixed(1);

        console.log(`  Batch ${batch + 1}: Created ${batchSize} orders in ${batchTime}ms (${rate} orders/sec) - ${progress}% complete`);
    }

    const overallTime = Date.now() - overallStartTime;
    const totalObjects = userIds.length + productIds.length + orderIds.length;
    const overallRate = (totalObjects / overallTime * 1000).toFixed(1);

    console.log(`\nCreated ${totalObjects.toLocaleString()} total objects in ${(overallTime / 1000).toFixed(1)}s`);
    console.log(`Overall creation rate: ${overallRate} objects/second`);
    console.log(`Memory after creation:`, getMemoryUsage());

    // Force save to ensure all data is persisted
    console.log("\nForcing save to disk...");
    const saveStart = Date.now();
    await persisto.forceSave();
    const saveTime = Date.now() - saveStart;
    console.log(`Save completed in ${saveTime}ms`);

    // Test SELECT performance at scale
    console.log(`\nTesting SELECT performance with ${totalObjects.toLocaleString()} objects...`);
    console.log("Each test runs multiple iterations to get statistical averages.\n");

    const selectResults = {};

    // Test 1: SIMPLE FILTERS - Single field equality (baseline performance)
    console.log("Testing SIMPLE filters - Single field exact match...");
    console.log("   Query: persisto.select('user', { department: 'Engineering' })");
    console.log("   Complexity: LOWEST - Direct field comparison, most efficient");
    let times = [];
    for (let i = 0; i < SELECT_TESTS; i++) {
        const startTime = performance.now();
        await persisto.select("user", { department: departments[i % departments.length] });
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    selectResults.simpleFilter = calculateStats(times);

    // Test 2: MODERATE COMPLEXITY - Multiple field filters with range operators
    console.log("\nTesting MODERATE complexity - Multiple field range filters...");
    console.log("   Query: persisto.select('user', { age: { $gte: 30, $lte: 50 }, salary: { $gt: 60000 } })");
    console.log("   Complexity: MODERATE - Multiple field evaluations + range comparisons");
    times = [];
    for (let i = 0; i < SELECT_TESTS; i++) {
        const startTime = performance.now();
        await persisto.select("user", {
            age: { $gte: 30, $lte: 50 },
            salary: { $gt: 60000 }
        });
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    selectResults.rangeQuery = calculateStats(times);

    // Test 3: HIGH COMPLEXITY - Logical OR with nested conditions and mixed field types
    console.log("\nTesting HIGH complexity - Complex OR with nested conditions...");
    console.log("   Query: persisto.select('user', { $or: [");
    console.log("     { department: 'Engineering', 'performance.rating': { $gte: 4 } },");
    console.log("     { salary: { $gt: 100000 } },");
    console.log("     { city: 'New York', skillLevel: { $gte: 8 } }");
    console.log("   ] })");
    console.log("   Complexity: HIGH - Logical OR + nested fields + multiple range comparisons");
    times = [];
    for (let i = 0; i < Math.floor(SELECT_TESTS / 2); i++) {
        const startTime = performance.now();
        await persisto.select("user", {
            $or: [
                { department: "Engineering", "performance.rating": { $gte: 4 } },
                { salary: { $gt: 100000 } },
                { city: "New York", skillLevel: { $gte: 8 } }
            ]
        });
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    selectResults.complexOrQuery = calculateStats(times);

    // Test 4: MODERATE COMPLEXITY - Nested field access with existence checks
    console.log("\nTesting MODERATE complexity - Nested field queries...");
    console.log("   Query: { 'performance.rating': { $gte: 4 }, 'metadata.source': { $exists: true } }");
    console.log("   Complexity: MODERATE - Dot notation field access + existence operators");
    times = [];
    for (let i = 0; i < SELECT_TESTS; i++) {
        const startTime = performance.now();
        await persisto.select("user", {
            "performance.rating": { $gte: 4 },
            "metadata.source": { $exists: true }
        });
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    selectResults.nestedQuery = calculateStats(times);

    // Test 5: INTENSIVE OPERATION - Full dataset sorting (most resource intensive)
    console.log("\nTesting INTENSIVE operation - Full dataset sorting...");
    console.log("   Query: No filters, Options: { sortBy: 'salary', descending: true, start: 0, end: 100 }");
    console.log("   Complexity: HIGHEST - Sorts ALL objects then slices (most CPU intensive)");
    times = [];
    for (let i = 0; i < Math.floor(SELECT_TESTS / 4); i++) {
        const startTime = performance.now();
        await persisto.select("user", {}, {
            sortBy: "salary",
            descending: true,
            start: 0,
            end: 100
        });
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    selectResults.sorting = calculateStats(times);

    // Test 6: MODERATE COMPLEXITY - Pagination with sorting (common UI pattern)
    console.log("\nTesting MODERATE complexity - Pagination with sorting...");
    console.log("   Query: No filters, Options: { start: varying, pageSize: 50, sortBy: 'name' }");
    console.log("   Complexity: MODERATE - Sorts full dataset + slices to page (typical UI use case)");
    times = [];
    for (let i = 0; i < Math.floor(SELECT_TESTS / 2); i++) {
        const startOffset = i * 50;
        const startTime = performance.now();
        await persisto.select("user", {}, {
            start: startOffset,
            pageSize: 50,
            sortBy: "name"
        });
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    selectResults.pagination = calculateStats(times);

    // Test 7: COUNT SIMULATION - Using select and filteredCount
    console.log("\nTesting COUNT simulation - Using select and filteredCount...");
    console.log("   Query: persisto.select('user', { department: varying }).filteredCount");
    console.log("   Complexity: MODERATE - Uses select operation to get filtered count");
    times = [];
    for (let i = 0; i < SELECT_TESTS; i++) {
        const startTime = performance.now();
        const countResult = await persisto.select("user", { department: departments[i % departments.length] });
        countResult.filteredCount;
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    selectResults.counting = calculateStats(times);

    // Test 8: DISTINCT SIMULATION - Manual deduplication after select
    console.log("\nTesting DISTINCT simulation - Manual deduplication after select...");
    console.log("   Query: [...new Set(persisto.select('user', {}).objects.map(u => u.department))]");
    console.log("   Complexity: HIGH - Loads all objects + manual deduplication");
    times = [];
    for (let i = 0; i < Math.floor(SELECT_TESTS / 4); i++) {
        const startTime = performance.now();
        const distinctResult = await persisto.select("user", {});
        [...new Set(distinctResult.objects.map(u => u.department).filter(d => d != null))];
        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    selectResults.distinct = calculateStats(times);

    // Test 9: MULTI-OPERATION - Cross-type queries (real-world workflow)
    console.log("\nTesting MULTI-OPERATION - Cross-type queries...");
    console.log("   Operations (using general method for dynamic type selection): ");
    console.log("     1. persisto.select('order', { totalAmount: { $gt: 1000 }, status: { $in: ['processing', 'shipped'] } })");
    console.log("     2. persisto.select('product', { category: 'Electronics', inStock: true })");
    console.log("   Complexity: HIGH - Multiple table queries in sequence (real-world dashboard scenario)");
    times = [];
    for (let i = 0; i < Math.floor(SELECT_TESTS / 2); i++) {
        const startTime = performance.now();

        // Get high-value orders - using general method
        const highValueOrders = await persisto.select("order", {
            totalAmount: { $gt: 1000 },
            status: { $in: ["processing", "shipped"] }
        });

        // Get products in electronics category - using general method
        const electronics = await persisto.select("product", {
            category: "Electronics",
            inStock: true
        });

        const endTime = performance.now();
        times.push(endTime - startTime);
    }
    selectResults.crossType = calculateStats(times);

    // Display comprehensive results
    displayLargeScaleResults(selectResults, totalObjects);

    await persisto.shutDown();
    console.log(`\n100K+ performance test completed successfully!`);
    console.log(`Final memory usage:`, getMemoryUsage());

    return {
        totalObjects,
        creationTime: overallTime,
        creationRate: parseFloat(overallRate),
        selectResults
    };
}

function calculateStats(times) {
    if (times.length === 0) return { avg: 0, min: 0, max: 0, total: 0 };

    const sorted = times.slice().sort((a, b) => a - b);
    const total = times.reduce((sum, time) => sum + time, 0);
    const avg = total / times.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    return { avg, min, max, total, count: times.length };
}

function displayLargeScaleResults(results, totalObjects) {
    console.log("\nLARGE SCALE PERFORMANCE ANALYSIS");
    console.log("===================================");
    console.log(`Dataset size: ${totalObjects.toLocaleString()} objects`);

    console.log("\nSELECT Performance Summary by Complexity:");
    console.log("Operation (Complexity)\t\tAvg(ms)\tMin(ms)\tMax(ms)");
    console.log("---------------------\t\t------\t------\t------");

    // Define complexity levels for better analysis
    const complexityLevels = {
        'counting': 'MODERATE',
        'simpleFilter': 'SIMPLE',
        'rangeQuery': 'MODERATE',
        'nestedQuery': 'MODERATE',
        'pagination': 'MODERATE',
        'distinct': 'HIGH',
        'complexOrQuery': 'HIGH',
        'crossType': 'MULTI-OP',
        'sorting': 'INTENSIVE'
    };

    Object.entries(results).forEach(([operation, stats]) => {
        const complexity = complexityLevels[operation] || 'UNKNOWN';
        const name = `${operation} (${complexity})`.padEnd(24);
        console.log(`${name}\t${stats.avg.toFixed(1)}\t${stats.min.toFixed(1)}\t${stats.max.toFixed(1)}`);
    });

    // Performance analysis by complexity categories
    console.log("\nCOMPLEXITY ANALYSIS:");
    console.log("=======================");

    const avgSimple = results.simpleFilter.avg;
    const avgModerate = (results.rangeQuery.avg + results.nestedQuery.avg + results.pagination.avg + results.counting.avg) / 4;
    const avgHigh = (results.complexOrQuery.avg + results.distinct.avg) / 2;
    const avgIntensive = results.sorting.avg;

    console.log(`Performance by Complexity Level (lower is better):`);
    console.log(`   SIMPLE (single field):      ${avgSimple.toFixed(1)}ms   Baseline - direct filtering`);
    console.log(`   MODERATE (multi-field):     ${avgModerate.toFixed(1)}ms  ${(avgModerate / avgSimple).toFixed(1)}x slower - business logic`);
    console.log(`   HIGH (complex/distinct):    ${avgHigh.toFixed(1)}ms     ${(avgHigh / avgSimple).toFixed(1)}x slower - complex operations`);
    console.log(`   INTENSIVE (sorting):        ${avgIntensive.toFixed(1)}ms    ${(avgIntensive / avgSimple).toFixed(1)}x slower - CPU intensive`);
}

try {
    await create100kPerformanceTest();
    process.exit(0);
} catch (error) {
    console.error("❌ 100K performance test failed:", error);
    console.error(error.stack);
    process.exit(1);
}