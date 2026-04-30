// partner_code → 썸네일 이미지 매핑
// (DB partner.thumbnail_url 미설정 시 fallback 으로 사용)

export const PARTNER_IMAGE_MAP: Record<string, string[]> = {
    'NHAMNHAM-HL-001':       ['/images/partners/nhamnham.gif'],
    'SOLCAFE-HL-001':        ['/images/partners/solcafe.gif'],
    'TAEYEONG-HN-WESTLAKE':  ['/images/partners/taeyeong.gif'],
    'TAEYEONG-HL-DELIVERY':  ['/images/partners/taeyeong.gif'],
    'MON-HL-NIGHTMKT':       ['/images/partners/mon.jpg'],
    'SERENE-HN-001':         ['/images/partners/serene.jpg'],
    'CUCCHI-HL-AOZAI':       ['/images/partners/cucchi.jpg'],
};

export function partnerImages(code?: string | null): string[] {
    return code && PARTNER_IMAGE_MAP[code] ? PARTNER_IMAGE_MAP[code] : [];
}

export function partnerThumbnail(code?: string | null): string | null {
    const arr = partnerImages(code);
    return arr.length > 0 ? arr[0] : null;
}
