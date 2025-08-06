import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

let socketInstance = null;

export function useSocket() {
  const socketRef = useRef();

  if (!socketInstance) {
    socketInstance = io(window.__SOCKET_IO_URL__ || 'http://localhost:3001', {
      transports: ['websocket'],
      auth: {
        token: localStorage.getItem('token')
      }
    });
  }

  useEffect(() => {
    socketRef.current = socketInstance;
    return () => {
      // Do not disconnect on unmount to keep singleton
    };
  }, []);

  return { socket: socketRef.current || socketInstance };
}