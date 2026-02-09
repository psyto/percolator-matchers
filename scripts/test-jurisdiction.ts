function testJurisdictionBitmask() {
  console.log("JPY Matcher — Jurisdiction Bitmask Test");
  console.log("========================================");
  console.log("");

  const jurisdictions: Record<number, string> = {
    0: "US",
    1: "Sanctioned",
    2: "JP (Japan)",
    3: "SG (Singapore)",
    4: "EU",
    5: "UK",
    6: "Other-Regulated",
    7: "Other",
  };

  const masks = [
    { mask: 0x00, label: "None blocked" },
    { mask: 0x01, label: "US only" },
    { mask: 0x03, label: "US + Sanctioned" },
    { mask: 0x07, label: "US + Sanctioned + JP" },
    { mask: 0xFF, label: "All blocked" },
  ];

  for (const { mask, label } of masks) {
    console.log(`\n  Mask 0x${mask.toString(16).padStart(2, "0")} (${label}):`);
    for (let j = 0; j < 8; j++) {
      const blocked = ((mask >> j) & 1) === 1;
      const status = blocked ? "BLOCKED" : "ALLOWED";
      const symbol = blocked ? "\u2717" : "\u2713";
      console.log(`    ${symbol} ${jurisdictions[j]?.padEnd(18) || `Unknown(${j})`.padEnd(18)} ${status}`);
    }
  }
}

testJurisdictionBitmask();
