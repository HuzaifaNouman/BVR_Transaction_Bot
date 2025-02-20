import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import dotenv from "dotenv";
import { parse, stringify } from "csv/sync"; // Using csv/sync for proper CSV parsing

dotenv.config();
puppeteer.use(StealthPlugin());

const loginUrl = "https://www.searchfunder.com/auth/login";
const targetUrl = "https://www.searchfunder.com/bvr/search";

const email = process.env.EMAIL;
const password = process.env.PASSWORD;
const csvFilePath = "extracted_data.csv";

// ** Function to Clean Data **
const cleanText = (text) => {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};

// ** Function to Append Data to CSV with Headers Only Once **

const appendToCSV = (data) => {
    let fileExists = fs.existsSync(csvFilePath);
    let existingData = [];
    let existingHeaders = [];

    // Load existing data & headers if file exists
    if (fileExists) {
        const fileContent = fs.readFileSync(csvFilePath, "utf8").trim();
        if (fileContent) {
            existingData = parse(fileContent, { columns: true, skip_empty_lines: true });
            existingHeaders = existingData.length ? Object.keys(existingData[0]) : [];
        }
    }

    // Ensure consistent column order
    const newHeaders = Array.from(new Set([...existingHeaders, ...Object.keys(data)]));

    // Align old data with new headers
    const updatedData = existingData.map(row => {
        return newHeaders.reduce((obj, key) => {
            obj[key] = cleanText(row[key] || ""); // Maintain order
            return obj;
        }, {});
    });

    // Format new row properly
    const newRow = newHeaders.reduce((obj, key) => {
        obj[key] = cleanText(data[key] || "");
        return obj;
    }, {});

    updatedData.push(newRow); // Append new row

    // Convert back to CSV
    const csvContent = stringify(updatedData, { header: true });

    fs.writeFileSync(csvFilePath, csvContent, "utf8");
    console.log(`✅ Data correctly appended to ${csvFilePath}`);
};




// ** Web Scraping Function **
const scrapWeb = async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1000 });

    try {
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36");

        await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.type('input[name="email"]', email);
        await page.type('input[name="password"]', password);
        await page.click('button[type="submit"]');

        await page.goto(targetUrl, { waitUntil: "load", timeout: 60000 });
        await page.waitForSelector("#bvr_country_select");
        await page.waitForSelector("#bvr_naics_top_select");
        await page.select("#bvr_country_select", "United States");
        await page.select("#bvr_naics_top_select", "52");
        await page.type("#bvr_min_ebitda", "500000");
        await page.type("#bvr_max_ebitda", "1400000");
        await page.click(".btn.btn-success.bvr_search");

        await page.waitForSelector("#bvr_search_results_table");
        const rows = await page.$$("tbody .bvr_transaction_row");
        console.log(`Total number of rows: ${rows.length}`);

        for (let i = 0; i < rows.length; i++) {
            const buttons = await page.$$(".btn-success-square.fa-2x.color2.link.ajaxwhitemodal");
            if (buttons[i]) {
                await buttons[i].click();
                await page.waitForSelector(".modal-content", { timeout: 5000 });

                try {
                    await page.waitForSelector(".bvr-deal-panel", { timeout: 10000 });
                } catch (err) {
                    console.warn(`bvr-deal-panel did not load for row ${i + 1}. Closing modal and skipping...`);
                    try {
                        const closeButton = await page.waitForSelector(".modal-content button#whiteModalX", { timeout: 3000 });
                        if (closeButton) await closeButton.click();
                    } catch (closeErr) {
                        console.warn(`Could not close modal for row ${i + 1}. Skipping...`);
                    }
                    continue;
                }

                const extractedData = await page.evaluate(() => {
                    const result = {};
                    const sections = document.querySelectorAll(".bvr-section");

                    sections.forEach((section) => {
                        const subheadingElements = section.querySelectorAll(".bvr-item");

                        subheadingElements.forEach((item) => {
                            const subheading = item.querySelector(".subheading")?.textContent?.trim();
                            if (!subheading) return;

                            let value = item.innerHTML
                                .replace(/<span class=\"subheading\">.*?<\/span>/, "")
                                .replace(/&nbsp;/g, " ")
                                .replace(/<[^>]+>/g, "")
                                .replace(/\s+/g, " ")
                                .trim();

                            result[subheading] = value || "";
                        });
                    });
                    return result;
                });



                appendToCSV(extractedData);
                console.log(JSON.stringify(extractedData, null, 2));

                try {
                    const closeButton = await page.waitForSelector(".modal-content button#whiteModalX", { timeout: 3000 });
                    if (closeButton) await closeButton.click();
                } catch (err) {
                    console.warn(`Could not close modal for row ${i + 1}. Skipping...`);
                }
            }
        }
    } catch (error) {
        console.error("An error occurred:", error);
        await browser.close();
    }
};

scrapWeb();