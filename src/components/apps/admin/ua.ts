/**
 * A User-Agent string in a few words ("Firefox 142 · Windows 10/11",
 * "Safari 18 · iPhone, iOS 18.6"), for the sender details in Mail. Scripts
 * name themselves (curl, python-requests…) and say so.
 */

const TOOLS =
  /\b(curl|wget|python-requests|python-urllib|aiohttp|httpx|go-http-client|okhttp|java|node-fetch|axios|undici|libwww-perl|php|ruby|postman|insomnia|headlesschrome|phantomjs|selenium|puppeteer|playwright|scrapy|bot|crawler|spider)\b/i;

const v = (ua: string, re: RegExp) => ua.match(re)?.[1]?.replace(/_/g, ".");
const major = (s?: string) => s?.split(".")[0];

export function describeUa(ua: string): { text: string; script: boolean } {
  const tool = ua.match(TOOLS)?.[1];
  const browser =
    (v(ua, /Edg(?:e|A|iOS)?\/([\d.]+)/) && `Edge ${major(v(ua, /Edg(?:e|A|iOS)?\/([\d.]+)/))}`) ||
    (v(ua, /OPR\/([\d.]+)/) && `Opera ${major(v(ua, /OPR\/([\d.]+)/))}`) ||
    (v(ua, /SamsungBrowser\/([\d.]+)/) && `Samsung Internet ${major(v(ua, /SamsungBrowser\/([\d.]+)/))}`) ||
    (v(ua, /Vivaldi\/([\d.]+)/) && `Vivaldi ${major(v(ua, /Vivaldi\/([\d.]+)/))}`) ||
    (v(ua, /(?:Firefox|FxiOS)\/([\d.]+)/) && `Firefox ${major(v(ua, /(?:Firefox|FxiOS)\/([\d.]+)/))}`) ||
    (v(ua, /HeadlessChrome\/([\d.]+)/) && `Headless Chrome ${major(v(ua, /HeadlessChrome\/([\d.]+)/))}`) ||
    (v(ua, /(?:Chrome|CriOS)\/([\d.]+)/) && `Chrome ${major(v(ua, /(?:Chrome|CriOS)\/([\d.]+)/))}`) ||
    (/Safari\//.test(ua) && v(ua, /Version\/([\d.]+)/) && `Safari ${major(v(ua, /Version\/([\d.]+)/))}`) ||
    undefined;
  const os =
    (/iPhone/.test(ua) && `iPhone, iOS ${v(ua, /OS ([\d_]+)/) ?? ""}`.trim()) ||
    (/iPad/.test(ua) && `iPad, iPadOS ${v(ua, /OS ([\d_]+)/) ?? ""}`.trim()) ||
    (/Android/.test(ua) && [`Android ${v(ua, /Android ([\d.]+)/) ?? ""}`.trim(), ua.match(/Android [\d.]+; (?:[a-z]{2}-[a-z]{2}; )?([^;)]+?)(?: Build|\))/i)?.[1]].filter((x) => x && x !== "K").join(", ")) ||
    (/CrOS/.test(ua) && "ChromeOS") ||
    (/Mac OS X/.test(ua) && "macOS") ||
    (/Windows NT 10/.test(ua) && "Windows 10/11") ||
    (/Windows NT ([\d.]+)/.test(ua) && `Windows NT ${v(ua, /Windows NT ([\d.]+)/)}`) ||
    (/Linux/.test(ua) && "Linux") ||
    undefined;
  const script = Boolean(tool) && !(browser && !/headless|bot|crawler|spider|selenium|puppeteer|playwright/i.test(tool!));
  const text = [script ? tool : browser, os].filter(Boolean).join(" · ") || ua.slice(0, 60);
  return { text, script };
}
