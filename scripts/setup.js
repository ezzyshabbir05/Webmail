#!/usr/bin/env node

const { spawn } = require("child_process");
const os = require("os");
const path = require("path");

const isWindows = os.platform() === "win32";

const cmd = isWindows ? "powershell" : "bash";
const scriptFile = isWindows
  ? path.join(__dirname, "setup.ps1")
  : path.join(__dirname, "setup.sh");

const args = isWindows
  ? ["-ExecutionPolicy", "Bypass", "-File", scriptFile]
  : [scriptFile];

const proc = spawn(cmd, args, { stdio: "inherit" });

proc.on("exit", (code) => {
  process.exit(code || 0);
});

proc.on("error", (err) => {
  console.error("Failed to start setup script:", err.message);
  process.exit(1);
});
