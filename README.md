# Persisto

**A generic and pluggable persistence library for Node.js.**

Persisto provides a straightforward way to store, retrieve, and manage data for your applications. It features a flexible, decoupled architecture that can be used as an embedded library or as a standalone persistence server.

## Core Features

- **Pluggable Storage:** Uses a strategy pattern for data storage. The default is a simple file-system strategy, but it can be extended for other backends (e.g., databases, in-memory stores).
- **Dynamic API:** Automatically generates CRUD methods (`createUser`, `getUser`, etc.) based on your data models.
- **Indexing:** Create indexes on specific fields to enable fast lookups (e.g., `getUserByEmail`).
- **Groupings:** Group objects by a common field for easy retrieval (e.g., get all users by country).
- **Relationships:** Define many-to-many relationships between different types of objects.
- **Digital Assets:** Includes first-class support for objects with managed balances, similar to NFTs or smart contracts.
- **Client-Server Architecture:** Can be run as a standalone HTTP server, with a client library for remote access.

## Installation

```bash
npm install
```

The installation process will automatically run a `postinstall` script to clone the `achillesUtils` repository, which is a required dependency for the audit functionality.

## Usage

Persisto can be used in two primary ways: as a direct library or as a client-server model.

### 1. As a Library

You can directly initialize and use the `Persisto` instance within your Node.js application.

```javascript
// example.js
const { initialisePersisto } = require('./index.cjs');

async function main() {
    // Initialize Persisto with the default file system storage
    const persisto = await initialisePersisto();

    // Define a 'user' type
    persisto.configureTypes({
        user: {
            name: 'string',
            email: 'string'
        }
    });
    
    // Create an index on the 'email' field
    await persisto.createIndex('user', 'email');

    // The API is now dynamically extended with methods for 'user'
    console.log('Creating user...');
    const newUser = await persisto.createUser({ name: 'Alice', email: 'alice@example.com' });
    console.log('Created User:', newUser);

    console.log('Finding user by ID...');
    const foundUserById = await persisto.getUser(newUser.id);
    console.log('Found User by ID:', foundUserById);
    
    console.log('Finding user by email...');
    const foundUserByEmail = await persisto.getUserByEmail('alice@example.com');
    console.log('Found User by Email:', foundUserByEmail);
    
    await persisto.shutDown();
}

main().catch(console.error);
```

### 2. As a Server and Client

You can run the persistence layer as a separate service.

**Start the Server:**

```bash
node src/persistoServer.cjs
# Server running on http://localhost:3000
```

**Use the Client:**

Create a separate file to interact with the server.

```javascript
// clientExample.js
const PersistoClient = require('./src/PersistoClient.cjs');

async function main() {
    const client = new PersistoClient('http://localhost:3000');

    // The client can add configurations to the server
    await client.addType({
        post: {
            title: 'string',
            content: 'string'
        }
    });

    // Use the generic 'execute' method to call any available function on the server
    const newPost = await client.execute('createPost', { title: 'Hello World', content: 'This is my first post!' });
    console.log('Created Post:', newPost);

    const foundPost = await client.execute('getPost', newPost.id);
    console.log('Found Post:', foundPost);
}

main().catch(console.error);
```

## Running Tests

To run the included test suite:

```bash
npm test
```

## License

See the LICENSE file for details.