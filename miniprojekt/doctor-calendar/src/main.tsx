import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { AuthProvider } from "./auth/AuthContext";
import { isFirebaseConfigured } from "./firebaseConfig";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isFirebaseConfigured ? (
      <AuthProvider><App /></AuthProvider>
    ) : (
      <main style={{ maxWidth: 640, margin: "64px auto", padding: 24 }}>
        <h1>Doctor Appointment Scheduler</h1>
        <p>Firebase has not been configured yet.</p>
        <p>Copy <code>.env.example</code> to <code>.env.local</code>, add your Firebase web app settings, and restart the development server.</p>
        <p>See the README for backend and database setup.</p>
      </main>
    )}
  </React.StrictMode>
);
