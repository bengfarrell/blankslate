import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('HID Data Reader Walkthrough', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Navigate from homepage to walkthrough
    await page.click('button:has-text("Start Walkthrough")');
    // Wait for the component to be ready
    await page.waitForSelector('hid-data-reader');
  });

  test('should complete full walkthrough and generate correct configuration', async ({ page }) => {
    // Helper function to get component property
    const getComponentProperty = async (propertyName: string) => {
      return await page.evaluate((prop) => {
        const component = document.querySelector('hid-data-reader') as any;
        return component[prop];
      }, propertyName);
    };

    // Wait for step 1 to be active
    await expect(page.locator('.walkthrough.active h3').first()).toContainText('Step 1: Horizontal Movement');

    // Step 1: Horizontal Movement (X coordinate)
    await page.click('button:has-text("🤖 Simulate Input")');
    await page.waitForTimeout(2000); // Wait for gesture to complete
    await page.click('button:has-text("✓ Done - Next Step")');

    // Verify X coordinate bytes are detected (bytes 2-3, indices 1-2)
    const horizontalBytes = await getComponentProperty('horizontalBytes');
    expect(horizontalBytes.map((b: any) => b.byteIndex)).toEqual([1, 2]);

    // Step 2: Vertical Movement (Y coordinate)
    await expect(page.locator('.walkthrough.active h3').first()).toContainText('Step 2: Vertical Movement');
    await page.click('button:has-text("🤖 Simulate Input")');
    await page.waitForTimeout(2000);
    await page.click('button:has-text("✓ Done - Next Step")');

    // Verify Y coordinate bytes are detected (bytes 4-5, indices 3-4)
    const verticalBytes = await getComponentProperty('verticalBytes');
    expect(verticalBytes.map((b: any) => b.byteIndex)).toEqual([3, 4]);

    // Step 3: Pressure
    await expect(page.locator('.walkthrough.active h3').first()).toContainText('Step 3: Pressure Detection');
    await page.click('button:has-text("🤖 Simulate Input")');
    await page.waitForTimeout(2000);
    await page.click('button:has-text("✓ Done - Next Step")');

    // Verify pressure bytes are detected (bytes 6-7, indices 5-6)
    const pressureBytes = await getComponentProperty('pressureBytes');
    expect(pressureBytes.map((b: any) => b.byteIndex)).toEqual([5, 6]);

    // Step 4: Hover Horizontal
    await expect(page.locator('.walkthrough.active h3').first()).toContainText('Step 4: Hover Horizontal Movement');
    await page.click('button:has-text("🤖 Simulate Input")');
    await page.waitForTimeout(2000);
    await page.click('button:has-text("✓ Done - Next Step")');

    // Step 5: Hover Vertical
    await expect(page.locator('.walkthrough.active h3').first()).toContainText('Step 5: Hover Vertical Movement');
    await page.click('button:has-text("🤖 Simulate Input")');
    await page.waitForTimeout(2000);
    await page.click('button:has-text("✓ Done - Next Step")');

    // Step 6: Tilt X
    await expect(page.locator('.walkthrough.active h3').first()).toContainText('Step 6: Tilt X Detection');
    await page.click('button:has-text("🤖 Simulate Input")');
    await page.waitForTimeout(2000);
    await page.click('button:has-text("✓ Done - Next Step")');

    // Verify tilt X byte is detected (byte 8, index 7)
    const tiltXBytes = await getComponentProperty('tiltXBytes');
    expect(tiltXBytes.map((b: any) => b.byteIndex)).toEqual([7]);

    // Step 7: Tilt Y
    await expect(page.locator('.walkthrough.active h3').first()).toContainText('Step 7: Tilt Y Detection');
    await page.click('button:has-text("🤖 Simulate Input")');
    await page.waitForTimeout(2000);
    await page.click('button:has-text("✓ Done - Next Step")');

    // Verify tilt Y byte is detected (byte 9, index 8)
    const tiltYBytes = await getComponentProperty('tiltYBytes');
    expect(tiltYBytes.map((b: any) => b.byteIndex)).toEqual([8]);

    // Step 8: Primary Button
    await expect(page.locator('.walkthrough.active h3').first()).toContainText('Step 8: Primary Button Detection');
    await page.click('button:has-text("🤖 Simulate Input")');
    await page.waitForTimeout(1000);
    await page.click('button:has-text("✓ Done - Next Step")');

    // Step 9: Secondary Button
    await expect(page.locator('.walkthrough.active h3').first()).toContainText('Step 9: Secondary Button Detection');
    await page.click('button:has-text("🤖 Simulate Input")');
    await page.waitForTimeout(1000);
    await page.click('button:has-text("✓ Done - Next Step")');

    // Wait for completion
    await expect(page.locator('.section.complete h3').first()).toContainText('✅ Analysis Complete!');

    // Get the generated configuration from the component's deviceConfig property
    const generatedConfig = await page.evaluate(() => {
      const component = document.querySelector('hid-data-reader') as any;
      return component.deviceConfig;
    });

    // Load expected configuration
    const expectedConfigPath = path.join(process.cwd(), 'public/exampleconfigurations/xp_pen_deco_640_osx_nodriver.json');
    const expectedConfig = JSON.parse(fs.readFileSync(expectedConfigPath, 'utf-8'));

    // Verify key byte mappings match expected configuration
    expect(generatedConfig.x.byteIndex).toEqual([2, 3]);
    expect(generatedConfig.y.byteIndex).toEqual([4, 5]);
    expect(generatedConfig.pressure.byteIndex).toEqual([6, 7]);
    expect(generatedConfig.tiltX.byteIndex).toEqual([8]);
    expect(generatedConfig.tiltY.byteIndex).toEqual([9]);

    // Verify types match
    expect(generatedConfig.x.type).toBe('multi-byte-range');
    expect(generatedConfig.y.type).toBe('multi-byte-range');
    expect(generatedConfig.pressure.type).toBe('multi-byte-range');

    // Verify status byte
    expect(generatedConfig.status.byteIndex).toEqual([1]);
    expect(generatedConfig.status.type).toBe('code');

    // Verify status byte values are captured
    expect(generatedConfig.status.values).toBeDefined();
    expect(Object.keys(generatedConfig.status.values).length).toBeGreaterThan(0);

    // Verify that status values have the expected structure
    const statusValues = Object.values(generatedConfig.status.values);
    expect(statusValues.length).toBeGreaterThan(0);
    statusValues.forEach((value: any) => {
      expect(value).toHaveProperty('state');
      expect(['none', 'hover', 'contact', 'buttons']).toContain(value.state);
    });
  });
});

