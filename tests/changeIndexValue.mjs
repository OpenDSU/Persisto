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
    await persistoInstance.createIndex("user", "name");

    let obj = await persistoInstance.createUser({name: "John"});
    await persistoInstance.setNameForUser(obj.id, "Michael");

    let michael = await persistoInstance.getUser("Michael");
    if(michael.name !== "Michael"){
        console.error("Expected name to be 'Michael', got: ", michael.name);
        process.exit(1);
    }
    let objectIds = await persistoInstance.getEveryUser();
    if(objectIds.length !== 1) {
        console.error("Expected 1 object searched by index, got: ", objectIds.length);
        process.exit(1);
    }
    let objects = await persistoInstance.getEveryUserObject();
    if(objects.length !== 1) {
        console.error("Expected 1 object searched by index, got: ", objects.length);
        process.exit(1);
    }
    if(objects[0].name !== "Michael") {
        console.error("Expected object name to be 'Michael', got: ", objects[0].name);
        process.exit(1);
    }
} catch (e) {
    console.error(e);
    process.exit(1);
}

process.exit(0);
