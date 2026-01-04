import { test, expect } from '@playwright/test';

test.describe('HID App', () => {
  test('should render the hid-app component', async ({ page }) => {
    await page.goto('/');
    const app = page.locator('hid-app');
    await expect(app).toBeVisible();
  });

  test('page should have correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/The Learning Tablet/);
  });

  test('should display homepage on initial load', async ({ page }) => {
    await page.goto('/');
    const homepage = page.locator('hid-homepage');
    await expect(homepage).toBeVisible();
  });

  test('should display Load Configuration option', async ({ page }) => {
    await page.goto('/');
    const loadHeading = page.getByText('Load Configuration');
    await expect(loadHeading).toBeVisible();
  });

  test('should display Create New Configuration option', async ({ page }) => {
    await page.goto('/');
    const createHeading = page.getByText('Create New Configuration');
    await expect(createHeading).toBeVisible();
  });

  test('should have Start Walkthrough button', async ({ page }) => {
    await page.goto('/');
    const walkthroughButton = page.getByRole('button', { name: /Start Walkthrough/i });
    await expect(walkthroughButton).toBeVisible();
  });

  test('should navigate to walkthrough when clicking Start Walkthrough', async ({ page }) => {
    await page.goto('/');
    
    // Click the Start Walkthrough button
    await page.click('button:has-text("Start Walkthrough")');
    
    // Should now see the hid-data-reader component
    const dataReader = page.locator('hid-data-reader');
    await expect(dataReader).toBeVisible();
    
    // Should see step 1 of the walkthrough
    const stepHeading = page.getByText('Step 1: Horizontal Movement');
    await expect(stepHeading).toBeVisible();
  });

  test('should have back button on walkthrough page', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to walkthrough
    await page.click('button:has-text("Start Walkthrough")');
    
    // Should see back button
    const backButton = page.getByRole('button', { name: /Back to Home/i });
    await expect(backButton).toBeVisible();
  });

  test('should navigate back to homepage when clicking back button', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to walkthrough
    await page.click('button:has-text("Start Walkthrough")');
    
    // Click back button
    await page.click('button:has-text("Back to Home")');
    
    // Should see homepage again
    const homepage = page.locator('hid-homepage');
    await expect(homepage).toBeVisible();
  });
});
