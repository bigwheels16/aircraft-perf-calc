import re

content = open('src/components/NomogramViewer.tsx').read()

# Replace altitude intersection calculation
old_alt = """        const y0_at_oatX = c0.points[0][1] + ((oatX - c0.points[0][0]) / (c0.points[1][0] - c0.points[0][0] || 1)) * (c0.points[1][1] - c0.points[0][1]);
        const y8_at_oatX = c8.points[0][1] + ((oatX - c8.points[0][0]) / (c8.points[1][0] - c8.points[0][0] || 1)) * (c8.points[1][1] - c8.points[0][1]);
        altY = y0_at_oatX + ((inputs.altitude - 0) / 8000) * (y8_at_oatX - y0_at_oatX);"""
new_alt = """        const y0_at_oatX = c0.points[0][1] + ((oatX - c0.points[0][0]) / (c0.points[1][0] - c0.points[0][0] || 1)) * (c0.points[1][1] - c0.points[0][1]);
        const y8_at_oatX = c8.points[0][1] + ((oatX - c8.points[0][0]) / (c8.points[1][0] - c8.points[0][0] || 1)) * (c8.points[1][1] - c8.points[0][1]);
        altY = y0_at_oatX - (inputs.altitude / 8000) * (y0_at_oatX - y8_at_oatX);"""
content = content.replace(old_alt, new_alt)

# Replace Weight line calculation
old_weight = """    // Step 4: Weight line
    let weightX = refX;
    let weightY = outY;
    if (weightCurves) {
      const w2500 = weightCurves.find((c: any) => c.value === 2500);
      const w2000 = weightCurves.find((c: any) => c.value === 2000);
      if (w2500 && w2000) {
        const dx = w2000.points[0][0] - w2500.points[0][0];
        const dv = w2000.value - w2500.value;
        weightX = w2500.points[0][0] + ((inputs.weight - w2500.value) / (dv || 1)) * dx;
      }
    }"""
new_weight = """    // Step 4: Weight line
    let weightX = 1027; // Zero Wind line
    const maxWeight = 2550; // standard max weight for PA28
    const weightFactor = inputs.weight / maxWeight;
    let weightY = altY + (1.0 - weightFactor) * (outAxis.p1[1] - altY);"""
content = content.replace(old_weight, new_weight)

open('src/components/NomogramViewer.tsx', 'w').write(content)
