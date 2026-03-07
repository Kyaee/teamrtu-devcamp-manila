import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

export function useConnectivity() {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>(
    new Date().toISOString(),
  );

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(Boolean(state.isConnected));
      setLastUpdatedAt(new Date().toISOString());
    });

    return unsubscribe;
  }, []);

  return { isConnected, lastUpdatedAt };
}
