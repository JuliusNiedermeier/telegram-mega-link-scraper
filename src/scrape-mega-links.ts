import { launch } from "puppeteer";
import { readFile, access, writeFile } from "fs/promises";
import { Message, messagesPath, safely, safelySync } from "./utils";
import { resolve } from "path";
import { cwd } from "node:process";

const megaLinksFilePath = resolve(cwd(), "data/mega-links.json");
const linkFilter = "https://link-should-start-with-this-domain.com";

type MegaLinkEntry = Message & {
  megaLinks: { href: string; text: string }[];
};

const main = async () => {
  const browser = await launch({ headless: false });
  try {
    const messagesString = await readFile(messagesPath, "utf-8");
    let messages = JSON.parse(messagesString) as Message[];

    const totalMessagesCount = messages.length;
    messages = messages.filter((message) => message.links[0]?.href.includes(linkFilter));
    console.log(`Extracted ${messages.length} links. Skipped ${totalMessagesCount - messages.length} other links.`);

    // Create mega file if not exists
    const { success: megaFileExists } = await safely(() => access(megaLinksFilePath));
    if (megaFileExists) {
      const megaFileString = await readFile(megaLinksFilePath, "utf-8");
      const megaLinks = JSON.parse(megaFileString) as MegaLinkEntry[];
      const originalMessagesCount = messages.length;
      messages = messages.filter((message) => !megaLinks.find((link) => link.ID === message.ID));
      console.log(`Skipped ${originalMessagesCount - messages.length} messages that alread have mega links.`);
    } else {
      await writeFile(megaLinksFilePath, JSON.stringify([]), "utf-8");
    }

    console.log(`Scraping mega links for ${messages.length} messages`);

    const parallelTabs = 10;

    while (messages.length) {
      const messageBatch = messages.slice(0, parallelTabs);
      messages = messages.slice(parallelTabs);

      const batchPages = await Promise.all(
        messageBatch.map(async (message) => ({ page: await browser.newPage(), message }))
      );

      browser.on("targetcreated", async (target) => {
        const page = await target.page();
        page?.close();
      });

      const links = await Promise.all(
        batchPages.map(async ({ page, message }) => {
          await page.goto(message.links[0].href, { waitUntil: "networkidle2" });

          const clickedUnlocker = await page.evaluate(async (searchText) => {
            const startedPollingAt = Date.now();
            while (Date.now() - startedPollingAt < 20_000) {
              await new Promise((r) => setTimeout(r, 1000));
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              while (walker.nextNode()) {
                const isMatch = walker.currentNode.textContent?.includes(searchText);
                if (isMatch) {
                  walker.currentNode.parentElement?.click();
                  return true;
                }
              }
            }
            return false;
          }, "Click");

          if (!clickedUnlocker) {
            page.close();
            console.log("Failed to click unlocker ->", message.textContent);
            return null;
          }

          const clickedNext = await page.evaluate(async (searchText) => {
            const startedPollingAt = Date.now();
            while (Date.now() - startedPollingAt < 60_000) {
              await new Promise((r) => setTimeout(r, 5_000));
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              while (walker.nextNode()) {
                const isMatch = walker.currentNode.textContent?.includes(searchText);
                if (isMatch) {
                  walker.currentNode.parentElement?.click();
                  return true;
                }
              }
            }
            return false;
          }, "Done");

          if (!clickedNext) {
            page.close();
            console.log("Failed to click next ->", message.textContent);
            return null;
          }

          // Wait for mega link page to load
          await new Promise((r) => setTimeout(r, 5000));

          const links = await page.$$eval("a", (a) => {
            return a.map((a) => ({ href: a.href, text: a.textContent }));
          });

          await page.close();

          const megaLinks = links.filter((link) => link.href.includes("https://mega.nz"));
          return { ...message, megaLinks };
        })
      );

      const solvedLinks = links.filter((link) => link) as NonNullable<(typeof links)[number]>[];

      // Save batch
      let existingData: typeof solvedLinks = [];

      const megaLinksFilePath = resolve(cwd(), "data/mega-links.json");
      const { success: megaFileExists } = await safely(() => access(megaLinksFilePath));

      if (megaFileExists) {
        const existingFileString = await readFile(megaLinksFilePath, "utf-8");
        const { data: existingFileData } = safelySync<typeof solvedLinks>(() => JSON.parse(existingFileString));
        existingData = existingFileData || [];
      }

      const mergedLinksData = [...existingData, ...solvedLinks];

      await writeFile(megaLinksFilePath, JSON.stringify(mergedLinksData), "utf-8");

      console.log(`Saved ${solvedLinks.length} new solved links`);

      // After everything is done for that batch
      browser.removeAllListeners("targetcreated");

      console.log("Next batch");
    }

    console.log("All links solved");
  } finally {
    browser.close();
  }
};

const retry = async () => {
  while (true) {
    try {
      await main();
    } catch (error) {
      console.log("Error. Restarting...");
    }
  }
};

retry();
