const express = require("express");
const puppeteer = require("puppeteer");
const qrcode = require("qrcode-terminal");
const fs = require("fs");

const app = express();
const port = 3000;

console.log("Server is starting...");
// File to store session cookies
const SESSION_FILE_PATH = "./whatsapp-session.json";

let page;

console.log("Server is starting... 2");
// Load session cookies if they exist
const loadSession = async () => {
  if (fs.existsSync(SESSION_FILE_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(SESSION_FILE_PATH, "utf-8"));
    return cookies;
  }
  return null;
};

// Save session cookies to a file
const saveSession = async (cookies) => {
  fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(cookies, null, 2));
};

// Serve static files (e.g., CSS, images)
app.use(express.static("public"));

// Home route
app.get("/", async (req, res) => {
  const response = await initializeWhatsApp();
  if (response) {
    const homePage = fs.readFileSync("./verifyphone.html", "utf-8");
    res.send(homePage);
  } else {
    const homePage = fs.readFileSync("./home.html", "utf-8");
    res.send(homePage);
  }
});

// Login route
app.get("/login", async (req, res) => {
  try {
    let logs = "";
    const log = (message) => {
      console.log(message);
      logs += `${message}<br>`;
    };

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    console.log("Browser launched.");
    page = await browser.newPage();
    console.log("Browser started.");

    // Set a supported user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
    console.log("WhatsApp Web opened.", page.url());

    // Inspect the page HTML for debugging
    const pageHTML = await page.evaluate(() => document.body.innerHTML);
    // console.log("Page HTML:", pageHTML);

    // Wait for the QR code canvas to appear
    try {
      await page.waitForSelector("canvas", { visible: true, timeout: 30000 });
      console.log("QR code canvas found.");

      // Inspect the QR code container
      const qrContainerHTML = await page.evaluate(() => {
        const qrContainer = document.querySelector("div[data-ref]");
        return qrContainer ? qrContainer.outerHTML : "QR container not found";
      });

      // Get QR code data
      const qrData = await page.evaluate(() => {
        const qrCanvas = document.querySelector("canvas");
        return qrCanvas.parentElement.getAttribute("data-ref");
      });

      // Display QR code in terminal
      qrcode.generate(qrData, { small: true });
      console.log("Scan the QR code with your phone to log in.");

      // Send QR code data URL to the client
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>WhatsApp Login</title>
        </head>
        <body>
          <h1>Scan the QR code with your phone to log in to WhatsApp Web</h1>
          <main>${pageHTML}</main>
          <pre>${qrContainerHTML}</pre>
          <pre>${logs}</pre>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("QR code canvas not found:", error);
      res.status(500).send("Failed to load QR code.");
    }
  } catch (error) {
    console.error("Error opening WhatsApp Web:", error);
    res.status(500).send("Failed to open WhatsApp Web.");
  }
});

const initializeWhatsApp = async () => {
  try {
    console.log("Initializing WhatsApp...");
    const browser = await puppeteer.launch({
      headless: true,
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        require("puppeteer").executablePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    console.log("Browser launched.");
    page = await browser.newPage();
    console.log("Browser started.");

    // Set a supported user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
    console.log("WhatsApp Web opened.", page.url());

    // Inspect the page HTML for debugging
    // const pageHTML = await page.evaluate(() => document.body.innerHTML);

    const isLoggedIn = await page.evaluate(() => {
      const loginMessage = Array.from(document.querySelectorAll("div")).find(
        (div) => div.textContent.includes("Log into WhatsApp Web")
      );
      return !!loginMessage;
    });

    if (!isLoggedIn) {
      console.log("Already logged in.");
      return true;
    }

    // Wait for the QR code canvas to appear
    try {
      await page.waitForSelector("canvas", { visible: true, timeout: 30000 });
      console.log("QR code canvas found.");

      // Inspect the QR code container
      // const qrContainerHTML = await page.evaluate(() => {
      //   const qrContainer = document.querySelector("div[data-ref]");
      //   return qrContainer ? qrContainer.outerHTML : "QR container not found";
      // });
      // console.log("QR Container HTML:", qrContainerHTML);

      // Get QR code data
      const qrData = await page.evaluate(() => {
        const qrCanvas = document.querySelector("canvas");
        return qrCanvas.parentElement.getAttribute("data-ref");
      });

      // Display QR code in terminal
      qrcode.generate(qrData, { small: true });
      console.log("Scan the QR code with your phone to log in.");

      // Wait for navigation to complete (i.e., user scans QR code)
      await page.waitForNavigation({ waitUntil: "networkidle2" });
      console.log("Logged in successfully!");

      // Save session cookies
      const cookies = await page.cookies();
      await saveSession(cookies);
      return true;
    } catch (error) {
      console.error("QR code canvas not found:", error);
      return false;
    }
  } catch (error) {
    console.error("Error initializing WhatsApp:", error);
    return false;
  }
};

app.get("/verify", async (req, res) => {
  const phoneNumbers = req.query.phone;
  // the phone number is usually +12123123,+12312312,+123123 or +1123123

  if (!phoneNumbers) {
    return res.status(400).send("Phone number(s) are required");
  }

  const numbersArray = phoneNumbers.split(",");

  const results = {};

  for (const phoneNumber of numbersArray) {
    const isValid = await verifyPhoneNumber(phoneNumber.trim());
    console.log(isValid);
    results[phoneNumber.trim()] = isValid ? "Valid" : "Invalid";
  }

  res.json(results);
});

// Verify a phone number
const verifyPhoneNumber = async (phoneNumber) => {
  try {
    const cookies = await loadSession();
    if (cookies) {
      const cookieOne = await page.setCookie(...cookies);
      console.log("Cookie one set", cookieOne);
      if (cookieOne) {
        console.log("Session loaded from file.");
      } else {
        const response = await initializeWhatsApp();
        console.log("New Session Created.", response);
      }
    }
    await page.goto(`https://web.whatsapp.com/send?phone=${phoneNumber}`, {
      waitUntil: "networkidle2",
    });

    console.log(`Verifying phone number: ${phoneNumber}`);
    console.log(page.url());
    // Wait for the chat to load or error message to appear
    try {
      console.log("Waiting for main div...");
      const mainOne = await page.waitForSelector("#main", { timeout: 10000 });
      console.log("Main div found");
      console.log(mainOne);
      // Check if the phone number is valid
      const isNumberValid = await page.evaluate(() => {
        const mainDiv = document.querySelector("#main"); // Main div selector
        console.log(mainDiv);
        return !!mainDiv;
      });

      return isNumberValid;
    } catch (error) {
      console.error("Main div not found:", error);
      // Check for invalid phone number message
      const isInvalidNumber = await page.evaluate(() => {
        const errorDiv = Array.from(document.querySelectorAll("div")).find(
          (div) =>
            div.textContent.includes("Phone number shared via url is invalid.")
        );
        return !!errorDiv;
      });

      console.error(" isInvalidNumber:", isInvalidNumber);
      return isInvalidNumber;
    }
  } catch (error) {
    console.error(`Error verifying phone number ${phoneNumber}:`, error);
    return false;
  }
};

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
