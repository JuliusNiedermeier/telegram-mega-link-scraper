import { Page } from "puppeteer";
import { retry } from "../utils";

export const getAuthImage = async (page: Page) => {
  return await retry(async () => {
    const canvasHandle = await page.$(".auth-image > canvas");
    if (!canvasHandle) throw new Error();
    const dataURL = await canvasHandle.evaluate((el) =>
      el.toDataURL("image/png")
    );
    const response = await fetch(dataURL);
    return await response.arrayBuffer();
  });
};
