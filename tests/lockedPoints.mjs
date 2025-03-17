import {} from "../clean.mjs";
await $$.clean();
import {initialisePersisto} from '../index.js';

let failedChecks = [];
async function lockedPoints(){
    let persistoInstance = await initialisePersisto();

    await persistoInstance.configureAssets( {
        "user": ["email", "name", "loginEvent", "invitingUserID", "level", "lockedAmountForInvitingUser", "lockedAmountUntilValidation"],
        "NFT": ["name", "description", "ownerName", "ownerId", "points"]
    });
    let one_million = 1000000;
    await persistoInstance.mintPoints(one_million);
    let systemBalance = await persistoInstance.getBalance("system");
    if(systemBalance !== one_million) {
        throw new Error("System balance mismatch");
    }
    let founderConfig = {
        email: "founder@example.com",
        name: "founder",
    }
    const rewardPoints = 100000;
    let founder = await persistoInstance.createUser(founderConfig);
    await persistoInstance.rewardFounder(founder.id, rewardPoints);

    let userConfig = {
        email: "user@example.com",
        name: "user1",
    }
    let user = await persistoInstance.createUser(userConfig);
    await persistoInstance.rewardUser(user.id, rewardPoints);

    await persistoInstance.lockPoints(user.id, rewardPoints - 10, "Locking points for user " + user.id);
    let userBalance = await persistoInstance.getBalance(user.id);
    if(userBalance !== 10){
        throw new Error("User balance mismatch expected 10 got " + userBalance);
    }

    await persistoInstance.transferLockedPoints(rewardPoints - 20, user.id, founder.id, "Transfering locked points from user " + user.id + " to founder ");
    let lockedPoints = await persistoInstance.getLockedBalance(user.id);
    if(lockedPoints !== 10){
        throw new Error("User balance mismatch expected 0 got " + userBalance);
    }

    await persistoInstance.unlockPoints(user.id, 10, "Unlocking points for user " + user.id);
    userBalance = await persistoInstance.getBalance(user.id);
    if(userBalance !== 20){
        throw new Error("User balance mismatch expected " + 10 + " got " + userBalance);
    }

    await persistoInstance.rewardUser(user.id, rewardPoints);
    await persistoInstance.lockPoints(user.id, rewardPoints - 10, "Locking points for user " + user.id);
    await persistoInstance.confiscateLockedPoints(user.id, rewardPoints - 20, "Confiscating locked points for user " + user.id);
    lockedPoints = await persistoInstance.getLockedBalance(user.id);
    if(lockedPoints !== 10){
        throw new Error("User balance mismatch expected 0 got " + userBalance);
    }
}

try{
    await lockedPoints();
    if(failedChecks.length > 0){
        console.log("Test failed", failedChecks);
        process.exit(1);
    }
    process.exit(0);
} catch (e) {
    console.error(e);
    process.exit(1);
}

