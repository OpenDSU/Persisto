import { } from "../clean.mjs";

await $$.clean();

import { getAutoSaverPersistence } from "../src/persistence/ObjectsAutoSaver.cjs";
import { initialisePersisto } from "../src/persistence/Persisto.cjs";

async function runSelectTest() {
    console.log("Starting Persisto Select Test...");

    try {
        // Initialize storage and persisto
        let storageStrategy = await getAutoSaverPersistence();
        let persisto = await initialisePersisto(storageStrategy, {
            smartLog: async () => { } // Mock logger
        });

        // Configure a test type
        persisto.configureTypes({ user: {} });
        await persisto.createIndex("user", "email");

        // Create test data
        console.log("Creating test users...");
        let users = [
            { name: "Alice Johnson", email: "alice@example.com", age: 25, department: "Engineering", salary: 75000, active: true },
            { name: "Bob Smith", email: "bob@example.com", age: 30, department: "Engineering", salary: 85000, active: true },
            { name: "Carol Williams", email: "carol@example.com", age: 35, department: "Marketing", salary: 65000, active: false },
            { name: "David Brown", email: "david@example.com", age: 28, department: "Sales", salary: 70000, active: true },
            { name: "Eve Davis", email: "eve@example.com", age: 32, department: "Engineering", salary: 90000, active: true },
            { name: "Frank Miller", email: "frank@example.com", age: 45, department: "Marketing", salary: 80000, active: false }
        ];

        for (let userData of users) {
            await persisto.createUser(userData);
        }

        console.log("Test users created successfully!");

        // Test 1: Basic filtering
        console.log("\n=== Test 1: Basic Filtering ===");
        let engineeringUsers = await persisto.select("user",
            { department: "Engineering" }
        );
        console.log(`Engineering users: ${engineeringUsers.objects.length}/${engineeringUsers.totalCount}`);
        console.log("Names:", engineeringUsers.objects.map(u => u.name));

        // Test 2: Range filtering
        console.log("\n=== Test 2: Range Filtering ===");
        let youngUsers = await persisto.select("user",
            { age: { $lt: 30 } }
        );
        console.log(`Users under 30: ${youngUsers.objects.length}/${youngUsers.totalCount}`);
        console.log("Names and ages:", youngUsers.objects.map(u => `${u.name} (${u.age})`));

        // Test 3: Multiple filters with AND
        console.log("\n=== Test 3: Multiple Filters (AND) ===");
        let activeEngineers = await persisto.select("user",
            {
                department: "Engineering",
                active: true,
                salary: { $gte: 80000 }
            }
        );
        console.log(`Active engineers with salary >= 80k: ${activeEngineers.objects.length}/${activeEngineers.totalCount}`);
        console.log("Details:", activeEngineers.objects.map(u => `${u.name} - $${u.salary}`));

        // Test 4: OR conditions
        console.log("\n=== Test 4: OR Conditions ===");
        let marketingOrSales = await persisto.select("user",
            {
                $or: [
                    { department: "Marketing" },
                    { department: "Sales" }
                ]
            }
        );
        console.log(`Marketing or Sales users: ${marketingOrSales.objects.length}/${marketingOrSales.totalCount}`);
        console.log("Departments:", marketingOrSales.objects.map(u => `${u.name} - ${u.department}`));

        // Test 5: Complex filtering with IN operator
        console.log("\n=== Test 5: IN Operator ===");
        let specificAges = await persisto.select("user",
            { age: { $in: [25, 30, 35] } }
        );
        console.log(`Users aged 25, 30, or 35: ${specificAges.objects.length}/${specificAges.totalCount}`);
        console.log("Ages:", specificAges.objects.map(u => `${u.name} (${u.age})`));

        // Test 6: String operations
        console.log("\n=== Test 6: String Operations ===");
        let smithUsers = await persisto.select("user",
            { name: { $contains: "Smith" } }
        );
        console.log(`Users with "Smith" in name: ${smithUsers.objects.length}/${smithUsers.totalCount}`);
        console.log("Names:", smithUsers.objects.map(u => u.name));

        // Test 7: Sorting
        console.log("\n=== Test 7: Sorting ===");
        let sortedByAge = await persisto.select("user",
            {},
            { sortBy: "age", descending: true }
        );
        console.log("Users sorted by age (descending):");
        console.log("Ages:", sortedByAge.objects.map(u => `${u.name} (${u.age})`));

        // Test 8: Multiple field sorting
        console.log("\n=== Test 8: Multiple Field Sorting ===");
        let multiSort = await persisto.select("user",
            {},
            {
                sortBy: [
                    { field: "department", descending: false },
                    { field: "salary", descending: true }
                ]
            }
        );
        console.log("Users sorted by department (asc), then salary (desc):");
        console.log("Details:", multiSort.objects.map(u => `${u.department} - ${u.name} ($${u.salary})`));

        // Test 9: Pagination
        console.log("\n=== Test 9: Pagination ===");
        let page1 = await persisto.select("user",
            {},
            { sortBy: "name", pageSize: 3, start: 0 }
        );
        console.log(`Page 1 (3 per page): ${page1.objects.length} users`);
        console.log("Names:", page1.objects.map(u => u.name));
        console.log("Pagination info:", page1.pagination);

        let page2 = await persisto.select("user",
            {},
            { sortBy: "name", pageSize: 3, start: 3 }
        );
        console.log(`Page 2 (3 per page): ${page2.objects.length} users`);
        console.log("Names:", page2.objects.map(u => u.name));

        // Test 10: Manual operations using only select
        console.log("\n=== Test 10: Manual Operations Using Select ===");

        // Count using select and filteredCount
        let engineerResult = await persisto.select("user", { department: "Engineering" });
        let engineerCount = engineerResult.filteredCount;
        console.log(`Total Engineering users: ${engineerCount}`);

        // Existence check using select with end: 1
        let highEarnersResult = await persisto.select("user", { salary: { $gt: 85000 } }, { end: 1 });
        let hasHighEarners = highEarnersResult.objects.length > 0;
        console.log(`Has users earning > $85k: ${hasHighEarners}`);

        // Distinct values using select and manual deduplication
        let allUsersResult = await persisto.select("user", {});
        let departments = [...new Set(allUsersResult.objects.map(u => u.department).filter(d => d != null))];
        console.log("Distinct departments:", departments);

        // Manual aggregation using select
        let allUsers = allUsersResult.objects;
        let salaries = allUsers.map(u => u.salary).filter(s => typeof s === 'number');
        let salaryStats = {
            avgSalary: salaries.length > 0 ? salaries.reduce((sum, s) => sum + s, 0) / salaries.length : 0,
            maxSalary: salaries.length > 0 ? Math.max(...salaries) : null,
            minSalary: salaries.length > 0 ? Math.min(...salaries) : null,
            totalSalary: salaries.reduce((sum, s) => sum + s, 0),
            userCount: salaries.length
        };
        console.log("Salary statistics:", salaryStats);

        console.log("\n=== All Tests Completed Successfully! ===");
        process.exit(0);
    } catch (error) {
        console.error("Test failed:", error);
        process.exit(1);
    }
}

// Run the test
runSelectTest().catch(console.error); 