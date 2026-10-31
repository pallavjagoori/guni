import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("home page", () => {
  it("lists the three exam tracks", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain("CBSE Class 12");
    expect(html).toContain("JEE Main and Advanced");
    expect(html).toContain("NEET");
    expect(html).toContain('href="/login"');
  });
});
