# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: happy.spec.ts >> login form accepts good credentials and lands on dashboard
- Location: e2e/happy.spec.ts:16:1

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected: "http://localhost:3000/"
Received: "http://localhost:3000/login"
Timeout:  5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    9 × unexpected value "http://localhost:3000/login"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e3]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]: U
        - generic [ref=e8]: Utter
      - heading "Welcome back." [level=1] [ref=e9]
      - paragraph [ref=e10]: Admin sign-in.
      - generic [ref=e11]:
        - generic [ref=e12]: Username
        - textbox "Username" [ref=e13]: admin
      - generic [ref=e14]:
        - generic [ref=e15]: Password
        - textbox "Password" [ref=e16]: hunter2
      - button "Sign in" [ref=e17] [cursor=pointer]
      - paragraph [ref=e18]: Press ↩ to submit.
  - status [ref=e19]:
    - generic [ref=e20]:
      - img [ref=e22]
      - generic [ref=e24]:
        - text: Static route
        - button "Hide static indicator" [ref=e25] [cursor=pointer]:
          - img [ref=e26]
  - alert [ref=e29]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test("login redirects unauthenticated users", async ({ page }) => {
  4  |   await page.goto("/");
  5  |   await expect(page).toHaveURL(/\/login/);
  6  | });
  7  | 
  8  | test("login form rejects bad credentials", async ({ page }) => {
  9  |   await page.goto("/login");
  10 |   await page.getByLabel("Username", { exact: false }).fill("admin");
  11 |   await page.getByLabel("Password", { exact: false }).fill("nope");
  12 |   await page.getByRole("button", { name: /sign in/i }).click();
  13 |   await expect(page.getByText(/Invalid credentials/i)).toBeVisible();
  14 | });
  15 | 
  16 | test("login form accepts good credentials and lands on dashboard", async ({ page }) => {
  17 |   await page.goto("/login");
  18 |   await page.getByLabel("Username", { exact: false }).fill("admin");
  19 |   await page.getByLabel("Password", { exact: false }).fill("hunter2");
  20 |   await page.getByRole("button", { name: /sign in/i }).click();
> 21 |   await expect(page).toHaveURL("/");
     |                      ^ Error: expect(page).toHaveURL(expected) failed
  22 |   await expect(page.getByRole("heading", { name: "Recordings" })).toBeVisible();
  23 | });
  24 | 
```