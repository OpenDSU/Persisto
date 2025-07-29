import { } from "../clean.mjs";

await $$.clean();

import { getAutoSaverPersistence } from "../src/persistence/ObjectsAutoSaver.cjs";
import { initialisePersisto } from "../src/persistence/Persisto.cjs";

const DEFAULT_AUDIT = {
    smartLog: async function (event, data) {
        console.log(`AUDIT: ${event}`, data);
    }
};

async function runSimplifiedSyncTest() {
    console.log("=== Ultra-Simplified Sync Test ===");
    console.log("Field names exactly match type names - no pluralization!");

    let storage;
    let persisto;

    try {
        storage = await getAutoSaverPersistence();
        persisto = await initialisePersisto(storage, DEFAULT_AUDIT);

        persisto.configureTypes({
            "user": {},
            "chatroom": {},
            "project": {},
            "tag": {}
        });

        await persisto.createIndex("user", "username");
        await persisto.createIndex("chatroom", "name");
        await persisto.createIndex("project", "name");
        await persisto.createIndex("tag", "name");

        const timestamp = Date.now();

        console.log("\n1. Creating joins with ultra-simple field names...");

        // Field names match type names exactly!
        await persisto.createJoin("userChatrooms", "user", "chatroom");
        // Creates: user.chatroom and chatroom.user

        await persisto.createJoin("userProjects", "user", "project");
        // Creates: user.project and project.user

        await persisto.createJoin("projectTags", "project", "tag");
        // Creates: project.tag and tag.project

        console.log("\n2. Creating objects with simple field names...");

        let alice = await persisto.createUser({
            username: `alice_${timestamp}`,
            displayName: "Alice",
            chatroom: [],  // Simple field name
            project: []    // Simple field name
        });

        let general = await persisto.createChatroom({
            name: `general_${timestamp}`,
            topic: "General discussion",
            user: []  // Simple field name
        });

        let website = await persisto.createProject({
            name: `website_${timestamp}`,
            description: "Company website",
            user: [],  // Simple field name
            tag: []    // Simple field name
        });

        let javascript = await persisto.createTag({
            name: `javascript_${timestamp}`,
            project: []  // Simple field name
        });

        console.log("Created objects with simple field names");

        console.log("\n3. Testing user ↔ chatroom sync...");

        // Add chatroom to user.chatroom array
        await persisto.updateUser(alice.id, {
            chatroom: [general.id]  // Single field name
        });

        let aliceChats = await persisto.getChatroomsFromJoinForUser(alice.id);
        let generalUsers = await persisto.getUsersFromJoinForChatroom(general.id);

        console.log(`Alice's chatrooms: ${aliceChats.map(c => c.name)}`);
        console.log(`General's users: ${generalUsers.map(u => u.displayName)}`);

        console.log("\n4. Testing user ↔ project sync...");

        // Add project to user.project array  
        await persisto.updateUser(alice.id, {
            project: [website.id]  // Single field name
        });

        let aliceProjects = await persisto.getProjectsFromJoinForUser(alice.id);
        let websiteUsers = await persisto.getUsersFromJoinForProject(website.id);

        console.log(`Alice's projects: ${aliceProjects.map(p => p.name)}`);
        console.log(`Website's users: ${websiteUsers.map(u => u.displayName)}`);

        console.log("\n5. Testing project ↔ tag sync...");

        // Add tag to project.tag array
        await persisto.updateProject(website.id, {
            tag: [javascript.id]  // Single field name
        });

        let websiteTags = await persisto.getTagsFromJoinForProject(website.id);
        let javascriptProjects = await persisto.getProjectsFromJoinForTag(javascript.id);

        console.log(`Website's tags: ${websiteTags.map(t => t.name)}`);
        console.log(`JavaScript tag's projects: ${javascriptProjects.map(p => p.name)}`);

        console.log("\n6. Testing bidirectional sync...");

        await persisto.updateChatroom(general.id, {
            user: [alice.id]
        });

        let aliceChats2 = await persisto.getChatroomsFromJoinForUser(alice.id);
        let generalUsers2 = await persisto.getUsersFromJoinForChatroom(general.id);

        console.log(`Alice's chatrooms (after chatroom update): ${aliceChats2.map(c => c.name)}`);
        console.log(`General's users (after chatroom update): ${generalUsers2.map(u => u.displayName)}`);

        console.log("\n7. Testing array modifications...");

        let bob = await persisto.createUser({
            username: `bob_${timestamp}`,
            displayName: "Bob",
            chatroom: []
        });

        await persisto.updateUser(alice.id, {
            chatroom: [general.id],
            project: [website.id]
        });

        await persisto.updateUser(bob.id, {
            chatroom: [general.id]
        });

        let finalGeneralUsers = await persisto.getUsersFromJoinForChatroom(general.id);
        console.log(`Final general users: ${finalGeneralUsers.map(u => u.displayName)}`);
    } catch (error) {
        console.error("❌ Test failed:", error);
        throw error;
    } finally {
        if (persisto) {
            await persisto.shutDown();
        }
        process.exit(0);
    }
}

runSimplifiedSyncTest().catch(console.error); 