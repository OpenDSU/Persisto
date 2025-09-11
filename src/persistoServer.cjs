
const http = require('http');
const { initialisePersisto } = require('../index.cjs');

let persistoInstance;

function parseMethodName(methodName) {
    const metadata = {
        methodName: methodName,
        description: "A dynamically generated method.",
        arguments: [],
        example: `client.execute('${methodName}', ...args)`
    };

    const upCaseFirstLetter = name => name.replace(/^./, name[0].toUpperCase());
    const downCaseFirstLetter = name => name.replace(/^./, name[0].toLowerCase());

    // CRUD pattern: create, get, update, delete, has
    let match = methodName.match(/^(create|get|update|delete|has)([A-Z]\w*)$/);
    if (match) {
        const action = match[1];
        const typeName = downCaseFirstLetter(match[2]);
        const genericId = `<${typeName}Id>`;
        switch (action) {
            case 'create':
                metadata.description = `Creates a new object of type '${typeName}'.`;
                metadata.arguments.push({ name: 'initialValues', description: `An object with the initial values for the new ${typeName}.` });
                metadata.example = `client.execute('${methodName}', { <fieldName>: '<value>' });`;
                return metadata;
            case 'get':
                metadata.description = `Retrieves an object of type '${typeName}' by its ID.`;
                metadata.arguments.push({ name: 'objectId', description: `The unique identifier for the ${typeName}.` });
                metadata.example = `client.execute('${methodName}', '${genericId}');`;
                return metadata;
            case 'update':
                metadata.description = `Updates an object of type '${typeName}'.`;
                metadata.arguments.push({ name: 'objectId', description: `The unique identifier for the ${typeName}.` });
                metadata.arguments.push({ name: 'newValues', description: `An object containing the fields to update.` });
                metadata.example = `client.execute('${methodName}', '${genericId}', { <fieldName>: '<newValue>' });`;
                return metadata;
            case 'delete':
                metadata.description = `Deletes an object of type '${typeName}' by its ID.`;
                metadata.arguments.push({ name: 'objectId', description: `The unique identifier for the ${typeName}.` });
                metadata.example = `client.execute('${methodName}', '${genericId}');`;
                return metadata;
            case 'has':
                metadata.description = `Checks for the existence of a '${typeName}' by its ID.`;
                metadata.arguments.push({ name: 'objectId', description: `The unique identifier for the ${typeName}.` });
                metadata.example = `client.execute('${methodName}', '${genericId}');`;
                return metadata;
        }
    }

    // Index pattern: getUserByEmail
    match = methodName.match(/^get([A-Z]\w*?)By([A-Z]\w*)$/);
    if (match) {
        const typeName = downCaseFirstLetter(match[1]);
        const fieldName = downCaseFirstLetter(match[2]);
        metadata.description = `Retrieves a '${typeName}' object by its indexed '${fieldName}'.`;
        metadata.arguments.push({ name: fieldName, description: `The value of the indexed field '${fieldName}'.` });
        metadata.example = `client.execute('${methodName}', '<valueToSearch>');`;
        return metadata;
    }

    // Rel pattern: getPostsFromRelWithUser
    match = methodName.match(/^get([A-Z]\w+?)sFromRelWith([A-Z]\w+)$/);
    if (match) {
        const rightType = downCaseFirstLetter(match[1]);
        const leftType = downCaseFirstLetter(match[2]);
        const genericId = `<${leftType}Id>`;
        metadata.description = `Retrieves all '${rightType}' objects related to a '${leftType}'.`;
        metadata.arguments.push({ name: `${leftType}Id`, description: `The ID of the ${leftType}.` });
        metadata.arguments.push({ name: 'sortBy', description: '(Optional) Field to sort by.' });
        metadata.arguments.push({ name: 'start', description: '(Optional) Pagination start index.' });
        metadata.arguments.push({ name: 'end', description: '(Optional) Pagination end index.' });
        metadata.arguments.push({ name: 'descending', description: '(Optional) Sort in descending order.' });
        metadata.example = `client.execute('${methodName}', '${genericId}');`;
        return metadata;
    }
    
    // Rel Ids pattern: getPostIdsFromRelWithUser
    match = methodName.match(/^get([A-Z]\w+?)IdsFromRelWith([A-Z]\w+)$/);
    if (match) {
        const rightType = downCaseFirstLetter(match[1]);
        const leftType = downCaseFirstLetter(match[2]);
        const genericId = `<${leftType}Id>`;
        metadata.description = `Retrieves all IDs of '${rightType}' objects related to a '${leftType}'.`;
        metadata.arguments.push({ name: `${leftType}Id`, description: `The ID of the ${leftType}.` });
        metadata.example = `client.execute('${methodName}', '${genericId}');`;
        return metadata;
    }

    // Grouping pattern: getUsersByCountryObjects
    match = methodName.match(/^get([A-Z]\w+?)ObjectsBy([A-Z]\w+)$/);
     if (match) {
        const groupingName = downCaseFirstLetter(match[1]);
        const fieldName = downCaseFirstLetter(match[2]);
        metadata.description = `Retrieves objects from the grouping '${groupingName}' by the value of '${fieldName}'.`;
        metadata.arguments.push({ name: 'value', description: `The value of the field '${fieldName}' to group by.` });
        metadata.example = `client.execute('${methodName}', '<groupingValue>');`;
        return metadata;
    }

    // Static methods (add non-dynamic ones here)
    switch (methodName) {
        case 'configureTypes':
            metadata.description = 'Configures or adds new object types (models).';
            metadata.arguments.push({ name: 'config', description: 'An object defining the types and their properties.' });
            metadata.example = `client.addType({ <typeName>: { <fieldName>: '<type>' } });`;
            return metadata;
        case 'addAsset':
            metadata.description = 'Configures or adds new asset types.';
            metadata.arguments.push({ name: 'config', description: 'An object defining the asset types and their properties.' });
            metadata.example = `client.addAsset({ <assetName>: ['<property>'] });`;
            return metadata;
        case 'updateAsset':
            metadata.description = 'Updates an existing asset type configuration.';
            metadata.arguments.push({ name: 'config', description: 'An object defining the asset types and their properties.' });
            metadata.example = `client.updateAsset({ <assetName>: ['<property1>', '<property2>'] });`;
            return metadata;
        case 'createIndex':
            metadata.description = 'Creates an index on a field for a given object type.';
            metadata.arguments.push({ name: 'typeName', description: 'The object type to index.' });
            metadata.arguments.push({ name: 'fieldName', description: 'The field to create the index on.' });
            metadata.example = `client.execute('createIndex', '<typeName>', '<fieldName>');`;
            return metadata;
        case 'createGrouping':
            metadata.description = 'Creates a grouping of objects based on a field.';
            metadata.arguments.push({ name: 'groupingName', description: 'The name for the new grouping.' });
            metadata.arguments.push({ name: 'typeName', description: 'The object type to group.' });
            metadata.arguments.push({ name: 'fieldName', description: 'The field to group by.' });
            metadata.example = `client.execute('createGrouping', '<groupingName>', '<typeName>', '<fieldName>');`;
            return metadata;
        case 'createRel':
            metadata.description = 'Creates a relationship between two object types.';
            metadata.arguments.push({ name: 'relName', description: 'The name for the new relationship.' });
            metadata.arguments.push({ name: 'leftType', description: 'The first object type in the relationship.' });
            metadata.arguments.push({ name: 'rightType', description: 'The second object type in the relationship.' });
            metadata.example = `client.execute('createRel', '<relName>', '<leftType>', '<rightType>');`;
            return metadata;
        case 'select':
            metadata.description = 'Performs a query on a type with filters and sorting.';
            metadata.arguments.push({ name: 'typeName', description: 'The object type to query.' });
            metadata.arguments.push({ name: 'filters', description: '(Optional) An object with fields to filter by.' });
            metadata.arguments.push({ name: 'options', description: '(Optional) An object for sorting and pagination.' });
            metadata.example = `client.execute('select', '<typeName>', { <fieldName>: '<value>' }, { sortBy: '<fieldName>' });`;
            return metadata;
    }

    return metadata; // Return default metadata if no pattern matches
}

async function startServer() {
    persistoInstance = await initialisePersisto();
    console.log('Persisto initialized');

    const server = http.createServer(async (req, res) => {
        const { method, url } = req;
        const urlParts = url.split('?');
        const path = urlParts[0];

        if (method === 'GET' && path === '/getAllMethods') {
            try {
                const methodNames = [];
                for (const prop in persistoInstance) {
                    if (typeof persistoInstance[prop] === 'function') {
                        methodNames.push(prop);
                    }
                }
                const richMethodInfo = methodNames.sort().map(parseMethodName);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, result: richMethodInfo }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Error getting methods', error: error.message }));
            }
        } else if (method === 'POST' && (path === '/addModel' || path === '/addType' || path === '/updateModel' || path === '/updateType' || path === '/addAsset' || path === '/updateAsset')) {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', async () => {
                try {
                    const config = JSON.parse(body);
                    const command = path.substring(1); // remove leading '/'
                    if (command === 'addAsset' || command === 'updateAsset') {
                        await persistoInstance.configureAssets(config);
                    } else {
                        await persistoInstance.configureTypes(config);
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: `Configuration applied for ${path}` }));
                } catch (error) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Invalid JSON in request body', error: error.message }));
                }
            });
        } else if (method === 'POST') {
            // Generic command execution
            const commandMatch = path.match(/\/(\w+)/);
            if (commandMatch) {
                const command = commandMatch[1];
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });
                req.on('end', async () => {
                    try {
                        const params = JSON.parse(body);
                        if (typeof persistoInstance[command] === 'function') {
                            const result = await persistoInstance[command](...params);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, result }));
                        } else {
                            res.writeHead(404, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: `Command not found: ${command}` }));
                        }
                    } catch (error) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Error executing command', error: error.message }));
                    }
                });
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Not Found' }));
            }
        }
        else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Not Found' }));
        }
    });

    const PORT = 3000;
    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer().catch(console.error);
