#!/usr/bin/env python3
"""
Temporary Redis-compatible server for testing
Runs on port 6380 to match docker-compose configuration
"""

import socket
import threading
import time
from typing import Dict, Any

class SimpleRedisServer:
    def __init__(self, host='localhost', port=6380):
        self.host = host
        self.port = port
        self.data: Dict[str, Any] = {}
        self.running = True
        
    def handle_client(self, conn, addr):
        """Handle client connection"""
        print(f"Connected by {addr}")
        while self.running:
            try:
                data = conn.recv(1024)
                if not data:
                    break
                    
                # Simple PING response for health checks
                if b'PING' in data:
                    conn.send(b'+PONG\r\n')
                    continue
                    
                # Simple SET command
                if data.startswith(b'*3\r\n$3\r\nSET\r\n'):
                    conn.send(b'+OK\r\n')
                    continue
                    
                # Simple GET command  
                if data.startswith(b'*2\r\n$3\r\nGET\r\n'):
                    conn.send(b'$-1\r\n')  # NULL response
                    continue
                    
                # Default response
                conn.send(b'+OK\r\n')
                    
            except ConnectionResetError:
                break
            except Exception as e:
                print(f"Error handling client {addr}: {e}")
                break
                
        conn.close()
        print(f"Disconnected from {addr}")
        
    def start(self):
        """Start the server"""
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        try:
            sock.bind((self.host, self.port))
            sock.listen(5)
            print(f"🚀 Temporary Redis server listening on {self.host}:{self.port}")
            print("This is a minimal Redis-compatible server for testing only!")
            print("Press Ctrl+C to stop")
            
            while self.running:
                try:
                    conn, addr = sock.accept()
                    # Handle each client in a separate thread
                    client_thread = threading.Thread(
                        target=self.handle_client, 
                        args=(conn, addr)
                    )
                    client_thread.daemon = True
                    client_thread.start()
                    
                except KeyboardInterrupt:
                    print("\n👋 Shutting down server...")
                    self.running = False
                    break
                except Exception as e:
                    print(f"Server error: {e}")
                    
        except Exception as e:
            print(f"Failed to start server: {e}")
        finally:
            sock.close()

if __name__ == "__main__":
    server = SimpleRedisServer()
    try:
        server.start()
    except KeyboardInterrupt:
        print("\n👋 Server stopped")