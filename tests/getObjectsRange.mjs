import { } from "../clean.mjs";

await $$.clean();

import { initialisePersisto } from '../index.cjs';

let persistoInstance = await initialisePersisto();

await persistoInstance.configureTypes({
    userStatus: {
        email: "string",
        info: "object",
        name: "string"
    }
}
);


await persistoInstance.createIndex("userStatus", "email");

await persistoInstance.createGrouping("users", "userStatus", "email");

for (let i = 1; i < 27; i++) {
    const letter = String.fromCharCode(122 - i).toUpperCase();
    await persistoInstance.createUserStatus({
        email: `email${i}`,
        info: { spaces: [`space${i}`, `space${i + 1}`] },
        name: `${letter}`
    });
}
let users = await persistoInstance.getEveryUserStatusObject();

if (users.length !== 26) {
    throw new Error("expected 26 users, got " + users.length);
}

let intervalUsers = await persistoInstance.getEveryUserStatusObject("name", 10, 20);
if (intervalUsers.length !== 10) {
    throw new Error("expected 10 users, got " + intervalUsers.length);
}
let name = intervalUsers[0].name;
let name2 = intervalUsers[1].name;
if (name !== "J" && name2 !== "K") {
    throw new Error("users array sorted incorrectly, expected J and K, got " + name + " and " + name2);
}

let invalidSortUsers = await persistoInstance.getEveryUserStatusObject("userInfo", 10, 20);
if (invalidSortUsers.length !== 10) {
    throw new Error("expected 10 users, got " + users.length);
}

let descendingUsers = await persistoInstance.getEveryUserStatusObject("name", 10, 20, true);
if (descendingUsers[0].name !== "O") {
    throw new Error("descending list failed");
}
await persistoInstance.shutDown();


