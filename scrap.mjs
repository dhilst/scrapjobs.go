import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
// Or import puppeteer from 'puppeteer-core';

// javascript 🤤
Object.prototype.dedup = function() {
  return Array.from(new Set(this));
}

Object.prototype.toa = function() {
  return Array.from(this);
}

// A JSON file containing a list of links of jobs to scrap
const command = process.argv[2]; // "downloadJobs" "getLinks"

(async function main() {
  switch (command) {
  // step 1, get the links to scrap
  case "getLinks":
    await getLinksCommand();
    break;
  // step 2, download the vacancies
  case "downloadJobs":
    await downloadJobsCommand();
    break;
  default: 
    console.error(`ERROR: Invalid command ${command}, expecting downloadJobs, getLinks`);
    process.exit(-1);
    break;
  }
})()

async function downloadJobsCommand() {
  try {
    const data = await fs.readFile('/dev/stdin');
    var links = JSON.parse(data);
    const browser = await puppeteer.launch({headless: false});
    let results = [];
    const BATCH_SIZE = 10;
    for (var i = 0; i < links.length; i += BATCH_SIZE) {
      const batch = links.slice(i, i+BATCH_SIZE)
      results.push(...await Promise.all(
        batch.map(link => 
          // return null in case of error
          getData(browser, link).catch(e => {
            console.error("Scrapper failed", e);
            return null
          })
        )))
    }
    // Remove nulls from the failed scrappers
    results = results.filter(x => x !== null)

    // Output all the results as a big JSON
    console.log(JSON.stringify(results, null, 2));

    await browser.close();
  } catch (e) {
    console.error("ERROR", e)
  }
}

async function getLinksCommand() {
  const browser = await puppeteer.launch({headless: false});
  let links = [];
  switch (process.argv[3]) {
  case "golangprojects":
    links = await getLinksGolangprojects(browser);
    break;
  case "rustjobs":
    links = await getLinksRustjobs(browser);
    break;
  case "indeed":
    links = await getLinksIndeed(browser);
    break;
  case "functionalworks":
    links = await getLinksFunctionalworks(browser);
    break;
  case "web3career":
    links = await getLinksWeb3Career(browser);
    break;
  case undefined:
    const commands = {
      "golangprojects": getLinksGolangprojects,
      "rustjobs": getLinksRustjobs,
      "indeed": getLinksIndeed,
      "functionalworkds": getLinksFunctionalworks,
    };

    links = await Promise.allSettled(
        Object.values(commands)
            .map(scrapper => scrapper(browser))
      )
      .then(linksNested => linksNested.map(p => p.status === "fulfilled" ? p.value : null).filter(Boolean).flat().dedup());

    break;
  default:
    console.error(`Unknown links command ${process.argv[3]}`);
    break;
  }

  // Outputs the links to the stdout so other step can read it
  console.log(JSON.stringify(links, null, 2));

  await browser.close();
}

/**
 * Get links scrappers
 */
async function getLinksGeneric(url, linksFilter, browser) {
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1024});
  await page.goto(url, { waitUntil: "networkidle0" });
  let links = await page.$$eval("a", as =>
    as.map(a => a.href));
  links = links.filter(link => link.startsWith(linksFilter));
  return links;
}

/**
 * Donwload data scrappers
 */
async function getLinksGolangprojects(browser) {
  const url = "https://www.golangprojects.com/golang-remote-jobs.html";
  const linksFilter = "https://www.golangprojects.com/golang-go-job";
  const links = await getLinksGeneric(url, linksFilter, browser);
  return links;
}

async function getLinksRustjobs(browser) {
  const url = "https://rustjobs.dev/locations/remote/";
  const linksFilter = "https://rustjobs.dev/featured-jobs/";
  const links = await getLinksGeneric(url, linksFilter, browser);
  return links;
}

async function getLinksIndeed(browser) {
  const url = (start) => `https://www.indeed.com/jobs?q=backend+developer&l=remote&start=${start}&pp=gQAPAAAAAAAAAAAAAAACMzlOkgAiAQEBBgId8f7_aNT8YvuqBA-6cRMlcbAro5qS6EZtGNYXOgAA`;
  const linksFilter = "https://www.indeed.com/rc/";
  // download the first 5 pages
  const urls = Array(5).keys().toa().map(x => url(x * 10));
  const links = await Promise.all(
    urls.map(url => getLinksGeneric(url, linksFilter, browser)));
  return links.flat().dedup();
}

async function getLinksFunctionalworks(browser) {
  //https://functional.works-hub.com/jobs/search?page=4&remote=true
  const url = (start) => `https://functional.works-hub.com/jobs/search?page=${start}&remote=true`;
  const linksFilter = "https://functional.works-hub.com/jobs/remote-";
  // download the first 5 pages
  const links = await getLinksGeneric(url(4), linksFilter, browser);
  return links;
}

async function getLinksWeb3Career(browser) {
  const url = "https://web3.career/remote-jobs";
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1024});
  await page.goto(url, { waitUntil: "networkidle0" });
  let links = await page.$$eval("a[data-jobid]", as =>
    as.map(a => a.href));
  links = links.filter(link => /https:\/\/web3.career\/[^\/]+\/\d+$/.test(link)).dedup()
  return links;
}

async function getData(browser, url) {
  if (url.includes("rustjobs"))
    return getRustjobs(browser, url);
  else if (url.includes("indeed"))
    return getIndeed(browser, url);
  else if (url.includes("golangprojects"))
    return getGoLangProjects(browser, url);
  else if (url.startsWith("https://functional.works-hub.com"))
    return getFunctionalWorks(browser, url);
  else if (url.includes("jooble"))
    return getJooble(browser, url);
  else if (url.includes("web3.career"))
    return getWeb3Career(browser, url);

  console.error(`Don't know how to scrap ${linksFile}`)
}

async function getGoLangProjects(browser, url) {
  const tags = ["go", "golangprojects"];
  // Navigate the page to a URL.
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1024});
  await page.goto(url);
  //
  const title = await page.waitForSelector("h1")
    .then(h1 => page.evaluate(e => e.textContent, h1));
  let descrip = await page.locator('xpath/html/body/div/div[1]/div[1]')
      .waitHandle()
      .then(div =>
        page.evaluate(e => e.textContent, div));
  await page.close();
  return {title, descrip, url, tags}
}

async function getRustjobs(browser, url) {
  const tags = ["rust", "rustjobs"];
  // Navigate the page to a URL.
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1024});
  await page.goto(url);
  //
  const title = await page.waitForSelector("h1").then(h1 => page.evaluate(e => e.textContent, h1));
  const descrip = await page.$$eval(".markdown-component p", elements => elements.map(x => x.textContent).join("\n"))
  await page.close();
  return {title, descrip, url, tags}
}

async function getIndeed(browser, url) {
  const tags = ["indeed"];
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1024});
  await page.goto(url);

  let title = await page.waitForSelector("h1").then(h1 => page.evaluate(e => e.textContent, h1));
  if (title === "Additional Verification Required") {
    await page.close();
    throw Error("skipping captcha")
  }
  // Get the right class
  title = await page.waitForSelector(".jobsearch-JobInfoHeader-title")
    .then(h1 => page.evaluate(e => e.textContent, h1));
  let descrip = await page.$$eval("#jobDescriptionText p", elements => elements.map(x => x.textContent).join("\n"))

  if (!descrip) {
    descrip = await page.$$eval(".jobsearch-BodyContainer", elements =>
      elements.map(x => x.textContent).join("\n"))
  }
  await page.close();
  return {title, descrip, url, tags}
}

async function getFunctionalWorks(browser, url) {
  const tags = ["functionalworks"];
// /html/body/div[1]/div[2]/div[2]/div/div[1]/div[2]
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1024});
  await page.goto(url);
  const title = await page.waitForSelector("h1").then(h1 => page.evaluate(e => e.textContent, h1));
  let descrip = await page.$$eval("xpath/html/body/div[1]/div[2]/div[2]/div/div[1]/div[2]",
    elements => elements.map(x => x.textContent).join("\n"))
  let remote = await page.$$eval("xpath/html/body/div[1]/div[2]/div[2]/div/div[1]/div[1]/div/div[2]/div[3]/div[1]/div",
    elements => elements.map(x => x.textContent).join("\n").replace(/remote (within)?/i, "").trim())

  await page.close();
  return {title, descrip, url, tags, metadata: { remote }}
}

async function getJooble(browser, url) {
  const tags = ["jooble"];
// /html/body/div[1]/div[2]/div[2]/div/div[1]/div[2]
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1024});
  await page.goto(url);
  const title = await page.waitForSelector("h1").then(h1 => page.evaluate(e => e.textContent, h1));
  let descrip = await page.$$eval("xpath/html/body/div/div/div[1]/div/div[1]/main/div[1]/div[2]/div[1]/div[2]/div/div/div/div[2]/div/div", elements => elements.map(x => x.textContent).join("\n"))

  await page.close();
  return {title, descrip, url, tags}
}

async function getWeb3Career(browser, url) {
  const tags = ["web3career"];
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1024});
  await page.goto(url, { waitUntil: "networkidle0" });
  const title = await page.$eval("h1", h1 => h1.textContent.trim());
  const descrip = await page.$eval("#job", job => job.textContent.trim());
  const location = await page.$eval("html.h-100 body.d-flex.flex-column.h-100 main.flex-shrink-0 div.mx-auto.px-md-3.mt-1.mt-md-4 turbo-frame#job div.p-2.p-md-0.main-border-sides-job div.row.gap-.px-1.px-md-5.py-1.py-md-5 div.col-12.col-md-4.my-4.my-md-0 div.border.border-primary.p-3.text-center.mysticky div div.mt-3 p", p => p.textContent.trim().replace("Location: ", ""));
  let metadata = {};
  if (location.startsWith("Remote")) {
    metadata["remote"] = location.replace("Remote", "").trim() || "worldwide";
  } else {
    metadata["remote"] = location;
  }
  await page.close();
  return {title, descrip, url, tags, metadata};
}
