import { PuppeteerLaunchOptions, launch } from "puppeteer";
import { safely } from "../utils";
import { resolve } from "path";
import { access, rm } from "fs/promises";
import { cwd } from "process";

export const userDataDir = resolve(cwd(), "tmp/user-data");
export const telegramHomeURL = "https://web.telegram.org/a/";

const getNewAuthSession = async () => {
  const browser = await launch({ headless: false, userDataDir });
  const page = await browser.newPage();
  await page.goto(telegramHomeURL, { waitUntil: "networkidle2" });

  const success = await new Promise<boolean>((resolve) => {
    const safeResolve = (success: boolean) => {
      clearInterval(interval);
      clearTimeout(timeout);
      resolve(success);
    };

    const interval = setInterval(async () => {
      const storageDump = await page.evaluate(
        () => Object.assign({}, localStorage) as Record<string, string>
      );
      if (storageDump["user_auth"]) safeResolve(true);
    }, 1000);

    const timeout = setTimeout(() => safeResolve(false), 60 * 1000);
  });

  await browser.close();

  if (!success) await rm(userDataDir, { force: true, recursive: true });
  return success;
};

export const getAuthenticatedBrowser = async (
  options?: PuppeteerLaunchOptions
) => {
  const { success: userDataDirExists } = await safely(() =>
    access(userDataDir)
  );
  if (!userDataDirExists) {
    const createdNewAuthSession = await getNewAuthSession();
    if (!createdNewAuthSession) return null;
  }

  return await launch({ userDataDir, ...options });
};
