import { redirect } from "next/navigation";
import { connection } from "next/server";
import { adminExists } from "@/lib/auth";
import { CredentialsForm } from "../login/credentials-form";
import { createFirstAdmin } from "./actions";

export async function SetupGate() {
  // Decided per request: the answer changes the moment the first admin is created.
  await connection();
  if (await adminExists()) redirect("/login");
  return (
    <>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Create the admin account. This page closes once an admin exists.
      </p>
      <CredentialsForm action={createFirstAdmin} submitLabel="Create admin account" askName />
    </>
  );
}
