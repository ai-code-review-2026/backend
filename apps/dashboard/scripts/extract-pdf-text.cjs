#!/usr/bin/env node

const fs = require("node:fs");
const { PDFParse } = require("pdf-parse");

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    process.stderr.write(JSON.stringify({ ok: false, error: "Missing PDF file path." }));
    process.exit(1);
    return;
  }

  try {
    const dataBuffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    process.stdout.write(
      JSON.stringify({
        ok: true,
        text: typeof result.text === "string" ? result.text : "",
      }),
    );
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        ok: false,
        error: error && typeof error.message === "string" ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      ok: false,
      error: error && typeof error.message === "string" ? error.message : String(error),
    }),
  );
  process.exit(1);
});