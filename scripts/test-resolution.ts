function simulateResolution() {
  console.log("Event Matcher — Resolution Simulation");
  console.log("======================================");
  console.log("");

  const baseSpread = 20;
  const edgeSpread = 50;
  const maxSpread = 500;

  // Simulate probability moving from 50% → 75% → 95% → 100% (resolution)
  const steps = [
    { prob: 500_000, label: "Initial: 50%" },
    { prob: 550_000, label: "Moves to 55%" },
    { prob: 650_000, label: "Moves to 65%" },
    { prob: 750_000, label: "Moves to 75%" },
    { prob: 850_000, label: "Moves to 85%" },
    { prob: 950_000, label: "Near resolution: 95%" },
    { prob: 990_000, label: "Almost certain: 99%" },
    { prob: 1_000_000, label: "RESOLVED: YES (100%)" },
  ];

  console.log("Probability journey with edge spread effects:");
  console.log("");

  for (const step of steps) {
    const p = step.prob;
    const oneMinusP = 1_000_000 - p;
    const denom = (p * oneMinusP * 4) / 1_000_000_000_000;
    const edgeFactor = denom > 0
      ? Math.min(Math.floor(1_000_000 / denom), 10_000_000)
      : 10_000_000;
    const adjustedEdge = Math.floor((edgeSpread * edgeFactor) / 1_000_000);
    const totalSpread = Math.min(baseSpread + adjustedEdge, maxSpread);

    console.log(
      `  ${step.label.padEnd(30)} | ` +
      `Edge factor: ${(edgeFactor / 1_000_000).toFixed(2).padStart(6)}x | ` +
      `Total spread: ${totalSpread.toString().padStart(4)} bps`
    );
  }

  // P&L for a long position from 50% to 100%
  console.log("");
  console.log("P&L for 1,000 unit LONG position entered at 50%:");
  const entryPrice = 500_000;
  const exitPrice = 1_000_000;
  const notional = 1_000;
  const pnl = (exitPrice - entryPrice) * notional;
  console.log(`  Entry: ${entryPrice / 10_000}%  Exit: ${exitPrice / 10_000}%`);
  console.log(`  P&L: ${pnl.toLocaleString()} (${pnl > 0 ? "PROFIT" : "LOSS"})`);
}

simulateResolution();
