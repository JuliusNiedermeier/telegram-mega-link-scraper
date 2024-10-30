import { PuppeteerLaunchOptions, launch } from "puppeteer";
import { redis } from "../services/redis";
import { safely } from "../utils";

const redisAuthSessionKey = "auth-session";

type AuthSession = Record<string, string>;

const getNewAuthSession = async () => {
  const browser = await launch({ headless: false });
  const page = await browser.newPage();

  await page.goto("https://web.telegram.org/k/", { waitUntil: "networkidle2" });

  const authSession = await new Promise<AuthSession | null>((resolve) => {
    const safeResolve = (data: AuthSession | null) => {
      clearInterval(interval);
      clearTimeout(timeout);
      resolve(data);
    };

    const interval = setInterval(async () => {
      const storageDump = await page.evaluate(
        () => Object.assign({}, localStorage) as Record<string, string>
      );
      if (storageDump["user_auth"]) safeResolve(storageDump);
    }, 1000);

    const timeout = setTimeout(() => safeResolve(null), 60 * 1000);
  });

  await browser.close();

  return authSession;
};

export const getAuthenticatedBrowser = async (
  options?: PuppeteerLaunchOptions
) => {
  const { data: cachedAuthSession } = await safely(async () => {
    const cachedAuthSessionString = await redis.get(redisAuthSessionKey);
    if (!cachedAuthSessionString) throw new Error();
    return JSON.parse(cachedAuthSessionString) as AuthSession;
  });

  const authSession = cachedAuthSession || (await getNewAuthSession());

  if (!authSession) return null;

  if (!cachedAuthSession) {
    await redis.set(redisAuthSessionKey, JSON.stringify(authSession));
  }

  // Fill browser local storage with auth session
  const browser = await launch(options);
  const page = await browser.newPage();

  await page.goto("https://web.telegram.org/k/", { waitUntil: "networkidle2" });

  await page.evaluate((authSession) => {
    Object.keys(authSession).forEach((key) => {
      localStorage.setItem(key, authSession[key]);
    });
  }, authSession);

  await page.reload({ waitUntil: "networkidle2" });

  return page;
};
