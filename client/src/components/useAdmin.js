import { useEffect, useState } from "react";
import { checkPassword, getAdminPassword } from "../api.js";

// true once the admin password in this tab has been confirmed by the server.
// (The server checks it on every admin action too; this only decides what to show.)
export default function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    if (getAdminPassword()) {
      checkPassword()
        .then(() => alive && setIsAdmin(true))
        .catch(() => alive && setIsAdmin(false));
    }
    const onLock = () => {
      if (!getAdminPassword()) setIsAdmin(false);
    };
    const onVerified = () => setIsAdmin(true);
    window.addEventListener("auth-change", onLock);
    window.addEventListener("admin-verified", onVerified);
    return () => {
      alive = false;
      window.removeEventListener("auth-change", onLock);
      window.removeEventListener("admin-verified", onVerified);
    };
  }, []);

  return isAdmin;
}
