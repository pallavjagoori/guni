import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({}));
vi.mock("@/lib/auth", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

// Page shells render instantly and stream their signed-in content behind Suspense.
describe("page shells", () => {
  it("renders the sign-in page", async () => {
    const { default: Page } = await import("./login/page");
    expect(renderToStaticMarkup(<Page />)).toContain("Sign in to Guni");
  });
  it("renders the setup page", async () => {
    const { default: Page } = await import("./setup/page");
    expect(renderToStaticMarkup(<Page />)).toContain("Set up Guni");
  });
  it("renders the admin page", async () => {
    const { default: Page } = await import("./admin/page");
    expect(renderToStaticMarkup(<Page />)).toContain("Admin");
  });
  it("renders the import page", async () => {
    const { default: Page } = await import("./admin/papers/new/page");
    expect(renderToStaticMarkup(<Page />)).toContain("Import a paper");
  });
  it("renders the paper page", async () => {
    const { default: Page } = await import("./admin/papers/[id]/page");
    expect(renderToStaticMarkup(<Page params={Promise.resolve({ id: "p1" })} searchParams={Promise.resolve({})} />)).toContain("Loading");
  });
});
