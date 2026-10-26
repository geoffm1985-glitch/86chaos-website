import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const releaseBase = 'https://github.com/geoffm1985-glitch/86chaos/releases/download/mobile-v18.0.6-preview';
const apkName = '86Chaos-18.0.6-android-preview.apk';
const checksumName = apkName + '.sha256';
const outputDir = path.resolve('public', 'downloads');
// The preview release is optional for the marketing site (its download pages redirect home). When the release is no
// longer publicly available the build continues without it; when it is available it is still fully verified.
const UNAVAILABLE = new Set([401, 403, 404]);

const request = (url) => fetch(url, {
  redirect: 'follow',
  headers: {
    'User-Agent': '86Chaos-Website-Build/1.0',
    'Accept': '*/*'
  }
});

const fetchOrThrow = async (url) => {
  const response = await request(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return response;
};

const checksumResponse = await request(`${releaseBase}/${checksumName}`);
if (UNAVAILABLE.has(checksumResponse.status)) {
  console.warn(`Skipped optional Android preview bundle: release is not publicly available (HTTP ${checksumResponse.status}).`);
} else {
  if (!checksumResponse.ok) throw new Error(`Failed to fetch ${releaseBase}/${checksumName}: HTTP ${checksumResponse.status}`);
  await mkdir(outputDir, { recursive: true });
  const checksumText = (await checksumResponse.text()).trim();
  const expected = checksumText.split(/\s+/)[0]?.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected || '')) {
    throw new Error('Invalid SHA-256 checksum metadata for Android preview.');
  }

  const apkResponse = await fetchOrThrow(`${releaseBase}/${apkName}`);
  const apkBuffer = Buffer.from(await apkResponse.arrayBuffer());

  if (apkBuffer.length < 10_000_000 || apkBuffer.length > 30_000_000) {
    throw new Error(`Unexpected Android preview size: ${apkBuffer.length} bytes`);
  }
  if (apkBuffer[0] !== 0x50 || apkBuffer[1] !== 0x4b) {
    throw new Error('Android preview is not a valid APK/ZIP payload.');
  }

  const actual = createHash('sha256').update(apkBuffer).digest('hex');
  if (actual !== expected) {
    throw new Error(`Android preview checksum mismatch. Expected ${expected}, got ${actual}`);
  }

  await writeFile(path.join(outputDir, apkName), apkBuffer);
  await writeFile(path.join(outputDir, checksumName), `${actual}  ${apkName}\n`, 'utf8');

  console.log(`Bundled verified Android preview: ${apkName} (${apkBuffer.length} bytes, sha256 ${actual})`);
}
