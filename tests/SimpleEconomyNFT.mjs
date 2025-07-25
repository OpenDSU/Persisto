import { } from "../clean.mjs";
await $$.clean();
import { initialisePersisto } from '../index.cjs';

let failedChecks = [];
let persistoInstance = await initialisePersisto();
const users = [];

async function SimpleEconomyNFT() {
    await persistoInstance.configureAssets({
        "user": ["email", "name", "loginEvent", "invitingUserID", "level", "lockedAmountForInvitingUser", "lockedAmountUntilValidation"],
        "NFT": ["name", "description", "ownerName", "ownerId", "points"]
    });
    let one_million = 1000000;
    await persistoInstance.mintPoints(one_million);
    let systemBalance = await persistoInstance.getBalance("system");
    if (systemBalance !== one_million) {
        throw new Error("System balance mismatch");
    }
    let founderConfig = {
        email: "founder@example.com",
        name: "founder",
    }
    const rewardPoints = 100000;
    let founder = await persistoInstance.createUser(founderConfig);
    await persistoInstance.rewardFounder(founder.id, rewardPoints);

    const nfts = [];

    const prefix = "user";
    const count = 9;
    for (let i = 0; i < count; i++) {
        let userConfig = {
            email: "user" + i + "@example.com",
            name: prefix + i,
            invitingUserID: i > 0 ? users[i - 1] : undefined
        }
        let user = await persistoInstance.createUser(userConfig);
        users.push(user.id);
        let nftConfig = {
            name: "NFT of " + user.id,
            description: "NFT of " + user.id,
            ownerName: userConfig.name,
            ownerId: user.id
        };
        let nft = await persistoInstance.createNFT(nftConfig);
        nfts.push(nft.id);
        await persistoInstance.rewardUser(users[i], rewardPoints);
    }

    let updatedSystemBalance = await persistoInstance.getBalance("system");
    if (updatedSystemBalance !== 0) {
        throw new Error("System balance mismatch expected 0 got " + updatedSystemBalance);
    }

    console.log("Start testing...", nfts[0], nfts[1], nfts[2], nfts[3], nfts[4], nfts[5], nfts[6], nfts[7], nfts[8], nfts[9]);

    let boostAmount = 1000;
    await persistoInstance.transferPoints(boostAmount, users[0], nfts[0], "Boosting NFT " + nfts[0]);
    await persistoInstance.transferPoints(boostAmount, users[1], nfts[1], "Boosting NFT " + nfts[1]);


    await persistoInstance.transferPoints(boostAmount, users[0], users[1], "Gift points for " + users[1]);

    await persistoInstance.shutDown();

    let expectedBalance = [98000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000];
    let currentBalance = 0;
    for (let i = 0; i < users.length; i++) {
        currentBalance = await persistoInstance.getBalance(users[i]);
        currentBalance = Math.floor(currentBalance * 1000 / 1000);
        if (currentBalance !== expectedBalance[i]) {
            failedChecks.push("User balance mismatch for user " + i + " expected " + expectedBalance[i] + " got " + currentBalance);
        }
    }
}

await SimpleEconomyNFT();

console.log(">>>>>>> Checking logs...");
console.log("Founder logs: ", await persistoInstance.getUserLogs(users[0]));
console.log("<<<<<<< End Checking logs...");

console.assert(failedChecks.length === 0, "Test failed", failedChecks);
console.log("Test ended successfully");
process.exit(0);