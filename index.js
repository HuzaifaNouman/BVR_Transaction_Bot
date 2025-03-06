import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import dotenv from "dotenv";
import { parse, stringify } from "csv/sync";

dotenv.config();
puppeteer.use(StealthPlugin());

const targetUrl = "https://www.searchfunder.com/bvr/search";
const email = process.env.EMAIL;
const password = process.env.PASSWORD;
const csvFilePath = "extracted_data.csv";

// List of NAICS codes
const naicsCodes = [
    "112512",
    "111422",
    "113210",
    "111332",
    "111992",
    "111219",
    "112511",
    "111334",
    "111991",
    "112120",
    "112210",
    "111150",
    "113310",
    "111310",
    "111335",
    "112130",
    "112920",
    "111130",
    "111336",
    "111940",
    "212319",
    "221112",
    "221320",
    "236117",
    "211120",
    "236210",
    "212322",
    "212392",
    "212299",
    "212321",
    "237310",
    "238140",
    "237210",
    "238910",
    "213115",
    "212111",
    "237130",
    "238990",
    "212210",
    "238120",
    "326121",
    "332431",
    "332919",
    "321214",
    "331222",
    "311211",
    "325311",
    "335110",
    "324191",
    "336111",
    "312113",
    "339116",
    "332119",
    "311821",
    "337910",
    "311225",
    "313310",
    "316998",
    "311314",
    "333120",
    "481111",
    "448210",
    "423810",
    "488111",
    "441320",
    "483111",
    "445110",
    "423620",
    "493120",
    "441310",
    "448190",
    "442291",
    "423120",
    "453310",
    "446110",
    "424410",
    "424440",
    "453220",
    "487990",
    "423460",
    "562910",
    "523910",
    "523999",
    "522298",
    "541110",
    "541922",
    "523120",
    "531210",
    "541840",
    "511110",
    "517911",
    "532310",
    "517312",
    "522292",
    "532283",
    "518210",
    "541714",
    "532289",
    "562991",
    "515111",
    "621493",
    "624221",
    "611610",
    "621111",
    "621330",
    "624310",
    "624120",
    "621112",
    "622110",
    "621320",
    "621511",
    "611519",
    "611110",
    "621991",
    "621491",
    "611210",
    "624210",
    "623210",
    "624230",
    "611430",
    "721211",
    "722310",
    "711310",
    "713110",
    "713940",
    "722514",
    "711190",
    "711410",
    "711219",
    "712110",
    "713120",
    "722511",
    "721110",
    "713210",
    "712120",
    "711212",
    "711510",
    "722515",
    "712130",
    "711130",
    "811212",
    "812210",
    "812112",
    "813910",
    "813211",
    "812113",
    "812922",
    "812332",
    "813219",
    "813920",
    "812990",
    "813212",
    "813319",
    "811310",
    "811211",
    "811113",
    "813940",
    "812320",
    "812220",
    "811412",
    "925110",
    "923120",
    "921150",
    "921190",
    "924120",
    "923110",
    "924110",
    "926120",
    "927110",
    "926110",
    "928120",
    "921110",
    "922110",
    "923130",
    "922160",
    "921120",
    "926140",
    "925120",
    "922130",
    "921130"
]

// ** Function to Clean Data **
const cleanText = (text) => {
  return text.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
};

// ** Append Data to CSV **
const appendToCSV = (data) => {
  let fileExists = fs.existsSync(csvFilePath);
  let existingData = [];
  let existingHeaders = [];

  if (fileExists) {
    const fileContent = fs.readFileSync(csvFilePath, "utf8").trim();
    if (fileContent) {
      existingData = parse(fileContent, { columns: true, skip_empty_lines: true });
      existingHeaders = existingData.length ? Object.keys(existingData[0]) : [];
    }
  }

  const structuredData = {};
  Object.keys(data).forEach((key) => {
    if (Array.isArray(data[key])) {
      data[key].forEach((value, index) => {
        structuredData[`${key}_${index + 1}`] = cleanText(value);
      });
    } else {
      structuredData[key] = cleanText(data[key]);
    }
  });

  const newHeaders = Array.from(new Set([...existingHeaders, ...Object.keys(structuredData)]));

  // Update existing data with new headers
  const updatedData = existingData.map((row) => {
    return newHeaders.reduce((obj, key) => {
      obj[key] = row[key] || "";
      return obj;
    }, {});
  });

  // Format the new row
  const newRow = newHeaders.reduce((obj, key) => {
    obj[key] = structuredData[key] ?? "";
    return obj;
  }, {});

  updatedData.push(newRow);
  const csvContent = stringify(updatedData, { header: true });

  fs.writeFileSync(csvFilePath, csvContent, "utf8");
  console.log(`✅ Data appended to ${csvFilePath}`);
};

// ** Function to Close Modal **
const closeModal = async (page) => {
  try {
    const closeButton = await page.$(".modal-content button#whiteModalX");
    if (closeButton) {
      await closeButton.click();
      console.log("✅ Closed modal.");
      return;
    }
  } catch {}

  try {
    const closeDiv = await page.$('.color5.font-family-black.link.text-center[data-dismiss="modal"]');
    if (closeDiv) {
      await closeDiv.click();
      console.log("✅ Closed modal using div.");
      return;
    }
  } catch {}

  console.warn("❌ Could not close modal. Moving to next row.");
};

// ** Web Scraping Function **
const scrapWeb = async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1000 });

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    // Go to the target URL
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Check if login is required
    if (await page.$('input[name="email"]')) {
      console.log("🔐 Login required. Logging in...");
      await page.type('input[name="email"]', email);
      await page.type('input[name="password"]', password);
      await page.click('button[type="submit"]');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    for (const naics of naicsCodes) {
      console.log(`🔍 Searching for NAICS code: ${naics}`);

      // ** Clear input fields before entering new values **
      await page.$eval("#bvr_min_naics", el => el.value = "");
      await page.$eval("#bvr_max_naics", el => el.value = "");

      await page.waitForSelector("#bvr_min_naics");
      await page.type("#bvr_min_naics", naics);
      await page.type("#bvr_max_naics", naics);

      await page.click(".btn.btn-success.bvr_search");
      await page.waitForSelector("#bvr_search_results_table", { timeout: 15000 });

      const rows = await page.$$("tbody .bvr_transaction_row");
      console.log(`Total rows found for ${naics}: ${rows.length}`);

      for (let i = 0; i < rows.length; i++) {
        try {
          const row = rows[i];
          const button = await row.$(".btn-success-square.fa-2x.color2.link.ajaxwhitemodal");

          if (button) {
            await button.click();
            console.log(`🔍 Opening modal for row ${i + 1}...`);

            let modalOpened = true;
            try {
              await page.waitForSelector(".modal-content", { timeout: 5000 });
            } catch {
              console.warn(`⏳ Modal did not open for row ${i + 1}. Skipping...`);
              modalOpened = false;
            }

            if (!modalOpened) continue;

            try {
              await page.waitForSelector(".bvr-deal-panel", { timeout: 10000 });
            } catch {
              console.warn(`⚠️ Modal content did not load for row ${i + 1}. Skipping...`);
              await closeModal(page);
              continue;
            }

            let extractedData = await page.evaluate(() => {
              const result = {};
              const sections = document.querySelectorAll(".bvr-section");

              sections.forEach((section) => {
                const subheadingElements = section.querySelectorAll(".bvr-item");

                subheadingElements.forEach((item) => {
                  let subheading = item.querySelector(".subheading")?.textContent?.trim();
                  if (!subheading) return;

                  let value = item.innerHTML
                    .replace(/<span class=\"subheading\">.*?<\/span>/, "")
                    .replace(/&nbsp;/g, " ")
                    .replace(/<[^>]+>/g, "")
                    .trim();

                  if (!result[subheading]) {
                    result[subheading] = [];
                  }

                  result[subheading].push(value || "");
                });
              });

              return result;
            });

            appendToCSV(extractedData);
            console.log(`✅ Scraped data for row ${i + 1}`);

            await closeModal(page);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(`❌ Error scraping row ${i + 1}:`, error);
        }
      }
    }
  } catch (error) {
    console.error("❌ An error occurred:", error);
  } finally {
    await browser.close();
  }
};

scrapWeb();
