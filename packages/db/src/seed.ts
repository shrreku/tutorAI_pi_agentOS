import { createDb } from "./client.js";
import { users } from "./schema/index.js";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  const { db, sql } = createDb(url);
  const devEmail = "dev@studyagent.local";
  const userId = "usr_dev_local";

  await db
    .insert(users)
    .values({
      id: userId,
      email: devEmail,
      displayName: "Local Developer",
      settingsJson: {},
    })
    .onConflictDoNothing({ target: users.id });

  console.log("Seed ensured dev user", userId, devEmail);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
