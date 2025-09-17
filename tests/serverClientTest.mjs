import {fork} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';
import PersistoClient from '../src/PersistoClient.cjs';
import {} from "../clean.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
    await $$.clean();
    const serverPath = path.resolve(__dirname, '../src/persistoServer.cjs');
    const server = fork(serverPath, [], {silent: true});

    let serverOutput = '';
    let serverError = '';

    server.stdout.on('data', (data) => {
        const output = data.toString();
        // Suppress verbose server output from the test log to keep it clean,
        // but uncomment for debugging if needed.
        // console.log(`Server STDOUT: ${output}`);
        serverOutput += output;
    });

    server.stderr.on('data', (data) => {
        const error = data.toString();
        console.error(`Server STDERR: ${error}`);
        serverError += error;
    });

    const serverStartPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            server.kill();
            reject(new Error(`Server failed to start within 10 seconds. STDERR: ${serverError} STDOUT: ${serverOutput}`));
        }, 10000); // 10 second timeout

        server.on('exit', (code) => {
            clearTimeout(timeout);
            if (code !== 0 && !serverOutput.includes('Server running')) {
                reject(new Error(`Server process exited unexpectedly with code ${code}. STDERR: ${serverError} STDOUT: ${serverOutput}`));
            }
        });

        const checkInterval = setInterval(() => {
            if (serverOutput.includes('Server running')) {
                clearTimeout(timeout);
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
    });

    const client = new PersistoClient('http://localhost:3000');
    let failedChecks = [];

    try {
        await serverStartPromise;
        console.log('Server is ready. Running client tests...');

        // 1. Configure Models, Assets, Indexes, Grouping, and Rels
        console.log('Configuring server...');
        await client.addType({
            user: {name: 'string', email: 'string', country: 'string', post: 'array'},
            post: {title: 'string', content: 'string'}
        });
        await client.addAsset({
            wallet: ['owner', 'availableBalance']
        });
        await client.execute('createIndex', 'user', 'email');
        await client.execute('createGrouping', 'usersByCountry', 'user', 'country');
        await client.execute('createRel', 'userPosts', 'user', 'post');
        console.log('Configuration complete.');

        // 2. Test getAllMethods to ensure all dynamic methods are created
        console.log('Testing getAllMethods...');
        const methods = await client.getAllMethods();
        console.log('getAllMethods response:', JSON.stringify(methods, null, 4));

        // Define known static/core methods to filter them out for display
        console.log('Testing getAllMethods...');
        // Log the detailed method information
        console.log('Available server methods:');
        methods.forEach(method => {
            console.log(`- ${method.methodName}: ${method.description}`);
            if (method.arguments.length > 0) {
                console.log('  Arguments:');
                method.arguments.forEach(arg => {
                    console.log(`    - ${arg.name}: ${arg.description}`);
                });
            }
            console.log(`  Example: ${method.example}`);
        });

        if (!Array.isArray(methods) || methods.length === 0) {
            failedChecks.push('getAllMethods should return a non-empty array.');
        } else {
            // Check for a specific method's structure
            const createUserMethod = methods.find(m => m.methodName === 'createUser');
            if (!createUserMethod || !createUserMethod.description || !Array.isArray(createUserMethod.arguments) || !createUserMethod.example) {
                failedChecks.push('Method metadata for "createUser" is incomplete or malformed.');
            }

            const expectedMethodNames = [
                'createUser', 'getUser', 'updateUser', 'deleteUser',
                'createPost', 'getPost', 'updatePost', 'deletePost',
                'createWallet', 'getWallet', 'updateWallet', 'deleteWallet',
                'getUserByEmail',
                'getUsersByCountryObjectsByCountry',
                'getPostsFromRelWithUser', 'getPostIdsFromRelWithUser'
            ];

            const actualMethodNames = methods.map(m => m.methodName);
            for (const expectedMethod of expectedMethodNames) {
                if (!actualMethodNames.includes(expectedMethod)) {
                    failedChecks.push(`getAllMethods response should include '${expectedMethod}'.`);
                }
            }
        }

        console.log('getAllMethods test complete.');


        // 3. Models and Indexing Test
        console.log('Testing Models and Indexing...');
        const userToCreate = {name: 'John Doe', email: 'john.doe@example.com', country: 'USA'};
        const createdUser = await client.execute('createUser', userToCreate);
        await client.execute('setEmailForUser', createdUser.id, userToCreate.email);

        const user2 = {name: 'Jane Doe', email: 'jane.doe@example.com', country: 'USA'};
        const createdUser2 = await client.execute('createUser', user2);
        await client.execute('setEmailForUser', createdUser2.id, user2.email);

        const user3 = {name: 'Pierre Dupont', email: 'pierre.dupont@example.com', country: 'France'};
        const createdUser3 = await client.execute('createUser', user3);
        await client.execute('setEmailForUser', createdUser3.id, user3.email);

        const fetchedUser = await client.execute('getUserByEmail', userToCreate.email);
        if (!fetchedUser || fetchedUser.name !== userToCreate.name || fetchedUser.email !== userToCreate.email) {
            failedChecks.push('Fetched user data does not match the data sent for creation.');
        }
        console.log('Models and Indexing test complete.');

        // 4. Grouping Test
        console.log('Testing Grouping...');
        const usaUsers = await client.execute('getUsersByCountryObjectsByCountry', 'USA');
        if (!usaUsers || usaUsers.length !== 2) {
            failedChecks.push('Grouping test failed: Expected 2 users from USA.');
        }
        const franceUsers = await client.execute('getUsersByCountryObjectsByCountry', 'France');
        if (!franceUsers || franceUsers.length !== 1) {
            failedChecks.push('Grouping test failed: Expected 1 user from France.');
        }
        console.log('Grouping test complete.');

        // 5. Relationships (Rels) Test
        console.log('Testing Relationships...');
        const post1 = await client.execute('createPost', {title: 'Post 1', content: 'Content 1'});
        const post2 = await client.execute('createPost', {title: 'Post 2', content: 'Content 2'});
        await client.execute('updateUser', createdUser.id, {post: [post1.id, post2.id]});
        const userPosts = await client.execute('getPostsFromRelWithUser', createdUser.id);
        if (!userPosts || userPosts.length !== 2) {
            failedChecks.push('Relationships test failed: Expected 2 posts for the user.');
        }
        console.log('Relationships test complete.');

        // 6. Assets Test
        console.log('Testing Assets...');
        const wallet1 = await client.execute('createWallet', {owner: createdUser.id});
        const wallet2 = await client.execute('createWallet', {owner: 'jane.doe@example.com'}); // Not a real user id, but ok for this test
        await client.execute('updateWallet', wallet1.id, {availableBalance: 100});
        await client.execute('transferPoints', 30, wallet1.id, wallet2.id, 'test transfer');
        const wallet1Balance = await client.execute('getBalance', wallet1.id);
        const wallet2Balance = await client.execute('getBalance', wallet2.id);
        if (wallet1Balance !== 70 || wallet2Balance !== 30) {
            failedChecks.push(`Assets test failed: Incorrect balances after transfer. Wallet1: ${wallet1Balance}, Wallet2: ${wallet2Balance}`);
        }
        await client.execute('lockPoints', wallet1.id, 20, 'test lock');
        const wallet1LockedBalance = await client.execute('getLockedBalance', wallet1.id);
        if (wallet1LockedBalance !== 20) {
            failedChecks.push(`Assets test failed: Incorrect locked balance. Expected 20, got ${wallet1LockedBalance}`);
        }
        await client.execute('unlockPoints', wallet1.id, 10, 'test unlock');
        const wallet1FinalBalance = await client.execute('getBalance', wallet1.id);
        const wallet1FinalLockedBalance = await client.execute('getLockedBalance', wallet1.id);
        if (wallet1FinalBalance !== 60 || wallet1FinalLockedBalance !== 10) {
            failedChecks.push(`Assets test failed: Incorrect final balances. Balance: ${wallet1FinalBalance}, Locked: ${wallet1FinalLockedBalance}`);
        }
        console.log('Assets test complete.');

        // 7. Select Test
        console.log('Testing Select...');
        const selectedUsersResult = await client.execute('select', 'user', {country: 'USA'}, {
            sortBy: 'name',
            descending: true
        });
        const selectedUsers = selectedUsersResult.objects;
        if (!selectedUsers || selectedUsers.length !== 2 || selectedUsers[0].name !== 'John Doe') {
            failedChecks.push(`Select test failed. Expected John Doe first, got ${selectedUsers.length > 0 ? selectedUsers[0].name : 'nothing'}`);
        }
        console.log('Select test complete.');


        console.log('All client tests finished.');

    } catch (error) {
        console.error('Test failed:', error);
        failedChecks.push(error.message);
    } finally {
        server.kill();
        if (failedChecks.length > 0) {
            console.error('Server/Client test failed with errors:', failedChecks);
            process.exit(1);
        } else {
            console.log('Server/Client test passed successfully.');
            process.exit(0);
        }
    }
}

runTest();
