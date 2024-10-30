import { resolve } from "path";
import { cwd } from "node:process";

export const retry = async <T>(
  fn: (retry: number) => T,
  options?: {
    retries?: number;
    interval?: number;
    onError?: (error: unknown) => any;
  }
) => {
  for (let i = 0; i < (options?.retries ?? 10); i++) {
    try {
      return await fn(i);
    } catch (error) {
      options?.onError?.(error);
    } finally {
      await new Promise((r) => setTimeout(r, options?.interval ?? 1000));
    }
  }
};

type SafelySuccess<T> = {
  success: true;
  data: T;
  error: null;
};

type SafelyError = {
  success: false;
  data: null;
  error: unknown;
};

export const safely = async <T>(fn: () => T): Promise<SafelySuccess<Awaited<T>> | SafelyError> => {
  try {
    const data = await fn();
    return { data, error: null, success: true };
  } catch (error) {
    return { data: null, error, success: false };
  }
};

export const safelySync = <T>(fn: () => T): SafelySuccess<T> | SafelyError => {
  try {
    const data = fn();
    return { data, error: null, success: true };
  } catch (error) {
    return { data: null, error, success: false };
  }
};

export type Message = {
  ID: string;
  textContent: string;
  links: { text: string; href: string }[];
  images: string[];
};

export const messagesPath = resolve(cwd(), "data/messages.json");
