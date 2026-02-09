function simulateElection() {
  console.log("Event Matcher — Election Market Simulation");
  console.log("============================================");
  console.log("");
  console.log("Simulating: 'Will Candidate A win the election?'");
  console.log("");

  const baseSpread = 25;
  const edgeSpread = 60;
  const maxSpread = 400;

  // Simulate election night with signal detection
  const timeline = [
    { time: "6:00 PM", prob: 520_000, signal: 0, label: "Polls close — slight favorite" },
    { time: "7:00 PM", prob: 480_000, signal: 0, label: "Early returns — tightening" },
    { time: "8:00 PM", prob: 350_000, signal: 1, label: "Key state lost (LOW signal)" },
    { time: "9:00 PM", prob: 250_000, signal: 2, label: "Swing states going other way (HIGH)" },
    { time: "10:00 PM", prob: 150_000, signal: 3, label: "Major upset developing (CRITICAL)" },
    { time: "11:00 PM", prob: 80_000, signal: 2, label: "Narrow path remaining (HIGH)" },
    { time: "12:00 AM", prob: 30_000, signal: 1, label: "Nearly decided (LOW)" },
    { time: "1:00 AM", prob: 0, signal: 0, label: "RESOLVED: NO" },
  ];

  const signalLabels = ["NONE", "LOW", "HIGH", "CRITICAL"];
  const signalSpreads = [0, 10, 30, 75];

  for (const step of timeline) {
    const p = step.prob;
    const oneMinusP = 1_000_000 - p;
    const denom = (p * oneMinusP * 4) / 1_000_000_000_000;
    const edgeFactor = denom > 0
      ? Math.min(Math.floor(1_000_000 / denom), 10_000_000)
      : 10_000_000;
    const adjustedEdge = Math.floor((edgeSpread * edgeFactor) / 1_000_000);
    const signalAdj = signalSpreads[step.signal];
    const totalSpread = Math.min(baseSpread + adjustedEdge + signalAdj, maxSpread);

    console.log(
      `  ${step.time} | ${(step.prob / 10_000).toFixed(1).padStart(5)}% | ` +
      `Signal: ${signalLabels[step.signal].padEnd(8)} | ` +
      `Spread: ${totalSpread.toString().padStart(4)} bps | ` +
      `${step.label}`
    );
  }

  console.log("");
  console.log("Note how spreads widen dramatically near 0% due to edge spread,");
  console.log("and additional widening occurs during CRITICAL signal events.");
}

simulateElection();
