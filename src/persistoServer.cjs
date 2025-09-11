
const http = require('http');
const { initialisePersisto } = require('../index.cjs');

let persistoInstance;

async function startServer() {
    persistoInstance = await initialisePersisto();
    console.log('Persisto initialized');

    const server = http.createServer(async (req, res) => {
        const { method, url } = req;
        const urlParts = url.split('?');
        const path = urlParts[0];

        if (method === 'POST' && (path === '/addModel' || path === '/addType' || path === '/updateModel' || path === '/updateType')) {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', async () => {
                try {
                    const config = JSON.parse(body);
                    await persistoInstance.configureTypes(config);
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
