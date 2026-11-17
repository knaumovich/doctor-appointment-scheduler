import "dotenv/config";
import fs from "node:fs";
import admin from "firebase-admin";

const email = process.argv[2]?.trim().toLowerCase();
const allowed = (process.env.ADMIN_EMAILS || "").split(",").map(value => value.trim().toLowerCase());
if (!email || !allowed.includes(email)) throw new Error("Provide an email listed in server/.env ADMIN_EMAILS.");
const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
admin.initializeApp({
  credential: json ? admin.credential.cert(JSON.parse(json)) :
    path ? admin.credential.cert(JSON.parse(fs.readFileSync(path, "utf8"))) : admin.credential.applicationDefault(),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});
try {
  const user = await admin.auth().getUserByEmail(email);
  const existing = (await admin.database().ref("users/" + user.uid).get()).val();
  await admin.database().ref("users/" + user.uid).update({
    uid: user.uid, email: user.email, displayName: user.displayName || "",
    role: "ADMIN", banned: false,
    createdAt: existing?.createdAt || new Date().toISOString(),
  });
  console.log("Administrator access granted. Sign out and sign in again.");
} finally {
  await admin.app().delete();
}
