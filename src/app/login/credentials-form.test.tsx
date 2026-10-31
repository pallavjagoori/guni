// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CredentialsForm } from "./credentials-form";

afterEach(cleanup);

describe("CredentialsForm", () => {
  it("submits email and password and shows the returned error", async () => {
    const action = vi.fn(async (_prev: object, form: FormData) => ({ error: `No account for ${form.get("email")}` }));
    render(<CredentialsForm action={action} submitLabel="Sign in" />);
    expect(screen.queryByLabelText("Your name")).toBeNull();
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No account for a@b.co");
  });

  it("asks for a name and a new password during setup", () => {
    render(<CredentialsForm action={vi.fn()} submitLabel="Create" askName />);
    expect(screen.getByLabelText("Your name")).toBeDefined();
    const password = screen.getByLabelText("Password");
    expect(password.getAttribute("autocomplete")).toBe("new-password");
    expect(password.getAttribute("minlength")).toBe("10");
  });

  it("disables the button while waiting", async () => {
    let finish: (v: object) => void = () => {};
    const action = vi.fn(() => new Promise<object>((r) => (finish = r)));
    render(<CredentialsForm action={action} submitLabel="Sign in" />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "pw");
    await userEvent.click(screen.getByRole("button"));
    expect((await screen.findByRole("button", { name: "Please wait…" })).hasAttribute("disabled")).toBe(true);
    finish({});
  });
});
