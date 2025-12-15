import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { HelpPanel } from "@/components/HelpPanel";
import { GlobalHelpButton } from "@/components/GlobalHelpButton";

interface HelpContextType {
  isOpen: boolean;
  currentModuleId: string | null;
  currentItemId: string | null;
  openPanel: (moduleId?: string, itemId?: string) => void;
  closePanel: () => void;
  togglePanel: () => void;
}

const HelpContext = createContext<HelpContextType | null>(null);

export function useHelp() {
  const context = useContext(HelpContext);
  if (!context) {
    throw new Error("useHelp must be used within a HelpProvider");
  }
  return context;
}

interface HelpProviderProps {
  children: ReactNode;
}

export function HelpProvider({ children }: HelpProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentModuleId, setCurrentModuleId] = useState<string | null>(null);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);

  const openPanel = useCallback((moduleId?: string, itemId?: string) => {
    setCurrentModuleId(moduleId || null);
    setCurrentItemId(itemId || null);
    setIsOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setCurrentModuleId(null);
    setCurrentItemId(null);
  }, []);

  const togglePanel = useCallback(() => {
    if (isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  }, [isOpen, openPanel, closePanel]);

  return (
    <HelpContext.Provider
      value={{
        isOpen,
        currentModuleId,
        currentItemId,
        openPanel,
        closePanel,
        togglePanel,
      }}
    >
      {children}
      <HelpPanel
        open={isOpen}
        onClose={closePanel}
        initialModuleId={currentModuleId || undefined}
        initialItemId={currentItemId || undefined}
      />
      <GlobalHelpButton />
    </HelpContext.Provider>
  );
}
