import { test, expect } from "@playwright/test";

test("login redirects unauthenticated users", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("login form rejects bad credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: false }).fill("admin");
  await page.getByLabel("Password", { exact: false }).fill("nope");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/Invalid credentials/i)).toBeVisible();
});

test("login form accepts good credentials and lands on dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: false }).fill("admin");
  await page.getByLabel("Password", { exact: false }).fill("hunter2");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Recordings" })).toBeVisible();
});
