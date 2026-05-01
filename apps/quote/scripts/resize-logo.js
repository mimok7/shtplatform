#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
let pngToIco = require('png-to-ico');
if (pngToIco && typeof pngToIco !== 'function' && pngToIco.default) pngToIco = pngToIco.default;

const src = process.argv[2];
if (!src) {
    console.error('사용법: node scripts/resize-logo.js <원본_이미지_경로>');
    process.exit(1);
}

const srcPath = path.resolve(src);
if (!fs.existsSync(srcPath)) {
    console.error('파일을 찾을 수 없습니다:', srcPath);
    process.exit(1);
}

const outDir = path.resolve(__dirname, '..', 'public');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const logoOut = path.join(outDir, 'logo.png');
const logo160Out = path.join(outDir, 'logo-160.png');
const logo40Out = path.join(outDir, 'logo-40.png');
const faviconPng = path.join(outDir, 'favicon.png');
const faviconIco = path.join(outDir, 'favicon.ico');

(async () => {
    try {
        // 원본을 버퍼로 읽어서 처리 (입출력 파일이 같아도 덮어쓰기 가능)
        const srcBuffer = fs.readFileSync(srcPath);

        // 원본을 최대 너비 800px로 저장 (원본이 작으면 확대하지 않음)
        await sharp(srcBuffer)
            .resize({ width: 800, withoutEnlargement: true })
            .png({ quality: 90 })
            .toFile(logoOut);

        // 헤더에 사용할 소형 로고 (가로 160px)
        await sharp(srcBuffer)
            .resize({ width: 160, withoutEnlargement: true })
            .png({ quality: 90 })
            .toFile(logo160Out);

        // 작은 아이콘용 로고 (가로 40px)
        await sharp(srcBuffer)
            .resize({ width: 40, withoutEnlargement: true })
            .png({ quality: 90 })
            .toFile(logo40Out);

        // favicon (정사각형 32x32)
        await sharp(srcBuffer)
            .resize(32, 32, { fit: 'cover' })
            .png()
            .toFile(faviconPng);

        // favicon.ico 생성 (png-to-ico 사용)
        const icoBuf = await pngToIco(faviconPng);
        fs.writeFileSync(faviconIco, icoBuf);

        console.log('로고 생성 완료:');
        console.log(' -', logoOut);
        console.log(' -', logo160Out);
        console.log(' -', faviconPng);
        console.log(' -', faviconIco);
        process.exit(0);
    } catch (err) {
        console.error('로고 생성 중 오류:', err);
        process.exit(1);
    }
})();
