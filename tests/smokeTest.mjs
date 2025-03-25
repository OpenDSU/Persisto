
import {} from "../clean.mjs";

await $$.clean();

import {initialisePersisto} from '../index.js';

let persistoInstance = await initialisePersisto();

await persistoInstance.configureTypes({
        userStatus:{
            email: "string",
            info: "object",
        },
        space:{
            name: "string",
            info: "object",
        }
    }
);

await persistoInstance.configureAssets( {
    "user": ["email","name", "loginEvent", "invitingUserID", "level", "lockedAmountForInvitingUser", "lockedAmountUntilValidation"],
    "agent": ["name" ,  "description",  "ownerName", "ownerURL", "ownerDescription"],
    "NFT": ["name", "description", "ownerName", "ownerURL", "ownerDescription"]
});

await persistoInstance.createIndex("userStatus", "email");

await persistoInstance.createGrouping("users", "userStatus", "email");

let user = await persistoInstance.createUserStatus({
    email: "email1",
    info: {spaces: ["space1", "space2"]}
});
let sameUser = await persistoInstance.getUserStatus("email1");
let userIds = await persistoInstance.getEveryUserStatus();
await persistoInstance.deleteUserStatus(user.email);

let failedChecks = [];
userIds = await persistoInstance.getEveryUserStatus();
if(userIds.length > 0){
    failedChecks.push(`user deletion failed, still in collection ${userIds}`);
}

try {
    sameUser = await persistoInstance.getUserStatus("email1");
    sameUser = await persistoInstance.getUserStatus(user.id);
    failedChecks.push("user deletion failed");
} catch (e) {
    //ok
}
await persistoInstance.shutDown();
if(failedChecks.length > 0){
    throw new Error(failedChecks.join(", "));
}

