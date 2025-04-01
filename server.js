const express = require("express");
const puppeteer = require("puppeteer");
const qrcode = require("qrcode-terminal");
const fs = require("fs");

const app = express();
const port = 3000;

// Serve static files (e.g., CSS, images)
app.use(express.static("public"));

// File to store session cookies
const SESSION_FILE_PATH = "./whatsapp-session.json";

let page;

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

// Clear session cookies by deleting the session file
const clearSession = async () => {
  if (fs.existsSync(SESSION_FILE_PATH)) {
    fs.unlinkSync(SESSION_FILE_PATH);
    console.log("Session cleared.");
  } else {
    console.log("No session file to clear.");
  }
};

// Home route
app.get("/", async (req, res) => {
  const isLoggedIn = await initializeWhatsApp();
  if (isLoggedIn) {
    const homePage = fs.readFileSync("./verifyphone.html", "utf-8");
    res.status(200).send(homePage);
  } else {
    const homePage = fs.readFileSync("./home.html", "utf-8");
    res.status(400).send(homePage);
  }
});

// Login route
app.get("/login", async (req, res) => {
  const isLoggedIn = await initializeWhatsApp(req, res);
  if (isLoggedIn) {
    const homePage = fs.readFileSync("./verifyphone.html", "utf-8");
    res.status(200).send(homePage);
  } else {
    const homePage = fs.readFileSync("./home.html", "utf-8");
    res.status(400).send(homePage);
  }
});

const initializeWhatsApp = async (req, res) => {
  try {
    let logs = "";
    const log = (message) => {
      console.log(message);
      logs += `${message}<br>`;
    };
    log("Whatsapp Initialized....!!");
    const browser = await puppeteer.launch({
      headless: true,
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        require("puppeteer").executablePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    log("Browser Initialized....!!");
    page = await browser.newPage();
    log("Browser new page created...!!");

    // Set a supported user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    log("User agent set...!!");

    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });

    log("WhatsApp Web opened...!!");

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
      log("QR code canvas found.");

      // Get QR code data
      const qrData = await page.evaluate(() => {
        const qrCanvas = document.querySelector("canvas");
        return qrCanvas.parentElement.getAttribute("data-ref");
      });

      // Display QR code in terminal
      qrcode.generate(qrData, { small: true });
      log("Scan the QR code with your phone to log in.");

      // Wait for navigation to complete (i.e., user scans QR code)
      await page.waitForNavigation({ waitUntil: "networkidle2" });
      log("Logged in successfully!");

      // Save session cookies
      const client = await page.createCDPSession();
      const { cookies } = await client.send("Network.getAllCookies");
      await saveSession(cookies);
      log("Session saved to file.");
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
  let logs = "";
  const log = (message) => {
    console.log(message);
    logs += `${message}<br>`;
  };

  const phoneNumbers = req.query.phone;
  if (!phoneNumbers) {
    return res.status(400).send("Phone number(s) are required");
  }

  const numbersArray = phoneNumbers.split(",");
  const results = {};

  for (const phoneNumber of numbersArray) {
    const isValid = await verifyPhoneNumber(phoneNumber.trim(), req, res);
    log("Phone number:", phoneNumber.trim(), "is valid:", isValid);
    results[phoneNumber.trim()] = isValid ? "Valid" : "Invalid";
  }

  res.json(results);
});

// Verify a phone number
const verifyPhoneNumber = async (phoneNumber, req, res) => {
  try {
    let logs = "";
    const log = (message) => {
      console.log(message);
      logs += `${message}<br>`;
    };
    const cookies = await loadSession();
    if (cookies) {
      await page.setCookie(...cookies);
      log("Session loaded from file.");
    } else {
      const response = await initializeWhatsApp();
      log("New Session Created.", response);
    }

    await page.goto(`https://web.whatsapp.com/send?phone=${phoneNumber}`, {
      waitUntil: "networkidle2",
    });

    log(`Verifying phone number: ${phoneNumber}`);

    try {
      log("Waiting for main div...");
      await page.waitForSelector("#main", { timeout: 10000 });

      const isNumberValid = await page.evaluate(() => {
        const mainDiv = document.querySelector("#main");
        return !!mainDiv;
      });
      log("isNumberValid :", phoneNumber, isNumberValid);
      return isNumberValid;
    } catch (error) {
      console.error("Main div not found:", error);
      log("Main div not found. Checking isLoggedIn.");
      return false;
    }
  } catch (error) {
    console.error(`Error verifying phone number ${phoneNumber}:`, error);
    console.log("Clearing Session: Error Flag");
    await clearSession();
    return false;
  }
};

app.get("/signout", async (req, res) => {
  try {
    console.log("Signing out...Clearing Session");
    await clearSession();
  } catch (error) {
    console.error("Error signing out:", error);
  }
  const homePage = fs.readFileSync("./home.html", "utf-8");
  res.send(homePage);
});
// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
