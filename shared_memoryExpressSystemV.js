/**
 * This program demonstrates how to use shared memory in Node.js to communicate between different processes.
 * It creates a web server that can read from and write to shared memory, allowing other programs
 * (like the Python script) to communicate with it.
 * System V Shared Memory approach is used in this program, which is available on Unix/Linux systems.
 * 
 */

const express = require('express');              // Web server framework
const ffi = require('ffi-napi');                // For calling C functions from Node.js
const ref = require('ref-napi');                // For handling C pointers and data types
const app = express();

// Load required C library functions for shared memory operations
// These functions are part of the standard C library (libc)
const libc = ffi.Library(null, {
    // Define the functions we need with their C types:
    // 'function_name': ['return_type', ['arg1_type', 'arg2_type', ...]]
    'shmget': ['int', ['int', 'size_t', 'int']],         // Create/get shared memory segment
    'shmat': ['pointer', ['int', 'pointer', 'int']],     // Attach to shared memory
    'shmdt': ['int', ['pointer']],                       // Detach from shared memory
    'shmctl': ['int', ['int', 'int', 'pointer']]         // Control shared memory
});

class SharedMemory {
    /**
     * A class that manages shared memory operations between different processes.
     * This allows different programs to communicate by reading and writing to the same memory space.
     */
    
    constructor(key, size) {
        /**
         * Initialize the shared memory segment.
         * @param {number} key - Unique identifier for the shared memory segment (must match between programs)
         * @param {number} size - Size of the shared memory segment in bytes
         */
        this.key = key;         // Unique identifier for the shared memory
        this.size = size;       // Size of the shared memory segment
        this.shmid = null;      // Will store the shared memory segment ID
        this.buffer = null;     // Will store the memory buffer
        this.pointer = null;    // Will store the pointer to shared memory
        this.init();            // Set up the shared memory
    }

    init() {
        /**
         * Initialize and attach to the shared memory segment.
         * This method creates or connects to an existing shared memory segment.
         */
        try {
            // Constants used in shared memory operations
            const IPC_CREAT = 0o1000;  // Create new segment if it doesn't exist

            // Create or get shared memory segment
            // 0o666 sets read/write permissions for user/group/others
            this.shmid = libc.shmget(this.key, this.size, IPC_CREAT | 0o666);

            if (this.shmid === -1) {
                throw new Error('Failed to create/get shared memory segment');
            }

            // Attach to the shared memory segment
            // This gives us a pointer to where the memory is located
            this.pointer = libc.shmat(this.shmid, ref.NULL, 0);
            if (this.pointer.isNull()) {
                throw new Error('Failed to attach to shared memory');
            }

            // Create a buffer that we can use to read/write the shared memory
            this.buffer = ref.reinterpret(this.pointer, this.size, 0);
            
            console.log('Successfully initialized shared memory');
        } catch (error) {
            console.error('Shared memory initialization error:', error);
            throw error;
        }
    }

    write(data) {
        /**
         * Write data to the shared memory segment.
         * @param {any} data - Any JSON-serializable JavaScript object
         * 
         * The data is stored in the following format:
         * - First 4 bytes: Length of the data (32-bit integer)
         * - Remaining bytes: The actual data as a JSON string
         */
        try {
            // Convert JavaScript object to JSON string
            const strData = JSON.stringify(data);
            
            // Clear the existing memory contents
            this.buffer.fill(0);
            
            // Write the length of the data as a 32-bit integer
            this.buffer.writeInt32LE(strData.length, 0);
            
            // Write the actual data
            this.buffer.write(strData, 4);
            
            console.log('Successfully wrote to shared memory:', data);
        } catch (error) {
            console.error('Write error:', error);
            throw error;
        }
    }

    read() {
        /**
         * Read data from the shared memory segment.
         * @returns {any} The JavaScript object that was previously stored, or null if read fails
         */
        try {
            // Read the length (first 4 bytes as 32-bit integer)
            const length = this.buffer.readInt32LE(0);
            
            // Validate the length
            if (length <= 0 || length > this.size - 4) {
                return null;
            }
            
            // Read the actual data and convert it back to a JavaScript object
            const data = this.buffer.toString('utf8', 4, 4 + length);
            return JSON.parse(data);
        } catch (error) {
            console.error('Read error:', error);
            return null;
        }
    }

    cleanup() {
        /**
         * Clean up the shared memory segment.
         * This should be called when you're done with the shared memory to free system resources.
         */
        if (this.pointer) {
            try {
                // Detach from shared memory
                const result = libc.shmdt(this.pointer);
                if (result === -1) {
                    console.error('Failed to detach shared memory');
                }

                // Mark the shared memory segment for deletion
                const IPC_RMID = 0;
                const result2 = libc.shmctl(this.shmid, IPC_RMID, ref.NULL);
                if (result2 === -1) {
                    console.error('Failed to mark shared memory for deletion');
                }

                console.log('Successfully cleaned up shared memory');
            } catch (error) {
                console.error('Cleanup error:', error);
            }
            
            // Clear our references
            this.buffer = null;
            this.pointer = null;
            this.shmid = null;
        }
    }
}

// Set up Express to handle JSON requests
app.use(express.json());

// Create shared memory instance with key 12345 (must match Python program)
// and size 1024 bytes
const sharedMem = new SharedMemory(12345, 1024);

/**
 * POST endpoint for writing data to shared memory
 * Example: POST http://localhost:3000/write
 * Body: { "data": { "message": "Hello World" } }
 */
app.post('/write', (req, res) => {
    try {
        // Write the data from the request body to shared memory
        sharedMem.write(req.body.data);
        // Send success response
        res.json({ success: true });
    } catch (error) {
        // If there's an error, send a 500 status code with error details
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET endpoint for reading data from shared memory
 * Example: GET http://localhost:3000/read
 */
app.get('/read', (req, res) => {
    try {
        // Read data from shared memory
        const data = sharedMem.read();
        if (data === null) {
            // If no data is available, send a default message
            res.json({ data: "No data available" });
        } else {
            // Send the data back to the client
            res.json({ data });
        }
    } catch (error) {
        // If there's an error, send a 500 status code with error details
        res.status(500).json({ error: error.message });
    }
});

/**
 * Set up cleanup handlers for graceful shutdown
 * These ensure we don't leave shared memory segments allocated when the program exits
 */

// Handle Ctrl+C and similar interrupt signals
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT (Ctrl+C). Cleaning up...');
    sharedMem.cleanup();
    process.exit();
});

// Handle normal process termination
process.on('exit', () => {
    console.log('Process exiting. Cleaning up...');
    sharedMem.cleanup();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    sharedMem.cleanup();
    process.exit(1);
});

// Start the web server
app.listen(3000, () => {
    console.log('Server running on port 3000');
    console.log('\nAvailable endpoints:');
    console.log('- POST /write - Write data to shared memory');
    console.log('  Example: curl -X POST http://localhost:3000/write -H "Content-Type: application/json" -d \'{"data": {"message": "Hello"}}\'\n');
    console.log('- GET /read  - Read data from shared memory');
    console.log('  Example: curl http://localhost:3000/read\n');
    console.log('Press Ctrl+C to exit');
});