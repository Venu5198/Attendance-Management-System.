import React, { createContext, useContext, useEffect, useState } from "react";
import type { User } from "../types";
import { authApi } from "../api/auth";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("auth_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("auth_token"));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const verifyUser = async () => {
      const storedToken = localStorage.getItem("auth_token");
      if (storedToken) {
        try {
          const profile = await authApi.getMe();
          setUser(profile);
          localStorage.setItem("auth_user", JSON.stringify(profile));
        } catch (err) {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("auth_user");
          setUser(null);
          setToken(null);
        }
      }
      setIsLoading(false);
    };
    verifyUser();
  }, []);

  const login = async (username: string, password: string): Promise<User> => {
    const res = await authApi.login({ username, password });
    localStorage.setItem("auth_token", res.access_token);
    if (res.refresh_token) {
      localStorage.setItem("refresh_token", res.refresh_token);
    }
    setToken(res.access_token);

    const profile: User = {
      user_id: res.user_id,
      username: res.username,
      email: res.username.includes("@") ? res.username : `${res.username}@company.com`,
      role: res.role,
      employee_id: res.employee_id,
      is_active: true,
    };
    setUser(profile);
    localStorage.setItem("auth_user", JSON.stringify(profile));
    return profile;
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("auth_user");
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
