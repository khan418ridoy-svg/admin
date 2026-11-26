
import "dotenv/config";
import { auth } from "../config/firebase.js";

async function setupAdmins() {
  const adminUids = (process.env.ADMIN_UIDS || "")
    .split(",")
    .map((uid) => uid.trim())
    .filter(Boolean);

  if (adminUids.length === 0) {
    throw new Error("ADMIN_UIDS is required in .env");
  }

  const uniqueUids = [...new Set(adminUids)];

  for (const uid of uniqueUids) {
    const user = await auth.getUser(uid);

    await auth.setCustomUserClaims(uid, {
      ...user.customClaims,
      admin: true
    });

    console.log(`Admin enabled: ${user.email || uid}`);
  }

  console.log("Admin UID setup completed.");
}

setupAdmins().catch((error) => {
  console.error("Admin setup failed:", error.message);
  process.exitCode = 1;
});
