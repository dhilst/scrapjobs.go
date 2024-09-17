import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
// Or import puppeteer from 'puppeteer-core';

// javascript 🤤
Object.prototype.dedup = function() {
  return Array.from(new Set(this));
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
    const results = await Promise.all(links.slice(0).map(link => getData(browser, link)));
    let outputs = [];

    for (let result of results) {
      let {title, descrip, url} = result;
      title = title.replaceAll(/[ \/]/g, "_");
      const jsonPath = path.resolve(`./output/${title}.json`);
      await fs.writeFile(jsonPath, JSON.stringify(result, null, 2));
      outputs.push(jsonPath)
    }

    await browser.close()

    console.log(JSON.stringify(outputs, null, 2));
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
    link = await getLinksRustjobs(browser);
    break;
  case undefined:
    const commands = {
      "golangprojects": getLinksGolangprojects,
      "rustjobs": getLinksRustjobs,
    };

    links = await Promise.all(
        Object.values(commands)
            .map(scrapper => scrapper(browser))
      )
      .then(linksNested => linksNested.flat().dedup());

    break;
  default:
    console.error(`Unknown links command ${process.argv[3]}`);
    break;
  }

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

async function getData(browser, url) {
  const linksFile = process.argv[3] || url;
  if (linksFile.includes("rustjobs"))
    return getRustjobs(browser, url);
  else if (linksFile.includes("indeed"))
    return getIndeed(browser, url);
  else if (linksFile.includes("golangprojects"))
    return getGoLangProjects(browser, url);
  else if (linksFile.includes("functionalworks"))
    return getFunctionalWorks(browser, url);
  else if (linksFile.includes("jooble"))
    return getJooble(browser, url);

  throw new Error(`Don't know how to scrap ${linksFile}`)
}

async function getGoLangProjects(browser, url) {
  const tags = process.argv.slice(4) || [];
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
  return {title, descrip, url, tags}
}

async function getRustjobs(browser, url) {
  const tags = process.argv.slice(4) || [];
  // Navigate the page to a URL.
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1024});
  await page.goto(url);
  //
  const title = await page.waitForSelector("h1").then(h1 => page.evaluate(e => e.textContent, h1));
  const descrip = await page.$$eval(".markdown-component p", elements => elements.map(x => x.textContent).join("\n"))
  return {title, descrip, url, tags}
}

async function getIndeed(broswer, url) {
  const tags = process.argv.slice(4) || [];
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1024});
  await page.goto(url);
  const title = await page.waitForSelector(".jobsearch-JobInfoHeader-title").then(h1 => page.evaluate(e => e.textContent, h1));
  let descrip = await page.$$eval("#jobDescriptionText p", elements => elements.map(x => x.textContent).join("\n"))

  if (!descrip) {
    descrip = await page.$$eval(".jobsearch-BodyContainer", elements =>
      elements.map(x => x.textContent).join("\n"))
  }
  return {title, descrip, url, tags}
}

async function getFunctionalWorks(browser, url) {
  const tags = process.argv.slice(4) || [];
// /html/body/div[1]/div[2]/div[2]/div/div[1]/div[2]
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1024});
  await page.goto(url);
  const title = await page.waitForSelector("h1").then(h1 => page.evaluate(e => e.textContent, h1));
  let descrip = await page.$$eval("xpath/html/body/div[1]/div[2]/div[2]/div/div[1]/div[2]", elements => elements.map(x => x.textContent).join("\n"))

  return {title, descrip, url, tags}
}

async function getJooble(browser, url) {
  const tags = process.argv.slice(4) || [];
// /html/body/div[1]/div[2]/div[2]/div/div[1]/div[2]
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1024});
  await page.goto(url);
  const title = await page.waitForSelector("h1").then(h1 => page.evaluate(e => e.textContent, h1));
  let descrip = await page.$$eval("xpath/html/body/div/div/div[1]/div/div[1]/main/div[1]/div[2]/div[1]/div[2]/div/div/div/div[2]/div/div", elements => elements.map(x => x.textContent).join("\n"))

  return {title, descrip, url, tags}
}
