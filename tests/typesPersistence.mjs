
import {} from "../clean.mjs";

await $$.clean();

import {initialisePersisto} from '../index.cjs';
let checksFailed = [];
async function typesPersistence(){
    let persistoInstance = await initialisePersisto();

   await persistoInstance.configureTypes({
            userStatus:{
                email: "string",
                info: "object",
            },
            space:{
                name: "string",
                status: "object",
            }
        }
    );

    await persistoInstance.createIndex("userStatus", "email");

    //create object
    let object1 = await persistoInstance.createUserStatus({email: "email1", info: {name: "name1"}});
    let sameObject = await persistoInstance.getUserStatus(object1.id);

    if (object1 !== sameObject) {
        throw new Error("Object creation assertion failed");
    }

    let sameObjectByIndex = await persistoInstance.getUserStatus("email1");

    if(object1 !== sameObjectByIndex){
        throw new Error("Same object by index assertion failed");
    }

    sameObject.info.name = "Adam";
    await persistoInstance.updateUserStatus(object1.id, sameObject);
    let updatedObject = await persistoInstance.getUserStatus(object1.id);
    if(updatedObject.info.name !== "Adam"){
        throw new Error("Update object assertion failed")
    }

    //wrong object config creation
    let wrongObjectConfig = {
        email: "email1",
        wrongField: "wrong"
    }
    try {
        await persistoInstance.createUserStatus(wrongObjectConfig);
        checksFailed.push(new Error("Wrong object creation should have failed"));
    } catch (e) {

    }

    await persistoInstance.shutDown();
}

try{
    await typesPersistence();
    if(checksFailed.length > 0){
        console.log("Persistence test failed", checksFailed);
    }
} catch (e) {
    console.error(e);
}


