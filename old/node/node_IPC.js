// node_client.js
const ipc = require('node-ipc').default;

ipc.config.id = 'node_client';
ipc.config.retry = 1500;
ipc.config.silent = true;

async function sendMessage(message) {
    return new Promise((resolve, reject) => {
        ipc.connectTo('python_server', '/tmp/python_server.sock', () => {
            ipc.of.python_server.on('connect', () => {
                ipc.of.python_server.emit('message', message);
            });

            ipc.of.python_server.on('response', (data) => {
                resolve(data);
            });

            ipc.of.python_server.on('error', (err) => {
                reject(err);
            });
        });
    });
}

async function runClient() {
    try {
        for (let i = 0; i < 5; i++) {
            console.log(`Sending message ${i}...`);
            const result = await sendMessage({
                type: 'compute',
                data: i
            });
            console.log('Received:', result);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } finally {
        ipc.disconnect('python_server');
    }
}

runClient().catch(console.error);