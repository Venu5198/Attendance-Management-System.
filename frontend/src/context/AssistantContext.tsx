import React, { createContext, useContext, useState } from "react";

export type AssistantPosition = "FLOATING_HUD" | "NAVBAR" | "SIDEBAR";

interface AssistantContextType {
  position: AssistantPosition;
  setPosition: (pos: AssistantPosition) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const AssistantContext = createContext<AssistantContextType | undefined>(undefined);

export const AssistantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [position, setPositionState] = useState<AssistantPosition>(() => {
    const saved = localStorage.getItem("assistant_position") as AssistantPosition;
    return saved === "NAVBAR" || saved === "SIDEBAR" || saved === "FLOATING_HUD" ? saved : "FLOATING_HUD";
  });
  const [isOpen, setIsOpen] = useState(false);

  const setPosition = (pos: AssistantPosition) => {
    setPositionState(pos);
    localStorage.setItem("assistant_position", pos);
  };

  return (
    <AssistantContext.Provider value={{ position, setPosition, isOpen, setIsOpen }}>
      {children}
    </AssistantContext.Provider>
  );
};

export const useAssistant = () => {
  const context = useContext(AssistantContext);
  if (!context) {
    throw new Error("useAssistant must be used within an AssistantProvider");
  }
  return context;
};
