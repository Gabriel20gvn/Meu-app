import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './e2e',
 use: { baseURL: process.env.COMPASSO_TEST_URL || 'http://127.0.0.1:5173', viewport: {width:390,height:844}, launchOptions: process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH, args:['--no-sandbox']} : {} },
 webServer: process.env.COMPASSO_TEST_URL ? undefined : {command:'npm run dev -- --port 5173',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI},
});
