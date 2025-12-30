/**
 * Version Generation Script
 * 
 * Generates a version.json file in the public folder at build time.
 * This file is used by the client to detect when a new version is available.
 * 
 * Run during build: node scripts/generate-version.js
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

function getGitCommitHash() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

function generateVersion() {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  
  const now = new Date();
  const buildId = crypto.randomBytes(8).toString("hex");
  const commitHash = getGitCommitHash();
  
  const versionInfo = {
    version: packageJson.version || "0.0.0",
    buildId: buildId,
    buildTime: now.toISOString(),
    ...(commitHash && { commitHash }),
  };

  const publicDir = path.join(process.cwd(), "public");
  const versionFilePath = path.join(publicDir, "version.json");
  
  // Ensure public directory exists
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  fs.writeFileSync(versionFilePath, JSON.stringify(versionInfo, null, 2));
  
  console.log("✓ Generated version.json:");
  console.log(`  Version: ${versionInfo.version}`);
  console.log(`  Build ID: ${versionInfo.buildId}`);
  console.log(`  Build Time: ${versionInfo.buildTime}`);
  if (commitHash) {
    console.log(`  Commit: ${commitHash}`);
  }
}

generateVersion();





