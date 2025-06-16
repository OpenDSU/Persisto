import {} from "../clean.mjs";

await $$.clean();
import {initialisePersisto} from '../index.cjs';

try {
    let persistoInstance = await initialisePersisto();
    const config = {
        userInfo: {
            name: "string",
        }
    };

    await persistoInstance.configureTypes(config);
    await persistoInstance.createIndex("userInfo", "name");
    await persistoInstance.createUserInfo({name: "John"});
    await persistoInstance.createUserInfo({name: "Mary"});
    await persistoInstance.createUserInfo({name: "Michael"});
    await persistoInstance.createUserInfo({name: "Alice"});
    await persistoInstance.createUserInfo({name: "Bob"});

    let names = await persistoInstance.getEveryUserInfoName();
    if (names.length !== 5) {
        console.error("Expected 5 names, got: ", names);
        process.exit(1);
    }
    if(names[0] !== "John" || names[1] !== "Mary") {
        console.error("Expected first name John, got: ", names[0]);
        process.exit(1);
    }

} catch (e) {
    console.error(e);
    process.exit(1);
}

process.exit(0);
