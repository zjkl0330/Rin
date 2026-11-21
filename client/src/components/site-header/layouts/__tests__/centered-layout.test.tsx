import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HEADER_LAYOUT_OPTIONS, normalizeHeaderLayout } from "../../layout-options";
import { getHeaderLayoutDefinition } from "../../layout-registry";
import { centeredLayoutDefinition } from "../centered-layout";

describe("centered header layout", () => {
  it("is a valid option and normalizes correctly, with invalid values falling back to classic", () => {
    expect(HEADER_LAYOUT_OPTIONS).toContain("centered");
    expect(normalizeHeaderLayout("centered")).toBe("centered");
    expect(normalizeHeaderLayout("retro-three-column")).toBe("classic");
    expect(normalizeHeaderLayout("")).toBe("classic");
    expect(normalizeHeaderLayout(null)).toBe("classic");
    expect(normalizeHeaderLayout(undefined)).toBe("classic");
  });

  it("resolves to the centered definition in the layout registry", () => {
    const definition = getHeaderLayoutDefinition("centered");
    expect(definition).toBe(centeredLayoutDefinition);
    expect(definition.kind).toBe("top");
    expect(typeof definition.renderDesktop).toBe("function");
    expect(typeof definition.renderMobile).toBe("function");
    expect(typeof definition.renderPreview).toBe("function");
    expect(typeof definition.renderRouteShell).toBe("function");
  });

  it("renders a centered preview with the brand name", () => {
    render(
      centeredLayoutDefinition.renderPreview({
        avatar: "",
        name: "Rin Test",
        themeColor: "#ff0000",
      }),
    );
    expect(screen.getByText("Rin Test")).toBeTruthy();
  });
});
