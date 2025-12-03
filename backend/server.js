// ===============================================
// iMark Backend (Full server.js)
// ===============================================
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const { spawn } = require("child_process");
const { exec } = require("child_process");
const fs = require("fs");
require('dotenv').config();

// Import database module
const {
  getUserByEmail,
  getUserById,
  getUserByUsername,
  getUserByResetToken,
  createUser,
  updateUser,
  updateLastLogin,
  logLoginAttempt,
  getLoginHistory
} = require('./database');

// Import email service
const { sendPasswordResetEmail } = require('./emailService');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// ---------- Basic setup ----------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the static frontend (adjust if your folder name is different)
app.use(express.static(path.join(__dirname, "..", "iMark 2")));

// In-memory "database" for files and insights (can migrate to DB later)
let files = [];
let insights = [];
let nextFileId = 1;
let nextInsightId = 1;

// ---------- File upload setup ----------
const upload = multer({
  dest: path.join(__dirname, "uploads"),
});

// ---------- Small helpers ----------
function shortSummary(prompt) {
  if (!prompt) return "AI-generated insight based on uploaded data.";
  if (prompt.length <= 90) return prompt;
  return prompt.slice(0, 87) + "...";
}

function createInsight({ userId, type, title, prompt, details }) {
  const insight = {
    id: nextInsightId++,
    userId: userId ? Number(userId) : null,
    type, // 'segmentation' | 'performance' | 'content'
    title,
    prompt,
    summary: shortSummary(prompt),
    details,
    createdAt: new Date(),
  };
  insights.push(insight);
  return insight;
}

// ---------- Python runners ----------

// Segmentation runner (ml/segment_customers.py <csvPath> <mode>)
function runPythonSegmentation(filePath, mode = "behavior") {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, "..", "ml", "segment_customers.py");
    const absFilePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(__dirname, filePath);

    if (!fs.existsSync(absFilePath)) {
      return reject(new Error(`Uploaded CSV not found: ${absFilePath}`));
    }

    const pythonProcess = spawn("python3", [pythonScript, absFilePath, mode]);
    let stdoutData = "";
    let stderrData = "";

    pythonProcess.stdout.on("data", (chunk) => (stdoutData += chunk.toString()));
    pythonProcess.stderr.on("data", (chunk) => (stderrData += chunk.toString()));

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error("Python segmentation error:", stderrData);
        return reject(new Error(stderrData || `Python exited with code ${code}`));
      }
      try {
        const parsed = JSON.parse(stdoutData);
        resolve(parsed);
      } catch (err) {
        console.error("Failed to parse Python output:", err);
        reject(err);
      }
    });
  });
}

// Performance runner (ml/score_performance.py <csvPath> <mode>)
function runPythonPerformance(filePath, mode = "roi") {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, "..", "ml", "score_performance.py");

    const absFilePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(__dirname, filePath);

    if (!fs.existsSync(absFilePath)) {
      return reject(new Error(`Uploaded CSV not found: ${absFilePath}`));
    }

    const pythonProcess = spawn("python3", [pythonScript, absFilePath, mode]);

    let stdoutData = "";
    let stderrData = "";

    pythonProcess.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });

    pythonProcess.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error("Python performance error:", stderrData);
        return reject(new Error(stderrData || `Python exited with code ${code}`));
      }
      try {
        const parsed = JSON.parse(stdoutData);
        resolve(parsed);
      } catch (err) {
        console.error("Failed to parse performance output:", err);
        reject(err);
      }
    });
  });
}

// ---------- AUTH ROUTES ----------

// Signup
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, email, password, full_name, company_name, phone } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    // Check if user already exists
    const existing = await getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await createUser({
      username: username || email.split('@')[0],
      email,
      password_hash: passwordHash,
      full_name,
      company_name,
      phone
    });

    res.status(201).json({
      message: "Signup successful.",
      user: { id: newUser.id, username: newUser.username, email: newUser.email },
    });
  } catch (err) {
    console.error(err);
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ message: "Username or email already taken." });
    }
    res.status(500).json({ message: "Server error during signup." });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    if (!emailOrUsername || !password) {
      return res.status(400).json({ message: "Missing credentials." });
    }

    // Try to find user by email first
    let user = await getUserByEmail(emailOrUsername);
    
    // If not found by email, try username
    if (!user) {
      user = await getUserByUsername(emailOrUsername);
    }
    
    // If still not found, return error
    if (!user) {
      return res.status(401).json({ message: "User not found. Please check your email/username." });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      // Log failed attempt
      await logLoginAttempt(user.id, ipAddress, userAgent, false);
      return res.status(401).json({ message: "Invalid password." });
    }

    // Update last login and log successful attempt
    await updateLastLogin(user.id);
    await logLoginAttempt(user.id, ipAddress, userAgent, true);

    res.json({
      message: "Login successful.",
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        full_name: user.full_name,
        company_name: user.company_name
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error during login." });
  }
});

// Forgot password (demo)
app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const user = await getUserByEmail(email);
    
    // Always return success for security (don't reveal if email exists)
    if (!user) {
      return res.json({ message: "If this email exists, a password reset link has been sent." });
    }

    // Generate secure token (valid for 1 hour)
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + 60 * 60 * 1000; // 1 hour
    
    await updateUser(user.id, {
      reset_token: token,
      reset_token_expiry: expiry
    });

    // Create reset link
    const resetLink = `${APP_URL}/api/auth/auto-login?token=${token}`;
    
    // Send email
    const emailResult = await sendPasswordResetEmail(email, resetLink, user.full_name || user.username);
    
    if (emailResult.method === 'console' || emailResult.method === 'console-fallback') {
      // In development mode without email config, return the link
      return res.json({ 
        message: "Password reset link generated (Development Mode - check console)",
        resetLink: resetLink
      });
    }

    res.json({ 
      message: "If this email exists, a password reset link has been sent to your inbox."
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: "Internal error." });
  }
});

// Auto-login endpoint - validates token and redirects to dashboard with session
app.get("/api/auth/auto-login", async (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Invalid Link</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>Invalid Reset Link</h1>
          <p>This password reset link is invalid.</p>
          <a href="/login.html" style="color: #16A348;">Back to Login</a>
        </body>
      </html>
    `);
  }

  try {
    // Find user with this token
    const user = await getUserByResetToken(token);
    
    if (!user) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Invalid Link</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>Invalid Reset Link</h1>
            <p>This password reset link is invalid or has already been used.</p>
            <a href="/login.html" style="color: #16A348;">Back to Login</a>
          </body>
        </html>
      `);
    }

    // Check if token expired
    if (Date.now() > user.reset_token_expiry) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Link Expired</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>Link Expired</h1>
            <p>This password reset link has expired. Please request a new one.</p>
            <a href="/forgotpassword.html" style="color: #16A348;">Request New Link</a>
          </body>
        </html>
      `);
    }

    // Create session token for auto-login
    const sessionToken = require('crypto').randomBytes(32).toString('hex');
    
    // Clear the token (one-time use) and set session token
    await updateUser(user.id, {
      reset_token: null,
      reset_token_expiry: null,
      session_token: sessionToken
    });
    
    // Update last login
    await updateLastLogin(user.id);

    // Redirect to dashboard with session info
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Login Successful</title>
          <style>
            body {
              font-family: 'Poppins', Arial, sans-serif;
              background: linear-gradient(145deg, #131613 25%, #138C3D 100%);
              color: white;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .container {
              text-align: center;
              background: rgba(0,0,0,0.3);
              padding: 40px;
              border-radius: 20px;
            }
            h1 { color: #16A348; margin-bottom: 20px; }
            .spinner {
              width: 50px;
              height: 50px;
              border: 5px solid rgba(22,163,72,0.3);
              border-top-color: #16A348;
              border-radius: 50%;
              animation: spin 1s linear infinite;
              margin: 20px auto;
            }
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✓ Login Successful</h1>
            <p>Welcome back! Redirecting to dashboard...</p>
            <div class="spinner"></div>
          </div>
          <script>
            // Store user session
            localStorage.setItem('user', JSON.stringify({
              id: ${user.id},
              email: '${user.email}',
              username: '${user.username}',
              sessionToken: '${sessionToken}'
            }));
            
            // Redirect after 2 seconds
            setTimeout(() => {
              window.location.href = '/dashboard.html';
            }, 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Auto-login error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Error</title></head>
        <body style=\"font-family: Arial; text-align: center; padding: 50px;\">
          <h1>Error</h1>
          <p>An error occurred. Please try again.</p>
          <a href=\"/forgotpassword.html\" style=\"color: #16A348;\">Request New Link</a>
        </body>
      </html>
    `);
  }
});

// ---------- FILE UPLOAD ROUTE ----------
app.post("/api/upload", upload.single("file"), (req, res) => {
  const { fileType, userId } = req.body;
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded." });
  }

  const record = {
    id: nextFileId++,
    userId: userId ? Number(userId) : null,
    type: fileType || "generic",
    originalName: req.file.originalname,
    path: req.file.path, // relative path under backend/uploads
    uploadedAt: new Date(),
  };
  files.push(record);

  res.json({
    message: "File uploaded successfully.",
    file: record,
  });
});

// ---------- Simulated detail builders (fallbacks) ----------

function generateSegmentationDetails(prompt) {
  const normalized = (prompt || "").toLowerCase().trim();

  let intent = "behavior_segments";
  let personas;

  // 1) Prompt: "Segment customers based on purchasing behavior patterns."
  if (normalized.includes("purchasing behavior")) {
    intent = "behavior_segments";
    personas = [
      {
        name: "Eco-Lux Loyalists",
        description:
          "High-income customers who value sustainability and premium craftsmanship, and consistently choose your higher-priced collections.",
        keySignals: [
          "High average monthly spend",
          "High average order value (AOV)",
          "Frequent repeat purchases"
        ],
        suggestedChannels: [
          "Instagram Reels featuring craftsmanship",
          "Pinterest moodboards",
          "VIP email sequences"
        ],
      },
      {
        name: "Aspiring Aesthetes",
        description:
          "Mid-income, style-conscious shoppers who engage heavily with visual content and save up for statement pieces.",
        keySignals: [
          "Multiple product page visits per session",
          "Frequent wishlist or favorites usage",
          "High engagement on lookbooks and galleries"
        ],
        suggestedChannels: [
          "TikTok UGC and styling videos",
          "Instagram Stories lookbooks"
        ],
      },
      {
        name: "Eco-Gift Shoppers",
        description:
          "Occasional purchasers seeking meaningful, sustainable gifts during key seasons and events.",
        keySignals: [
          "Seasonal purchase spikes",
          "Interest in bundles and gift sets",
          "Gift notes and message add-ons"
        ],
        suggestedChannels: [
          "Email gift guides",
          "Seasonal performance ads"
        ],
      },
    ];
  }

  // 2) Prompt: "Recommend optimized target audience groups for campaigns."
  else if (
    normalized.includes("target audience") ||
    normalized.includes("campaigns")
  ) {
    intent = "campaign_targets";
    personas = [
      {
        name: "Eco-Lux Loyalists",
        description:
          "Primary high-ROAS audience for conversion campaigns focused on premium and limited-edition collections.",
        keySignals: [
          "Highest spend and strong repeat purchase rate",
          "High responsiveness to new collection launches",
          "Engages with sustainability and quality messaging"
        ],
        suggestedChannels: [
          "Retargeting ads on Meta/Google",
          "VIP email flows with early access",
          "Lookalike seed for prospecting audiences"
        ],
      },
      {
        name: "Aspiring Aesthetes",
        description:
          "High-engagement, mid-spend audience ideal for mid-funnel storytelling and brand-building campaigns.",
        keySignals: [
          "Very high product and gallery views",
          "Saves and shares content but converts less frequently",
          "Responds well to creator/UGC content"
        ],
        suggestedChannels: [
          "Instagram / TikTok UGC campaigns",
          "Inspiration carousels and story ads",
          "Landing pages with strong visual narrative"
        ],
      },
      {
        name: "Eco-Gift Shoppers",
        description:
          "Seasonal buyers best targeted with time-bound promotions and bundle offers around key gifting moments.",
        keySignals: [
          "Traffic and orders cluster around holidays",
          "Higher basket size during peak seasons",
          "Interest in curated gift bundles"
        ],
        suggestedChannels: [
          "Seasonal email + SMS campaigns",
          "Promo ads with countdowns",
          "Homepage hero banners for bundle offers"
        ],
      },
    ];
  }

  // 3) Prompt: "Analyze demographic and engagement data to identify key audience segments."
  else if (
    normalized.includes("demographic") ||
    normalized.includes("engagement")
  ) {
    intent = "demographic_segments";
    personas = [
      {
        name: "Eco-Lux Loyalists",
        description:
          "Typically older, higher-income customers with strong affinity for eco-conscious luxury pieces and consistent purchase behavior.",
        keySignals: [
          "Higher average age and spend",
          "Stable visit frequency with strong conversion",
          "Low sensitivity to discounts, more responsive to value storytelling"
        ],
        suggestedChannels: [
          "In-depth storytelling emails",
          "High-quality product videos",
          "Retargeting with craftsmanship and heritage angles"
        ],
      },
      {
        name: "Aspiring Aesthetes",
        description:
          "Usually younger, visually-driven audience segments with intense engagement and aspiration toward premium designs.",
        keySignals: [
          "Higher visits per month and page depth",
          "Strong interaction with lookbooks, reels, and stories",
          "Frequent wishlist adds without matching purchase volume"
        ],
        suggestedChannels: [
          "Instagram and TikTok campaigns",
          "Creator collaborations",
          "Launch teasers and countdown content"
        ],
      },
      {
        name: "Eco-Gift Shoppers",
        description:
          "Mixed-age audience clusters who engage more around events, family occasions, and seasonal gifting periods.",
        keySignals: [
          "Sharp engagement spikes around holidays",
          "Browsing multiple categories for ideas",
          "Higher AOV during specific months or campaigns"
        ],
        suggestedChannels: [
          "Seasonal email drips and reminders",
          "On-site banners during peak gifting periods",
          "Paid search and social around gifting keywords"
        ],
      },
    ];
  }

  // 4) Fallback: behave like prompt 1
  else {
    intent = "generic_segmentation";
    personas = [
      {
        name: "Eco-Lux Loyalists",
        description:
          "High-income professionals who value sustainability and premium craftsmanship.",
        keySignals: ["High AOV", "Engages with eco-friendly content", "Buys premium lines"],
        suggestedChannels: ["Instagram Reels", "Pinterest", "Email sequences"],
      },
      {
        name: "Aspiring Aesthetes",
        description:
          "Mid-income customers who save up for statement pieces and respond well to aspirational visuals.",
        keySignals: ["Multiple product page visits", "Wishlist adds", "Lookbook engagement"],
        suggestedChannels: ["TikTok UGC", "Instagram Stories"],
      },
      {
        name: "Eco-Gift Shoppers",
        description:
          "Occasional purchasers seeking meaningful and sustainable gifts.",
        keySignals: ["Seasonal spikes", "Gift notes", "Bundle searches"],
        suggestedChannels: ["Email gift guides", "Seasonal ads"],
      },
    ];
  }

  return {
    type: "segmentation",
    intent,       // frontend can ignore this if not needed
    personas,
    promptUsed: prompt,
  };
}

function generateContentDetails(prompt) {
  const base = prompt || "premium eco-friendly wooden furniture";
  return {
    type: "content",
    caption: `Transform your space with ethically crafted, timeless wood pieces. ✨🌿\n\n${base}`,
    hashtags: [
      "#RoaaWoodArtisan",
      "#EcoLuxury",
      "#SustainableDesign",
      "#TimelessInteriors",
      "#ConsciousLiving",
    ],
    emailSubject: "Bring Warmth & Character to Your Home – The Eco-Lux Way",
    emailBody:
      "Hi there,\n\nWe’ve handpicked a collection of sustainably crafted pieces that bring warmth, character, and longevity into your space. Each item is designed to last a lifetime while respecting the planet.\n\nExplore the latest collection and discover pieces that tell a story.\n\nWarmly,\nRoaa Wood Artisan · iMark",
    adHeadline: "Eco-Lux Furniture That Actually Lasts",
    promptUsed: prompt,
  };
}

function generatePerformanceDetails(prompt, mode = "roi") {
  const normalized = (prompt || "").toLowerCase().trim();

  // Re-derive mode from text as a safety check
  // Re-derive mode from text as a safety check (same rules as /api/ai/performance)
  if (normalized.includes("engagement") || normalized.includes("ctr") || normalized.includes("social media")) {
    mode = "engagement";
  } else if (
    normalized.includes("roas") ||
    normalized.includes("return on ad spend") ||
    normalized.includes("return on investment") ||
    normalized.includes("roi")
  ) {
    mode = "roi";
  } else if (
    normalized.includes("conversion") ||
    normalized.includes("convert") ||
    normalized.includes("post-click")
  ) {
    mode = "conversion";
  }


  if (mode === "engagement") {
    return {
      type: "performance",
      mode: "engagement",
      overview:
        "This view focuses on engagement quality across recent campaigns, highlighting the posts and ads with the strongest click-through rates.",
      modelUsed: "RandomForestRegressor predicting engagement (CTR) with campaign metadata.",
      promptUsed: prompt,
      highlights: [
        "Top-ranked campaigns achieve significantly higher CTR than the portfolio average.",
        "Visual creatives with clear calls-to-action drive stronger engagement.",
        "Campaigns with high CTR but moderate conversion rates are strong candidates for landing-page and offer testing.",
      ],
      recommendations: [
        "Reuse and iterate on the best-performing creatives identified by the model.",
        "Expand targeting for high-CTR campaigns to lookalike or similar audiences.",
        "Pause or refactor campaigns with below-median CTR and above-median spend.",
      ],
    };
  }

  if (mode === "conversion") {
    return {
      type: "performance",
      mode: "conversion",
      overview:
        "This view prioritises campaigns and channels that convert efficiently after the click, using a conversion-rate focused model.",
      modelUsed: "RandomForestRegressor predicting post-click conversion rate.",
      promptUsed: prompt,
      highlights: [
        "A subset of campaigns combines healthy CTR with exceptional conversion efficiency.",
        "Certain channels consistently appear among the highest predicted converters.",
        "Low-conversion campaigns represent optimisation opportunities even if engagement is strong.",
      ],
      recommendations: [
        "Allocate more budget to campaigns with the highest predicted conversion rate.",
        "Review messaging, landing pages and funnel steps for low-conversion campaigns.",
        "Test different offers or audience segments on channels with weak conversion performance.",
      ],
    };
  }

  // default = ROI mode
  return {
    type: "performance",
    mode: "roi",
    overview:
      "This view evaluates overall campaign efficiency using a ROAS-focused model and surfaces the most profitable opportunities.",
    modelUsed: "RandomForestRegressor predicting return on ad spend (ROAS).",
    promptUsed: prompt,
    highlights: [
      "Top-ranked campaigns deliver predicted ROAS well above the portfolio median.",
      "Campaigns with balanced spend, clicks and conversions tend to achieve stronger ROAS.",
      "Several campaigns show high spend but lower predicted ROAS and should be reviewed.",
    ],
    recommendations: [
      "Scale budgets gradually on the top ROAS campaigns identified by the model.",
      "Reduce or pause campaigns with consistently low predicted ROAS and high spend.",
      "Use the ROAS ranking as a guide when planning future campaign mix and budgets.",
    ],
  };
}

// 🔹 NEW: helper to expose the correct metric label to the frontend
function getPerformanceMetricLabel(mode) {
  switch (mode) {
    case "engagement":
      return "Predicted Engagement (CTR)";
    case "conversion":
      return "Predicted Conversion Rate";
    case "roi":
    default:
      return "Predicted ROAS";
  }
}

// ---------- AI ROUTES ----------

// Segmentation: real ML + fallback personas
app.post("/api/ai/segmentation", async (req, res) => {
  const { userId, prompt, fileId } = req.body;

  // Decide which segmentation "mode" to use based on the prompt text
  const p = (prompt || "").toLowerCase();
  let segmentationMode = "behavior"; // default for Prompt 1

  if (p.includes("target audience") || p.includes("campaign")) {
    segmentationMode = "campaign";       // Prompt 2
  } else if (p.includes("demographic") || p.includes("engagement")) {
    segmentationMode = "engagement";     // Prompt 3
  }

  try {
    let mlResult = null;

    if (fileId) {
      const fileRecord = files.find((f) => f.id === Number(fileId));
      if (fileRecord) {
        const absPath = path.isAbsolute(fileRecord.path)
          ? fileRecord.path
          : path.join(__dirname, fileRecord.path);
        console.log(
          "Running ML segmentation on file:",
          absPath,
          "mode:",
          segmentationMode
        );
        mlResult = await runPythonSegmentation(absPath, segmentationMode);
      } else {
        console.warn("File record not found for fileId:", fileId);
      }
    } else {
      console.log("No fileId provided, skipping ML segmentation.");
    }

    const details = generateSegmentationDetails(prompt);
    if (mlResult) {
      details.mode = mlResult.mode;              // "behavior" | "campaign" | "engagement"
      details.totalCustomers = mlResult.total_customers;
      details.segments = mlResult.segments;
    }

    const insight = createInsight({
      userId,
      type: "segmentation",
      title: "Segmentation Insight",
      prompt,
      details,
    });

    res.json({ message: "Segmentation insight generated.", insight });
  } catch (err) {
    console.error("Segmentation AI error:", err);

    const details = generateSegmentationDetails(prompt);
    const insight = createInsight({
      userId,
      type: "segmentation",
      title: "Segmentation Insight (fallback)",
      prompt,
      details,
    });

    res.json({
      message:
        "Segmentation generated with fallback data due to AI processing error.",
      insight,
    });
  }
});

// Performance: real ML + text card
app.post("/api/ai/performance", async (req, res) => {
  const { userId, prompt, fileId } = req.body;

  const p = (prompt || "").toLowerCase();
  let performanceMode = "roi"; // default

  // Engagement-focused prompt (CTR)
  if (p.includes("engagement") || p.includes("ctr") || p.includes("social media")) {
    performanceMode = "engagement";

  // ROI / ROAS prompt
  } else if (
    p.includes("roas") ||
    p.includes("return on ad spend") ||
    p.includes("return on investment") ||
    p.includes("roi")
  ) {
    performanceMode = "roi";

  // Conversion-focused prompt
  } else if (
    p.includes("conversion") ||
    p.includes("convert") ||
    p.includes("post-click")
  ) {
    performanceMode = "conversion";
  }


  try {
    let mlResult = null;

    if (fileId) {
      const fileRecord = files.find((f) => f.id === Number(fileId));
      if (fileRecord) {
        const absPath = path.isAbsolute(fileRecord.path)
          ? fileRecord.path
          : path.join(__dirname, fileRecord.path);

        console.log("Running performance ML on:", absPath, "mode:", performanceMode);
        mlResult = await runPythonPerformance(absPath, performanceMode);
      } else {
        console.warn("File record not found for fileId:", fileId);
      }
    } else {
      console.log("No fileId provided, skipping performance ML.");
    }

    const details = generatePerformanceDetails(prompt, performanceMode);
    // 🔹 attach dynamic label + ML result
    details.metricLabel = getPerformanceMetricLabel(performanceMode);
    details.ml = mlResult;

    const insight = createInsight({
      userId,
      type: "performance",
      title: "Performance Insight",
      prompt,
      details,
    });

    res.json({ message: "Performance insight generated.", insight });
  } catch (err) {
    console.error("Performance AI error:", err);

    const details = {
      type: "performance",
      mode: performanceMode,
      overview: "Performance insight could not be fully generated due to an error.",
      promptUsed: prompt,
      ml: null,
      // 🔹 still provide a label even on error
      metricLabel: getPerformanceMetricLabel(performanceMode),
    };

    const insight = createInsight({
      userId,
      type: "performance",
      title: "Performance Insight (fallback)",
      prompt,
      details,
    });

    res.json({
      message: "Performance generated with fallback due to error.",
      insight,
    });
  }
});



// --------------------------------------------------
// Content Recommendation (ML) – 3 task modes
// --------------------------------------------------
app.post("/content/run", upload.single("file"), (req, res) => {
  const scriptPath = path.join(__dirname, "..", "ml", "recommend_content.py");

  // task = 'strategy' | 'formats' | 'calendar'
  const task = req.body.task || "strategy";

  const dataPath = req.file
    ? req.file.path
    : path.join(__dirname, "..", "ml", "data", "content_train.csv");

  const cmd = `python3 "${scriptPath}" "${dataPath}"`;
  console.log("[Content ML] Running:", cmd, "task:", task);

  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error("[Content ML] exec error:", error);
      console.error("[Content ML] stderr:", stderr);
      return res.status(500).json({ error: "Failed to run content ML model." });
    }

    console.log("[Content ML] stdout:", stdout);

    let output;
    try {
      output = JSON.parse(stdout);
    } catch (e) {
      console.error("[Content ML] Failed to parse JSON:", e, stdout);
      return res
        .status(500)
        .json({ error: "Failed to parse content ML output." });
    }

    if (output.error) {
      return res.status(400).json(output);
    }

    const table = output.table || [];
    const totalItems = output.total_items || table.length;

    // ---------- MODE 1: STRATEGY (Prompt 1) ----------
    function buildStrategyPayload() {
      return {
        type: "content_strategy",
        total_items: totalItems,
        top_recommendations: output.top_recommendations || [],
        table,
      };
    }

    // ---------- MODE 2: FORMATS (Prompt 2) ----------
    function buildFormatsPayload() {
      const byFormat = {};

      for (const row of table) {
        const fmt = row.format || "Unknown";
        if (!byFormat[fmt]) {
          byFormat[fmt] = {
            format: fmt,
            total: 0,
            scoreSum: 0,
            samples: [],
          };
        }
        const group = byFormat[fmt];
        const score = Number(row.predicted_score || 0);
        group.total += 1;
        group.scoreSum += score;
        if (group.samples.length < 3) group.samples.push(row);
      }

      const formats_ranked = Object.values(byFormat)
        .map((g) => {
          const avg = g.total ? g.scoreSum / g.total : 0;
          const top = g.samples[0] || {};
          return {
            format: g.format,
            avg_score: avg,
            best_channel: top.channel || null,
            example_persona: top.persona_key || null,
            example_goal: top.campaign_goal || null,
          };
        })
        .sort((a, b) => b.avg_score - a.avg_score);

      return {
        type: "content_formats",
        total_items: totalItems,
        formats_ranked,
        table,
      };
    }

    // ---------- MODE 3: CALENDAR (Prompt 3) ----------
    function buildCalendarPayload() {
      const sorted = table
        .slice()
        .sort((a, b) => Number(b.predicted_score) - Number(a.predicted_score));

      const dayLabels = [
        "Day 1",
        "Day 2",
        "Day 3",
        "Day 4",
        "Day 5",
        "Day 6",
        "Day 7",
      ];

      const calendar = [];
      const usedCombo = new Set();

      for (const row of sorted) {
        if (calendar.length >= 7) break;
        const key = (row.channel || "") + "|" + (row.format || "");
        if (usedCombo.has(key)) continue;
        usedCombo.add(key);

        calendar.push({
          day: dayLabels[calendar.length],
          content_id: row.content_id,
          persona_key: row.persona_key,
          campaign_goal: row.campaign_goal,
          channel: row.channel,
          format: row.format,
          predicted_score: row.predicted_score,
        });
      }

      return {
        type: "content_calendar",
        total_items: totalItems,
        calendar,
        table,
      };
    }

    let payload;
    if (task === "formats") {
      payload = buildFormatsPayload();
    } else if (task === "calendar") {
      payload = buildCalendarPayload();
    } else {
      payload = buildStrategyPayload();
    }

    return res.json(payload);
  });
});



// ---------- INSIGHTS & DASHBOARD ----------

// List insights (?type=segmentation|performance|content)
app.get("/api/insights", (req, res) => {
  const { type } = req.query;
  let result = insights;
  if (type) result = result.filter((i) => i.type === type);
  res.json(result);
});

// Single insight by id
app.get("/api/insights/:id", (req, res) => {
  const id = Number(req.params.id);
  const insight = insights.find((i) => i.id === id);
  if (!insight) return res.status(404).json({ message: "Insight not found." });
  res.json(insight);
});

// Dashboard summary
app.get("/api/dashboard/summary", (req, res) => {
  const total = insights.length;
  const segmentationCount = insights.filter((i) => i.type === "segmentation").length;
  const performanceCount = insights.filter((i) => i.type === "performance").length;
  const contentCount = insights.filter((i) => i.type === "content").length;

  res.json({
    totalInsights: total,
    segmentationCount,
    performanceCount,
    contentCount,
    recent: insights.slice().sort((a, b) => b.id - a.id).slice(0, 5),
  });
});

// ---------- HELP CHATBOT (ML-POWERED WITH STREAMING) ----------
// Fallback response function
function getFallbackChatResponse(message) {
  const text = (message || "").toLowerCase();

  if (text.includes("hello") || text.includes("hi")) {
    return "Hello! I'm your AI marketing assistant. I can analyze campaigns, predict performance, and provide insights using machine learning.";
  } else if (text.includes("upload")) {
    return "To upload data, go to the relevant reporting page (Segmentation or Performance), use the upload section, and attach your CSV/XLSX/JSON file before generating insights.";
  } else if (text.includes("segmentation")) {
    return "Segmentation Reporting groups your customers into personas based on behavior, demographics, and engagement. I can analyze your customer data using machine learning to identify patterns.";
  } else if (text.includes("performance")) {
    return "Performance Reporting predicts campaign outcomes (like ROAS) and suggests budget reallocations. Upload a campaigns CSV and I'll use ML models to forecast results.";
  } else if (text.includes("content")) {
    return "Content Generation uses your prompt to create captions, hashtags, email copy, and ad angles. I can recommend optimal content based on past performance data.";
  } else {
    return "I'm your iMark AI assistant with machine learning capabilities. You can ask me about uploading data, generating insights, performance predictions, customer segmentation, or content recommendations.";
  }
}

// Streaming chat endpoint using Server-Sent Events with ML
app.post("/api/help/chat/stream", async (req, res) => {
  const { message, context } = req.body;
  if (!message) return res.status(400).json({ error: 'No message' });

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Try ML-powered response first
    const pythonScript = path.join(__dirname, 'ml_chatbot.py');
    const args = [pythonScript, message];
    if (context) {
      args.push(JSON.stringify(context));
    }
    
    const python = spawn('/Users/bulumkamaseko/Desktop/miniconda3/bin/python', args);
    let words = [];
    
    python.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.word) {
            words.push(parsed.word);
            res.write(`data: ${JSON.stringify({ chunk: ' ' + parsed.word, done: false })}\n\n`);
          }
          if (parsed.done) {
            res.write(`data: ${JSON.stringify({ chunk: '', done: true })}\n\n`);
            res.end();
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    });
    
    python.stderr.on('data', (data) => {
      // Ignore warnings, only log critical errors
      const errMsg = data.toString();
      if (!errMsg.includes('Warning:') && !errMsg.includes('UserWarning') && !errMsg.includes('FutureWarning')) {
        console.error('ML Chatbot error:', errMsg);
      }
    });
    
    python.on('close', (code) => {
      if (code !== 0 && words.length === 0) {
        // Fallback to simple response if ML fails
        const fallback = getFallbackChatResponse(message);
        const fallbackWords = fallback.split(' ');
        let index = 0;
        const interval = setInterval(() => {
          if (index < fallbackWords.length) {
            const chunk = index === 0 ? fallbackWords[index] : ' ' + fallbackWords[index];
            res.write(`data: ${JSON.stringify({ chunk, done: false })}\n\n`);
            index++;
          } else {
            res.write(`data: ${JSON.stringify({ chunk: '', done: true })}\n\n`);
            res.end();
            clearInterval(interval);
          }
        }, 80);
      }
    });
    
    python.on('error', (err) => {
      console.error('Failed to start Python:', err);
      // Fallback response
      const fallback = getFallbackChatResponse(message);
      const fallbackWords = fallback.split(' ');
      let index = 0;
      const interval = setInterval(() => {
        if (index < fallbackWords.length) {
          const chunk = index === 0 ? fallbackWords[index] : ' ' + fallbackWords[index];
          res.write(`data: ${JSON.stringify({ chunk, done: false })}\n\n`);
          index++;
        } else {
          res.write(`data: ${JSON.stringify({ chunk: '', done: true })}\n\n`);
          res.end();
          clearInterval(interval);
        }
      }, 80);
    });

  } catch (err) {
    console.error('Chat error:', err);
    const fallback = getFallbackChatResponse(message);
    res.write(`data: ${JSON.stringify({ chunk: fallback, done: true })}\n\n`);
    res.end();
  }

  req.on('close', () => {
    res.end();
  });
});

// Legacy non-streaming endpoint (kept for compatibility - now ML-powered)
app.post("/api/help/chat", async (req, res) => {
  const { message, context } = req.body;
  if (!message) return res.status(400).json({ error: 'No message' });
  
  try {
    // Try ML-powered response
    const pythonScript = path.join(__dirname, 'ml_chatbot.py');
    const args = [pythonScript, message];
    if (context) {
      args.push(JSON.stringify(context));
    }
    
    const python = spawn('/Users/bulumkamaseko/Desktop/miniconda3/bin/python', args);
    let response = '';
    let error = '';
    
    python.stdout.on('data', (data) => {
      response += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      // Ignore warnings, only log critical errors
      const errMsg = data.toString();
      if (!errMsg.includes('Warning:') && !errMsg.includes('UserWarning') && !errMsg.includes('FutureWarning')) {
        error += errMsg;
      }
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        console.error('ML Chatbot error:', error);
        return res.json({ reply: getFallbackChatResponse(message) });
      }
      
      // Parse the full response
      const lines = response.trim().split('\n');
      const words = [];
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.word) words.push(parsed.word);
          if (parsed.done) break;
        } catch (e) {
          // Skip invalid JSON lines
        }
      }
      res.json({ reply: words.join(' ') });
    });
    
    python.on('error', (err) => {
      console.error('Failed to start Python:', err);
      res.json({ reply: getFallbackChatResponse(message) });
    });
    
  } catch (err) {
    console.error('Chat error:', err);
    res.json({ reply: getFallbackChatResponse(message) });
  }
});
// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`iMark backend running at http://localhost:${PORT}`);
});
