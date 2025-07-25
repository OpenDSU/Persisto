import { } from "../clean.mjs";

await $$.clean();
import { initialisePersisto } from '../index.cjs';

try {
    let persistoInstance = await initialisePersisto();
    const config = {
        user: {
            name: "string",
            email: "string",
        }
    };

    await persistoInstance.configureTypes(config);

    // Create users BEFORE creating the index
    await persistoInstance.createUser({ name: "Michael", email: "michael@example.com" });
    await persistoInstance.createUser({ name: "John", email: "john@example.com" });
    await persistoInstance.createUser({ name: "Jane", email: "jane@example.com" });
    await persistoInstance.createUser({ name: "Bob", email: "bob@example.com" });

    // Now create an index on email field - this should retroactively index existing users
    await persistoInstance.createIndex("user", "email");

    // Test that we can find pre-existing users by their email
    let michael = await persistoInstance.getUserByEmail("michael@example.com");
    if (!michael || michael.name !== "Michael") {
        console.error("Expected to find Michael by email, got: ", michael);
        process.exit(1);
    }

    let john = await persistoInstance.getUserByEmail("john@example.com");
    if (!john || john.name !== "John") {
        console.error("Expected to find John by email, got: ", john);
        process.exit(1);
    }

    let jane = await persistoInstance.getUserByEmail("jane@example.com");
    if (!jane || jane.name !== "Jane") {
        console.error("Expected to find Jane by email, got: ", jane);
        process.exit(1);
    }

    let bob = await persistoInstance.getUserByEmail("bob@example.com");
    if (!bob || bob.name !== "Bob") {
        console.error("Expected to find Bob by email, got: ", bob);
        process.exit(1);
    }

    // Test that non-existent email returns undefined
    let nonExistent = await persistoInstance.getUserByEmail("nonexistent@example.com");
    if (nonExistent !== undefined) {
        console.error("Expected undefined for non-existent email, got: ", nonExistent);
        process.exit(1);
    }

    console.log("✓ All indexing after object creation tests passed!");

} catch (e) {
    console.error(e);
    process.exit(1);
}

process.exit(0); 