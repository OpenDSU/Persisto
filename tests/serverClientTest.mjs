
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import PersistoClient from '../src/PersistoClient.cjs';
import {} from "../clean.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
    await $$.clean();
    const serverPath = path.resolve(__dirname, '../src/persistoServer.cjs');
    const server = fork(serverPath, [], { silent: true });

    let serverOutput = '';
    let serverError = '';

    server.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`Server STDOUT: ${output}`);
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
            reject(new Error(`Server process exited unexpectedly with code ${code}. STDERR: ${serverError} STDOUT: ${serverOutput}`));
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

        // Configure user type and index
        await client.execute('configureTypes', {
            user: {
                name: 'string',
                email: 'string'
            }
        });
        await client.execute('createIndex', 'user', 'email');

        // Create a user
        const userToCreate = { name: 'John Doe', email: 'john.doe@example.com' };
        await client.execute('createUser', userToCreate);

        // Fetch the user by email to verify creation
        const fetchedUser = await client.execute('getUserByEmail', userToCreate.email);

        if (!fetchedUser || fetchedUser.name !== userToCreate.name || fetchedUser.email !== userToCreate.email) {
            failedChecks.push('Fetched user data does not match the data sent for creation.');
            console.error('Expected:', userToCreate);
            console.error('Got:', fetchedUser);
        }
        
        console.log('Client tests finished.');

    } catch (error) {
        console.error('Test failed:', error);
        failedChecks.push(error.message);
    } finally {
        server.kill();
        if (failedChecks.length > 0) {
            console.error('Server/Client test failed:', failedChecks);
            process.exit(1);
        } else {
            console.log('Server/Client test passed successfully.');
            process.exit(0);
        }
    }
}

runTest();
