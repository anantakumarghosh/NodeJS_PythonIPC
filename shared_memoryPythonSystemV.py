"""
This program demonstrates how to use shared memory in Python to communicate between different processes.
Shared memory allows different programs to share data by reading and writing to the same memory space.
System V Shared Memory approach is used in this program, which is available on Unix/Linux systems.
"""

import ctypes  # Provides C-compatible data types
import json    # For converting Python objects to/from strings
import struct  # For packing/unpacking binary data
import time
from ctypes import c_char, c_int  # Specific C-compatible types we'll use

class SharedMemory:
    """
    A class that manages shared memory operations between different processes.
    This allows different programs to communicate by reading and writing to the same memory space.
    """
    
    def __init__(self, key, size):
        """
        Initialize the shared memory segment.
        
        Args:
            key (int): A unique identifier for the shared memory segment (must match between programs)
            size (int): Size of the shared memory segment in bytes
        """
        self.key = key          # Unique identifier for the shared memory
        self.size = size        # Size of the shared memory segment
        self.shmid = None       # Will store the shared memory segment ID
        self.memory = None      # Will store the actual memory buffer
        # Load the C standard library - required for shared memory operations
        self.libc = ctypes.CDLL('libc.so.6', use_errno=True)
        self.init()             # Set up the shared memory

    def init(self):
        """
        Initialize and attach to the shared memory segment.
        This method creates or connects to an existing shared memory segment.
        """
        # These constants are used in Unix/Linux shared memory operations
        IPC_CREAT = 0o1000  # Create new segment if it doesn't exist
        IPC_EXCL = 0o2000   # Fail if segment exists

        # Create or get a shared memory segment
        # 0o666 sets read/write permissions for user/group/others
        self.shmid = self.libc.shmget(c_int(self.key), c_int(self.size), c_int(IPC_CREAT | 0o666))
        if self.shmid == -1:
            errno = ctypes.get_errno()
            raise OSError(f"shmget failed with errno {errno}")

        # Tell Python what type of data shmat will return (a pointer)
        self.libc.shmat.restype = ctypes.c_void_p
        # Tell Python what types of arguments shmat expects
        self.libc.shmat.argtypes = [c_int, ctypes.c_void_p, c_int]

        # Attach to the shared memory segment
        # shmat returns the address where the segment is attached
        addr = self.libc.shmat(self.shmid, None, 0)
        if addr == -1:
            errno = ctypes.get_errno()
            raise OSError(f"shmat failed with errno {errno}")

        # Create a Python buffer that points to the shared memory
        # This allows us to read/write to the memory using Python
        self.memory = (c_char * self.size).from_address(addr)
        print("Successfully initialized shared memory")

    def write(self, data):
        """
        Write data to the shared memory segment.
        
        Args:
            data: Any JSON-serializable Python object
            
        The data is stored in the following format:
        - First 4 bytes: Length of the data (32-bit integer)
        - Remaining bytes: The actual data as a JSON string
        """
        try:
            # Convert Python object to JSON string
            json_str = json.dumps(data)
            # Convert JSON string to bytes for storage
            json_bytes = json_str.encode('utf-8')
            
            # Clear the existing memory contents
            ctypes.memset(ctypes.addressof(self.memory), 0, self.size)
            
            # Write the length of the data as a 32-bit integer
            # '=I' means native byte order, unsigned int
            struct.pack_into('=I', self.memory, 0, len(json_bytes))
            
            # Write the actual data byte by byte
            for i, b in enumerate(json_bytes):
                self.memory[4 + i] = bytes([b])
            
            print(f"Successfully wrote to shared memory: {data}")
        except Exception as e:
            print(f"Write error: {e}")
            raise

    def read(self):
        """
        Read data from the shared memory segment.
        
        Returns:
            The Python object that was previously stored, or None if read fails
        """
        try:
            # Read the length (first 4 bytes as 32-bit integer)
            # '=I' means native byte order, unsigned int
            length = struct.unpack_from('=I', self.memory, 0)[0]
            
            # Validate the length
            if length <= 0 or length > self.size - 4:
                return None
            
            # Read the actual data bytes
            data_bytes = bytes(self.memory[4:4+length])
            # Convert bytes back to string
            data_str = data_bytes.decode('utf-8')
            
            # Convert JSON string back to Python object
            return json.loads(data_str)
        except Exception as e:
            print(f"Read error: {e}")
            return None

    def cleanup(self):
        """
        Clean up the shared memory segment.
        This should be called when you're done with the shared memory to free system resources.
        """
        if self.memory:
            try:
                # Tell Python what type of argument shmdt expects
                self.libc.shmdt.argtypes = [ctypes.c_void_p]
                
                # Detach from shared memory
                result = self.libc.shmdt(ctypes.addressof(self.memory))
                if result == -1:
                    errno = ctypes.get_errno()
                    print(f"shmdt failed with errno {errno}")
                
                # Command to remove shared memory segment
                IPC_RMID = 0
                
                # Mark the shared memory segment for deletion
                result = self.libc.shmctl(self.shmid, IPC_RMID, None)
                if result == -1:
                    errno = ctypes.get_errno()
                    print(f"shmctl failed with errno {errno}")
                
                print("Successfully cleaned up shared memory")
            except Exception as e:
                print(f"Cleanup error: {e}")
            finally:
                self.memory = None
                self.shmid = None

# This code runs only if this file is run directly (not imported)
if __name__ == "__main__":
    try:
        # Create shared memory instance with key 12345 (must match Node.js program)
        # and size 1024 bytes
        shared_mem = SharedMemory(5678, 1024)
        
        print("Shared memory monitor started. Press Ctrl+C to exit.")
        print("Available commands:")
        print("1. read - Read from shared memory")
        print("2. write <message> - Write message to shared memory")
        print("3. quit - Exit the program")
        
        # Main program loop
        while True:
            try:
                # Get command from user
                command = input("> ").strip()
                
                if command == "read":
                    # Read and display data from shared memory
                    data = shared_mem.read()
                    print(f"Read from shared memory: {data}")
                
                elif command.startswith("write "):
                    # Write message to shared memory
                    message = command[6:]  # Remove "write " prefix
                    shared_mem.write({"message": message})
                    print("Write successful")
                
                elif command == "quit":
                    # Exit the program
                    break
                
                else:
                    print("Unknown command")
                    
            except Exception as e:
                print(f"Error: {e}")
                
    except KeyboardInterrupt:
        # Handle Ctrl+C gracefully
        print("\nStopping...")
    finally:
        # Always clean up shared memory when exiting
        shared_mem.cleanup()