function testComplianceScenarios() {
  console.log("JPY Matcher — Compliance Test Scenarios");
  console.log("========================================");
  console.log("");

  const scenarios = [
    { name: "JP Institutional", kyc: 3, jurisdiction: 2, blocked: 0x03, minKyc: 1, expectedResult: "PASS" },
    { name: "JP Basic", kyc: 0, jurisdiction: 2, blocked: 0x03, minKyc: 1, expectedResult: "FAIL (InsufficientKycLevel)" },
    { name: "SG Enhanced", kyc: 2, jurisdiction: 3, blocked: 0x03, minKyc: 1, expectedResult: "PASS" },
    { name: "US Standard", kyc: 1, jurisdiction: 0, blocked: 0x03, minKyc: 1, expectedResult: "FAIL (JurisdictionBlocked)" },
    { name: "Sanctioned Standard", kyc: 1, jurisdiction: 1, blocked: 0x03, minKyc: 1, expectedResult: "FAIL (JurisdictionBlocked)" },
    { name: "JP Enhanced (high min)", kyc: 2, jurisdiction: 2, blocked: 0x03, minKyc: 3, expectedResult: "FAIL (InsufficientKycLevel)" },
    { name: "EU Institutional", kyc: 3, jurisdiction: 4, blocked: 0x03, minKyc: 1, expectedResult: "PASS" },
  ];

  for (const s of scenarios) {
    const kycOk = s.kyc >= s.minKyc;
    const jurisdictionOk = s.jurisdiction >= 8 || ((s.blocked >> s.jurisdiction) & 1) === 0;
    const result = kycOk && jurisdictionOk ? "PASS" : "FAIL";
    const symbol = result === s.expectedResult.split(" ")[0] ? "\u2713" : "\u2717";
    console.log(
      `  ${symbol} ${s.name.padEnd(25)} KYC=${s.kyc} Jurisdiction=${s.jurisdiction} \u2192 ${result} (expected: ${s.expectedResult})`
    );
  }
}

testComplianceScenarios();
