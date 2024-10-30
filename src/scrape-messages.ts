import { launch } from "puppeteer";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output, cwd } from "node:process";
import { writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { Message, messagesPath } from "./utils";

const prompt = async (question: string) => {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(question);
  rl.close();
  return answer;
};

const main = async () => {
  const browser = await launch({
    // args: ["--force-device-scale-factor=0.5"],
    headless: false,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });

  const page = await browser.newPage();
  page.setViewport({ height: 1000, width: 500 });
  await page.goto("https://web.telegram.org/a/");
  await page.evaluate(() => ((document.body.style as ElementCSSInlineStyle["style"] & { zoom: number }).zoom = 0.5));

  await prompt("Please navigate to the chat that should be scraped. When ready press enter.");

  const messageIDs = new Set<string>();

  const messages: Message[] = [];

  while (true) {
    // Get all visible message IDs (date descending / latest first)
    const visibleMessageIDs = await page.$$eval(".Message[data-message-id]", (messageElements) => {
      return messageElements
        .map((el) => el.getAttribute("data-message-id"))
        .filter((ID) => ID)
        .reverse() as string[];
    });

    // Get the id of the first unscraped message
    const firstUnknownMessageID =
      visibleMessageIDs.find((visibleMessageID) => !messageIDs.has(visibleMessageID)) || null;

    // Stop if now new messages are loaded
    if (firstUnknownMessageID === null) break;

    // scrape the first unknown message
    const message = await page.$eval(`.Message[data-message-id="${firstUnknownMessageID}"]`, async (messageEl) => {
      messageEl.scrollIntoView({ behavior: "instant", block: "end" });

      // Get image sources
      const images: Message["images"] = (
        await Promise.all(
          Array.from(messageEl.querySelectorAll("img")).map(async (img) => {
            const startedPollingAt = Date.now();
            while (Date.now() - startedPollingAt < 10_000) {
              if (img.src) return img.src;
              await new Promise((r) => setTimeout(r, 10));
            }
          })
        )
      ).filter((src) => src) as string[];

      // Get Message text
      const textContentEl = messageEl.querySelector(".text-content");
      if (!textContentEl) return null;

      // Get links
      const links = Array.from(textContentEl.querySelectorAll("a")).map((a) => ({
        text: a.textContent || "",
        href: a.href,
      }));

      // Get text content
      const textContent = textContentEl.textContent || "";
      return { textContent, links, images };
    });

    messageIDs.add(firstUnknownMessageID);
    if (message) messages.push({ ID: firstUnknownMessageID, ...message });
    console.log(messages.length, messages.at(-1)?.textContent);
  }

  console.log(`Successfully scraped ${messages.length} messages.`);

  await mkdir(resolve(cwd(), "data"), { recursive: true });

  await writeFile(messagesPath, JSON.stringify(messages), "utf-8");

  console.log(`Successfully saved data.`);
};

main();
