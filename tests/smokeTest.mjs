
import {} from "./testInit/clean.mjs";

await $$.clean();

import {initialisePersisto} from '../index.js';

let persistoInstance = await initialisePersisto();

persistoInstance.configureTypes({
        type1:{
        email: "string",
        info: "object",
        },
        type2:{
            name: "string",
            info: "object",
        }
    }
);

persistoInstance.configureAssets( {
    "user": ["email","name", "loginEvent", "invitingUserID", "level", "lockedAmountForInvitingUser", "lockedAmountUntilValidation"],
    "agent": ["name" ,  "description",  "ownerName", "ownerURL", "ownerDescription"],
    "NFT": ["name", "description", "ownerName", "ownerURL", "ownerDescription"]
});

await persistoInstance.createIndex("type1", "email");

await persistoInstance.createGrouping("user", "user", "email");

persistoInstance.shutDown();
