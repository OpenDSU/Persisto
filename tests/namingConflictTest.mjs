import {} from "./testInit/clean.mjs";

await $$.clean();

import {initialisePersisto} from '../index.js';

let persistoInstance = await initialisePersisto();
const sameConfig = {
    type1:{
        email: "string",
        info: "object",
    },
    type2:{
        name: "string",
        info: "object",
    }
};
const sameAssets = {
    "user": ["email","name", "loginEvent", "invitingUserID", "level", "lockedAmountForInvitingUser", "lockedAmountUntilValidation"],
    "agent": ["name" ,  "description",  "ownerName", "ownerURL", "ownerDescription"]
};
let failedChecks = [];
persistoInstance.configureTypes(sameConfig);
try {
    persistoInstance.configureTypes(sameConfig);
    failedChecks.push("configureTypes conflict untreated");
} catch (e) {}

await persistoInstance.configureAssets(sameAssets);
try {
    await persistoInstance.configureAssets(sameAssets);
    failedChecks.push("configureAssets conflict untreated");
} catch (e) {
    //console.debug("Expected error", e);
}

await persistoInstance.createIndex("type1", "email");
try {
    await persistoInstance.createIndex("type1", "email");
    failedChecks.push("createIndex conflict untreated");
} catch (e) {}

await persistoInstance.createGrouping("user", "user", "email");
try {
    await persistoInstance.createGrouping("user", "user", "email");
    failedChecks.push("createGrouping conflict untreated");
} catch (e) {}

let object = await persistoInstance.createType1({email: "email1", info: {name: "name1"}});

try{
    await persistoInstance.configureAssets({"type1": ["info"]});
    failedChecks.push("configureAssets conflict untreated");
} catch(e){
  //ok
}


let sameObject = await persistoInstance.getType1("email1");
if(object !== sameObject){
    failedChecks.push("configureAssets conflict method overwritten");
}
persistoInstance.shutDown();
if(failedChecks.length === 0){
    console.log("Naming conflict test passed");
} else {
    console.log("Naming conflict test failed", failedChecks);
}
