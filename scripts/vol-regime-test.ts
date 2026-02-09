const regimeNames = ["VeryLow", "Low", "Normal", "High", "Extreme"];
const regimeMultiplier = [50, 75, 100, 150, 250];

function simulateRegimeTransition() {
  console.log("Vol Regime Transition Test");
  console.log("==========================");
  console.log("");

  const baseSpread = 20;
  const vovSpread = 30;
  const maxSpread = 200;

  // Simulate vol moving from 20% to 80% (regime transitions)
  const volLevels = [
    { vol: 1000, regime: 0 },  // 10% → VeryLow
    { vol: 2000, regime: 1 },  // 20% → Low
    { vol: 3500, regime: 2 },  // 35% → Normal
    { vol: 5500, regime: 3 },  // 55% → High
    { vol: 8000, regime: 4 },  // 80% → Extreme
    { vol: 4000, regime: 2 },  // Back to 40% → Normal
    { vol: 1500, regime: 0 },  // Down to 15% → VeryLow
  ];

  for (const { vol, regime } of volLevels) {
    const volMark = vol * 1_000_000;
    const adjustedVov = Math.floor((vovSpread * regimeMultiplier[regime]) / 100);
    const totalSpread = Math.min(baseSpread + adjustedVov, maxSpread);
    const execPrice = Math.floor((volMark * (10_000 + totalSpread)) / 10_000);
    const spreadCost = execPrice - volMark;

    console.log(
      `  Vol: ${(vol / 100).toFixed(0)}% | Regime: ${regimeNames[regime].padEnd(8)} | ` +
      `Spread: ${totalSpread.toString().padStart(3)} bps | ` +
      `Mark: ${volMark.toLocaleString().padStart(16)} | ` +
      `Exec: ${execPrice.toLocaleString().padStart(16)} | ` +
      `Cost: ${spreadCost.toLocaleString().padStart(10)}`
    );
  }
}

simulateRegimeTransition();
