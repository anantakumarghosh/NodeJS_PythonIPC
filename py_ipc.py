# shared_memory.py
import sysv_ipc
import json
import struct
import time

class SharedMemory:
    def __init__(self, key, size):
        self.key = key
        self.size = size
        self.memory = None
        self.init()

    def init(self):
        try:
            # Try to create new shared memory segment
            self.memory = sysv_ipc.SharedMemory(
                self.key,
                sysv_ipc.IPC_CREAT | 0o666,
                size=self.size
            )
        except sysv_ipc.ExistentialError:
            # If already exists, just attach to it
            self.memory = sysv_ipc.SharedMemory(self.key)

    def write(self, data):
        # Convert data to JSON string
        json_str = json.dumps(data)
        # Convert to bytes
        json_bytes = json_str.encode('utf-8')
        # Pack length as 4-byte integer
        length_bytes = struct.pack('i', len(json_bytes))
        # Write length followed by data
        self.memory.write(length_bytes)
        self.memory.write(json_bytes, offset=4)

    def read(self):
        # Read length (4 bytes)
        length_bytes = self.memory.read(4)
        length = struct.unpack('i', length_bytes)[0]
        # Read data
        data_bytes = self.memory.read(length, offset=4)
        # Decode and parse JSON
        json_str = data_bytes.decode('utf-8')
        return json.loads(json_str)

    def cleanup(self):
        if self.memory:
            self.memory.detach()
            try:
                self.memory.remove()
            except:
                pass  # Someone else might still be using it

if __name__ == "__main__":
    # Use same key as Node.js (12345)
    shared_mem = SharedMemory(12345, 1024)
    
    try:
        print("Starting shared memory monitor...")
        while True:
            try:
                data = shared_mem.read()
                print(f"Read from shared memory: {data}")
            except json.JSONDecodeError:
                pass  # No valid data yet
            time.sleep(0.1)  # Adjust polling interval
            
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        shared_mem.cleanup()