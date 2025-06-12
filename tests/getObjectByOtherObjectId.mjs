import {} from "../clean.mjs";

await $$.clean();
import {initialisePersisto} from '../index.cjs';

try {
    let persistoInstance = await initialisePersisto();
    const config = {
        userInfo: {
            name: "string",
        },
        userLog: {
            log: "string"
        }
    };

    await persistoInstance.configureTypes(config);

    let object = await persistoInstance.createUserInfo({name: "John"});
    let userLog = await persistoInstance.createUserLog({log: "User_created"});

    try {
        let userObj = await persistoInstance.getUserInfo(userLog.id);
        if (userObj.log) {
            console.error("Expected error, got userLog object instead");
            process.exit(1);
        }
        await persistoInstance.shutDown();
    }
    catch(e) {
        if (!e.message.includes("does not start with expected prefix")) {
            console.error("Unexpected error message: ", e.message);
            process.exit(1);
        }
    }
} catch (e) {
    console.error(e);
    process.exit(1);
}

process.exit(0);
