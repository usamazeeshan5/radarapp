// Custom MRMS GRIB2 parser for Reflectivity at Lowest Altitude
// This is a simplified parser specifically for MRMS data
// GRIB2 structure: https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/

export function parseMRMSGrib2(buffer) {
  let offset = 0;

  // Section 0: Indicator Section (16 bytes)
  const gribMagic = buffer.toString('utf8', offset, offset + 4);
  if (gribMagic !== 'GRIB') {
    throw new Error('Not a valid GRIB2 file');
  }

  const discipline = buffer.readUInt8(offset + 6);
  const edition = buffer.readUInt8(offset + 7);

  if (edition !== 2) {
    throw new Error(`GRIB edition ${edition} not supported`);
  }

  offset += 16;

  // Section 1: Identification Section
  const section1Length = buffer.readUInt32BE(offset);
  // Section 1 number not used but read for validation
  // const section1Number = buffer.readUInt8(offset + 4);

  // Extract timestamp info
  const year = buffer.readUInt16BE(offset + 12);
  const month = buffer.readUInt8(offset + 14);
  const day = buffer.readUInt8(offset + 15);
  const hour = buffer.readUInt8(offset + 16);
  const minute = buffer.readUInt8(offset + 17);
  const second = buffer.readUInt8(offset + 18);

  offset += section1Length;

  // Section 2: Local Use Section (optional)
  const section2Length = buffer.readUInt32BE(offset);
  const section2Number = buffer.readUInt8(offset + 4);
  if (section2Number === 2) {
    offset += section2Length;
  }

  // Section 3: Grid Definition Section
  const section3Length = buffer.readUInt32BE(offset);
  // Grid definition template number (not used but available for validation)
  // const gridDefTemplateNum = buffer.readUInt16BE(offset + 12);

  // Parse Lat/Lon grid (template 0)
  const nx = buffer.readUInt32BE(offset + 30); // Number of points along x-axis
  const ny = buffer.readUInt32BE(offset + 34); // Number of points along y-axis
  const la1 = buffer.readInt32BE(offset + 46) / 1e6; // Latitude of first point
  const lo1 = buffer.readInt32BE(offset + 50) / 1e6; // Longitude of first point
  const la2 = buffer.readInt32BE(offset + 55) / 1e6; // Latitude of last point
  const lo2 = buffer.readInt32BE(offset + 59) / 1e6; // Longitude of last point
  const dx = buffer.readUInt32BE(offset + 63) / 1e6; // i-direction increment
  const dy = buffer.readUInt32BE(offset + 67) / 1e6; // j-direction increment

  offset += section3Length;

  // Section 4: Product Definition Section
  const section4Length = buffer.readUInt32BE(offset);
  // Product definition template number (MRMS-specific, not validated)
  // const productDefTemplateNum = buffer.readUInt16BE(offset + 7);

  // We'll skip detailed parsing of product definition since it's MRMS-specific
  offset += section4Length;

  // Section 5: Data Representation Section
  const section5Length = buffer.readUInt32BE(offset);
  const numberOfDataPoints = buffer.readUInt32BE(offset + 5);
  // Data representation template number (not validated, assuming simple packing)
  // const dataRepTemplateNum = buffer.readUInt16BE(offset + 9);

  // For simple packing (template 0)
  const referenceValue = buffer.readFloatBE(offset + 11);
  const binaryScaleFactor = buffer.readInt16BE(offset + 15);
  const decimalScaleFactor = buffer.readInt16BE(offset + 17);
  const numberOfBits = buffer.readUInt8(offset + 19);

  offset += section5Length;

  // Section 6: Bit Map Section
  const section6Length = buffer.readUInt32BE(offset);
  const bitMapIndicator = buffer.readUInt8(offset + 5);

  let bitMap = null;
  if (bitMapIndicator === 0) {
    // Bit map is present
    bitMap = buffer.slice(offset + 6, offset + section6Length);
  }

  offset += section6Length;

  // Section 7: Data Section
  const section7Length = buffer.readUInt32BE(offset);
  const dataOffset = offset + 5;
  const dataBuffer = buffer.slice(dataOffset, offset + section7Length);

  // Decode the data values
  const values = decodeData(
    dataBuffer,
    bitMap,
    numberOfDataPoints,
    numberOfBits,
    referenceValue,
    binaryScaleFactor,
    decimalScaleFactor
  );

  return {
    discipline,
    timestamp: new Date(Date.UTC(year, month - 1, day, hour, minute, second)),
    nx,
    ny,
    la1,
    lo1,
    la2,
    lo2,
    dx,
    dy,
    values,
    numberOfDataPoints
  };
}

function decodeData(
  dataBuffer,
  bitMap,
  numberOfDataPoints,
  numberOfBits,
  referenceValue,
  binaryScaleFactor,
  decimalScaleFactor
) {
  const values = new Float32Array(numberOfDataPoints);

  // Calculate scaling factors
  const binaryScale = Math.pow(2, binaryScaleFactor);
  const decimalScale = Math.pow(10, -decimalScaleFactor);

  if (numberOfBits === 0) {
    // All values are the reference value
    values.fill(referenceValue);
    return values;
  }

  let bitPos = 0;

  for (let i = 0; i < numberOfDataPoints; i++) {
    // Check bit map if present
    if (bitMap) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = 7 - (i % 8);
      const isMasked = (bitMap[byteIndex] >> bitIndex) & 1;

      if (isMasked === 0) {
        values[i] = NaN; // Missing value
        continue;
      }
    }

    // Read the packed value
    const packedValue = readBits(dataBuffer, bitPos, numberOfBits);
    bitPos += numberOfBits;

    // Apply the formula: Y = (R + X × 2^E) × 10^(-D)
    // where Y = final value, R = reference, X = packed value, E = binary scale, D = decimal scale
    values[i] = (referenceValue + packedValue * binaryScale) * decimalScale;
  }

  return values;
}

function readBits(buffer, bitOffset, numBits) {
  let value = 0;

  for (let i = 0; i < numBits; i++) {
    const byteIndex = Math.floor((bitOffset + i) / 8);
    const bitIndex = 7 - ((bitOffset + i) % 8);
    const bit = (buffer[byteIndex] >> bitIndex) & 1;
    value = (value << 1) | bit;
  }

  return value;
}
