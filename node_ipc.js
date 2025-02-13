// shared_memory.js
const express = require('express');
const posix = require('posix');  // You'll need to: npm install posix
const app = express();

class SharedMemory {
    constructor(key, size) {
        this.key = key;
        this.size = size;
        this.shmid = null;
        this.buffer = null;
        this.init();
    }

    init() {
        try {
            // Create shared memory segment
            this.shmid = posix.shmget(this.key, this.size, 
                posix.IPC_CREAT | posix.IPC_EXCL | 0o666);
            
            // Attach to the shared memory segment
            this.buffer = posix.shmat(this.shmid, null, 0);
        } catch (error) {
            if (error.code === 'EEXIST') {
                // If segment exists, just attach to it
                this.shmid = posix.shmget(this.key, this.size, 0o666);
                this.buffer = posix.shmat(this.shmid, null, 0);
            } else {
                throw error;
            }
        }
    }

    write(data) {
        const strData = JSON.stringify(data);
        // Write length first (4 bytes)
        this.buffer.writeInt32LE(strData.length, 0);
        // Write actual data
        this.buffer.write(strData, 4);
    }

    read() {
        // Read length first
        const length = this.buffer.readInt32LE(0);
        // Read data based on length
        const data = this.buffer.toString('utf8', 4, 4 + length);
        return JSON.parse(data);
    }

    cleanup() {
        if (this.shmid !== null) {
            // Detach from shared memory
            posix.shmdt(this.buffer);
            // Mark for deletion
            posix.shmctl(this.shmid, posix.IPC_RMID, null);
            this.shmid = null;
            this.buffer = null;
        }
    }
}

// Create shared memory with key 12345
const sharedMem = new SharedMemory(12345, 1024);

app.use(express.json());

app.post('/write', (req, res) => {
    try {
        sharedMem.write(req.body.data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/read', (req, res) => {
    try {
        const data = sharedMem.read();
        res.json({ data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

process.on('SIGINT', () => {
    sharedMem.cleanup();
    process.exit();
});

app.listen(3000, () => {
    console.log('Server running on port 3000');
});