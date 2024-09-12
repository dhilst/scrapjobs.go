import fs from 'fs';
import puppeteer from 'puppeteer';
// Or import puppeteer from 'puppeteer-core';

// A JSON file containing a list of links of jobs to scrap
const linksFile = process.argv[2];
const tags = process.argv.slice(3) || [];

async function getData(broser, url) {
  if (linksFile.includes("rustjobs"))
    return getDataRustjobs(browser, url);
  else if (linksFile.includes("indeed"))
    return getIndeed(browser, url);
  else if (linksFile.includes("golangprojects"))
    return getGoLangProjects(browser, url);
  else if (linksFile.includes("functionalworks"))
    return getFunctionalWorks(browser, url);
  else if (linksFile.includes("jooble"))
    return getJooble(browser, url);

  throw `Don't know how to scrap ${linksFile}`
}

async function getGoLangProjects(browser, url) {
  console.log(url)
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

async function getDataRustjobs(browser, url) {
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
// /html/body/div[1]/div[2]/div[2]/div/div[1]/div[2]
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1024});
  await page.goto(url);
  const title = await page.waitForSelector("h1").then(h1 => page.evaluate(e => e.textContent, h1));
  let descrip = await page.$$eval("xpath/html/body/div[1]/div[2]/div[2]/div/div[1]/div[2]", elements => elements.map(x => x.textContent).join("\n"))

  return {title, descrip, url, tags}
}

async function getJooble(browser, url) {
// /html/body/div[1]/div[2]/div[2]/div/div[1]/div[2]
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1024});
  await page.goto(url);
  const title = await page.waitForSelector("h1").then(h1 => page.evaluate(e => e.textContent, h1));
  let descrip = await page.$$eval("xpath/html/body/div/div/div[1]/div/div[1]/main/div[1]/div[2]/div[1]/div[2]/div/div/div/div[2]/div/div", elements => elements.map(x => x.textContent).join("\n"))

  return {title, descrip, url, tags}
}

var links = JSON.parse(fs.readFileSync(linksFile, 'utf8'));
const browser = await puppeteer.launch({headless: false});
const results = await Promise.all(links.slice(0, 1).map(link => getData(browser, link)));

for (let result of results) {
  let {title, descrip, url} = result;
  title = title.replaceAll(/[ \/]/g, "_");
  const path = `./output/${title}.json`;

  fs.writeFileSync(path, JSON.stringify(result, null, 2));
  console.log(`${path} written`);
}


// await browser.close()
