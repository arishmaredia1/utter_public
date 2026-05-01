import { describe, expect, it } from "vitest";
import { verifyAdminCredentials } from "../auth";

describe("verifyAdminCredentials", () => {
  it("accepts the configured username/password", () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "hunter2";
    expect(verifyAdminCredentials("admin", "hunter2")).toBe(true);
  });
  it("rejects wrong password", () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "hunter2";
    expect(verifyAdminCredentials("admin", "nope")).toBe(false);
  });
  it("rejects wrong username", () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "hunter2";
    expect(verifyAdminCredentials("attacker", "hunter2")).toBe(false);
  });
  it("rejects when env not set", () => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    expect(verifyAdminCredentials("admin", "hunter2")).toBe(false);
  });
  it("uses constant-time comparison (no early-return on length mismatch)", () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "abcdef";
    expect(verifyAdminCredentials("admin", "abc")).toBe(false);
    expect(verifyAdminCredentials("admin", "abcdefghi")).toBe(false);
  });
});
