import {} from "../clean.mjs";

await $$.clean();
import {initialisePersisto} from '../index.cjs';

try {
    let persistoInstance = await initialisePersisto();
    const config = {
        user: {
            name: "string",
        }
    };

    await persistoInstance.configureTypes(config);

    await persistoInstance.createUser({name: "Michael"});
    await persistoInstance.createUser({name: "John"});
    await persistoInstance.createUser({name: "John"});
    await persistoInstance.createUser({name: "John"});

    await persistoInstance.createGrouping("sameName", "user", "name");
    let johns = await persistoInstance.getSameNameObjectsByName("John");
    if(johns.length !== 3) {
        console.error("Expected 3 John objects, got: ", johns.length);
        process.exit(1);
    }

} catch (e) {
    console.error(e);
    process.exit(1);
}

process.exit(0);
