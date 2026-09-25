const { app, screen, desktopCapturer } = require('electron');

app.whenReady().then(async () => {
  console.log('=== MULTI-MONITOR & DPI COORDINATE VERIFICATION ===');
  
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();

  console.log(`Detected Display Count: ${displays.length}`);
  console.log(`Primary Display ID: ${primary.id}`);

  let minX = 0, minY = 0, maxX = 0, maxY = 0;

  displays.forEach((d, idx) => {
    console.log(`\n--- Monitor ${idx + 1} ---`);
    console.log(`  ID: ${d.id}`);
    console.log(`  Is Primary: ${d.id === primary.id}`);
    console.log(`  Logical Bounds: (${d.bounds.x}, ${d.bounds.y}) ${d.bounds.width}x${d.bounds.height}`);
    console.log(`  Work Area: (${d.workArea.x}, ${d.workArea.y}) ${d.workArea.width}x${d.workArea.height}`);
    console.log(`  Scale Factor (DPI): ${d.scaleFactor} (${Math.round(d.scaleFactor * 100)}% scaling, ${Math.round(d.scaleFactor * 96)} DPI)`);
    console.log(`  Physical Pixels: ${Math.round(d.bounds.width * d.scaleFactor)}x${Math.round(d.bounds.height * d.scaleFactor)} px`);

    minX = Math.min(minX, d.bounds.x);
    minY = Math.min(minY, d.bounds.y);
    maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
    maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
  });

  const virtualSpan = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };

  console.log('\n--- Multi-Monitor Virtual Desktop Unified Bounding Box ---');
  console.log(`  Origin: (${virtualSpan.x}, ${virtualSpan.y})`);
  console.log(`  Span Dimensions: ${virtualSpan.width}x${virtualSpan.height}`);

  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
  console.log(`\nCaptured Screen Sources from DWM: ${sources.length}`);
  sources.forEach((s, idx) => {
    console.log(`  Source ${idx + 1}: Name="${s.name}", ID="${s.id}"`);
  });

  console.log('\n=== MULTI-MONITOR VERIFICATION COMPLETE ===');
  app.quit();
});
