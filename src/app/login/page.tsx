import { signIn } from "./actions";
import { CredentialsForm } from "./credentials-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Sign in to Guni</h1>
      <CredentialsForm action={signIn} submitLabel="Sign in" />
    </main>
  );
}
