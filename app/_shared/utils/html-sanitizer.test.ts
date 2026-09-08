// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { sanitizeHtml, stripHtml } from "./html-sanitizer";

describe("sanitizeHtml", () => {
  it("removes script tags", () => {
    const result = sanitizeHtml("<p>text</p><script>alert('xss')</script>");
    expect(result).toBe("<p>text</p>");
  });

  it("removes style tags", () => {
    const result = sanitizeHtml("<p>text</p><style>body{color:red}</style>");
    expect(result).toBe("<p>text</p>");
  });

  it("removes event handlers", () => {
    const result = sanitizeHtml('<p onclick="alert(1)">text</p>');
    expect(result).toBe("<p>text</p>");
  });

  it("removes iframes", () => {
    const result = sanitizeHtml("<p>text</p><iframe src='https://evil.com'></iframe>");
    expect(result).toBe("<p>text</p>");
  });

  it("handles empty input", () => {
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml(null as any)).toBe("");
    expect(sanitizeHtml(undefined as any)).toBe("");
  });

  it("preserves safe HTML", () => {
    const result = sanitizeHtml("<p><strong>bold</strong> <em>italic</em></p>");
    expect(result).toBe("<p><strong>bold</strong> <em>italic</em></p>");
  });
});

describe("stripHtml", () => {
  it("strips HTML tags", () => {
    const result = stripHtml("<p>Hello <strong>world</strong></p>");
    expect(result).toBe("Hello world");
  });

  it("handles empty input", () => {
    expect(stripHtml("")).toBe("");
    expect(stripHtml(null as any)).toBe("");
    expect(stripHtml(undefined as any)).toBe("");
  });
});
