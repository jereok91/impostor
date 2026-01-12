"use client";

import { io, Socket } from "socket.io-client";
import { useEffect, useState } from "react";

let socket: Socket | null = null;

export default function useSocket() {
  const [s, setS] = useState<Socket | null>(null);

  useEffect(() => {
    if (!socket) {
      // Conectar al mismo origen (mismo host y puerto que la página)
      const url = typeof window !== "undefined" ? window.location.origin : "";
      console.log("Connecting to socket:", url);
      socket = io(url);
    }
    setS(socket);
    return () => {};
  }, []);

  return s;
}
