import { } from "../clean.mjs";

await $$.clean();
import { initialisePersisto } from '../index.cjs';

try {
    let persistoInstance = await initialisePersisto();
    const config = {
        user: {
            name: "string",
        }
    };

    await persistoInstance.configureTypes(config);
    await persistoInstance.createGrouping("sameName", "user", "name");

    await persistoInstance.createUser({ name: "John" });

    let obj = await persistoInstance.createUser({ name: "John" });
    obj.name = "Michael";
    await persistoInstance.updateUser(obj.id, obj);

    let johns = await persistoInstance.getSameNameObjectsByName("John");
    let michaels = await persistoInstance.getSameNameObjectsByName("Michael");

    if (johns.length !== 1) {
        console.error("Expected 1 John objects, got: ", johns);
        process.exit(1);
    }
    if (michaels.length !== 1) {
        console.error("Expected 1 Michael objects, got: ", michaels);
        process.exit(1);
    }
} catch (e) {
    console.error(e);
    process.exit(1);
}

process.exit(0);
