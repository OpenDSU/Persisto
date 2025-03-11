import {} from "./testInit/clean.mjs";
await $$.clean();
import {initialisePersisto} from '../index.js';

let persistoInstance = await initialisePersisto();

persistoInstance.configureAssets( {
    "user": ["email", "name", "loginEvent", "invitingUserID", "level", "lockedAmountForInvitingUser", "lockedAmountUntilValidation"],
    "NFT": ["name", "description", "ownerName", "ownerURL", "ownerDescription"]
});

persistoInstance.mintPoints(1000000000);

const users = [];
const nfts = [];

const prefix = "user";
const count = 10;
for(let i = 0; i < count; i++) {
    let userConfig = {
        email: "user" + i + "@example.com",
        name: prefix + i,
        invitingUserID: i >0 ? users[i-1] : undefined
    }
    let user = await persistoInstance.createUser(userConfig);
    users.push(user.id);
    let nftConfig = {
        name: "NFT of " + user.id,
        description: "NFT of " + user.id,
        ownerName: userConfig.name,
        ownerURL: "http://example.com/" + userConfig.name,
        ownerDescription: "Owner of " + userConfig.name
    };
    let nft = await persistoInstance.createNFT(nftConfig);
    nfts.push(nft.id);
}

//await persistoInstance.claimFounder(users[0], 100000000);

//console.log("Founder status: ", await persistoInstance.accountStatus(users[0]));


console.log("Start testing...", nfts[0], nfts[1], nfts[2], nfts[3], nfts[4], nfts[5], nfts[6], nfts[7], nfts[8], nfts[9]);


//persistoInstance.boostNFT(users[1], nfts[1], 2);
//persistoInstance.boostNFT(users[2], nfts[2], 3);


//await persistoInstance.shutDown();

console.log( ">>>>>>> Checking logs...");
console.log("Founder logs: ", await persistoInstance.getUserLogs(users[0]));
console.log( "<<<<<<< End Checking logs...");


let arrValues = [ 100010100, 10098, 10097, 10100, 10100, 10100, 10100, 10100 , 10100 , 10000 ];
let currentBalance = 0;
for(let i = 0; i < arrValues.length; i++) {
    if(users[i] == undefined) {
        continue;
    }
    currentBalance = await persistoInstance.getBalance(users[i]);
    currentBalance = Math.floor(currentBalance * 1000 / 1000);
    if(currentBalance !== arrValues[i]) {
        console.error("Balance mismatch for user ", i, " expected ", arrValues[i], " got ", currentBalance);
    }
}

console.log("Available system balance: ", await persistoInstance.getSystemAvailablePoints());
console.log("Test done");

