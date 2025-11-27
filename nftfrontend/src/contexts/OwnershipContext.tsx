import React, { createContext, useContext, useEffect, useState } from 'react';

interface OwnershipContextType {
  refreshTrigger: number;
  triggerRefresh: () => void;
}

const OwnershipContext = createContext<OwnershipContextType | undefined>(undefined);

export const useOwnership = () => {
  const context = useContext(OwnershipContext);
  if (!context) {
    throw new Error('useOwnership must be used within an OwnershipProvider');
  }
  return context;
};

export const OwnershipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    const handleOwnershipChange = (event: CustomEvent) => {
      console.log('[OwnershipContext] Ownership change detected:', event.detail);
      triggerRefresh();
    };

    window.addEventListener('nftOwnershipChanged', handleOwnershipChange as EventListener);
    
    return () => {
      window.removeEventListener('nftOwnershipChanged', handleOwnershipChange as EventListener);
    };
  }, []);

  return (
    <OwnershipContext.Provider value={{ refreshTrigger, triggerRefresh }}>
      {children}
    </OwnershipContext.Provider>
  );
};
