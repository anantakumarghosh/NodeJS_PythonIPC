import socket
import json
import os
import time

class IPCServer:
    def __init__(self, socket_path='/tmp/python_server.sock'):
        self.socket_path = socket_path
        # Remove socket file if it exists
        if os.path.exists(socket_path):
            os.remove(socket_path)
            
    def run(self):
        # Create Unix domain socket
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server:
            server.bind(self.socket_path)
            server.listen(1)
            print("Python server running...")
            
            while True:
                conn, addr = server.accept()
                with conn:
                    while True:
                        try:
                            data = conn.recv(1024)
                            if not data:
                                break
                                
                            # Parse the message
                            message = json.loads(data.decode())
                            print(f"Received: {message}")
                            
                            # Process message (example processing)
                            result = {
                                "status": "success",
                                "data": message["data"] * 2
                            }
                            
                            # Send response
                            conn.send(json.dumps(result).encode())
                            
                        except Exception as e:
                            print(f"Error: {e}")
                            conn.send(json.dumps({"status": "error", "message": str(e)}).encode())
                            break
                            
    def cleanup(self):
        if os.path.exists(self.socket_path):
            os.remove(self.socket_path)

if __name__ == "__main__":
    server = IPCServer()
    try:
        server.run()
    finally:
        server.cleanup()