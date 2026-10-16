import { createContext, useState, useEffect } from "react";
import api from "../api/axios";

export const AuthContext = createContext();

function AuthProvider({ children }) {
    const [logged, setLogged] = useState(localStorage.getItem("logged") === "true");
    const [user, setUser] = useState(localStorage.getItem("user") || "");
    const [userData, setUserData] = useState(() => {
        try { return JSON.parse(localStorage.getItem("userData") || "null"); } catch { return null; }
    });
    const [dark, setDark] = useState(localStorage.getItem("dark") === "true");

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (token && logged) {
            api.get("/auth/me")
                .then(res => {
                    const data = res.data.data || res.data;
                    setUserData(data);
                    localStorage.setItem("userData", JSON.stringify(data));
                })
                .catch(() => {
                    localStorage.removeItem("token");
                    localStorage.removeItem("userData");
                    localStorage.removeItem("user");
                    setLogged(false);
                    setUser("");
                    setUserData(null);
                });
        }
    }, [logged]);

    // `identifier` is the account's EPIC number.
    const login = (identifier, token, data = {}) => {
        localStorage.setItem("token", token);
        localStorage.setItem("user", identifier);
        localStorage.setItem("userData", JSON.stringify(data));
        localStorage.setItem("logged", "true");
        setUser(identifier);
        setUserData(data);
        setLogged(true);
    };

    const logout = async () => {
        try { await api.post("/auth/logout"); } catch {}
        localStorage.removeItem("token");
        localStorage.setItem("logged", "false");
        localStorage.removeItem("user");
        localStorage.removeItem("userData");
        setLogged(false);
        setUser("");
        setUserData(null);
    };

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
        localStorage.setItem("dark", dark.toString());
    }, [dark]);

    return (
        <AuthContext.Provider value={{
            logged, setLogged, user, setUser, userData, setUserData,
            dark, setDark, login, logout
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export default AuthProvider;
