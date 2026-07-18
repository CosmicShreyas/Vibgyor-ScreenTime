import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../services/api';

interface RestrictedModeContextType {
  isRestricted: boolean;
  isLoading: boolean;
  refreshRestrictedMode: () => Promise<void>;
}

const RestrictedModeContext = createContext<RestrictedModeContextType | undefined>(undefined);

export const RestrictedModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isRestricted, setIsRestricted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshRestrictedMode = async () => {
    try {
      const response = await api.get('/dashboard-config');
      setIsRestricted(response.data.restrictedMode || false);
    } catch (error) {
      console.error('Error fetching restricted mode:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshRestrictedMode();
  }, []);

  return (
    <RestrictedModeContext.Provider value={{ isRestricted, isLoading, refreshRestrictedMode }}>
      {children}
    </RestrictedModeContext.Provider>
  );
};

export const useRestrictedMode = () => {
  const context = useContext(RestrictedModeContext);
  if (context === undefined) {
    throw new Error('useRestrictedMode must be used within a RestrictedModeProvider');
  }
  return context;
};
