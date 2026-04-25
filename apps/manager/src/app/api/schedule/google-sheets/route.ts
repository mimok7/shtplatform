import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// Google Sheets API 설정
const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

async function getGoogleSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            type: 'service_account',
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    return google.sheets({ version: 'v4', auth });
}

export async function GET(request: Request) {
    try {
        if (!spreadsheetId) {
            return NextResponse.json(
                { success: false, error: 'Google Sheets ID가 설정되지 않았습니다.' },
                { status: 500 }
            );
        }

        // URL에서 type 파라미터 가져오기
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'car'; // 기본값: car (차량)

        const sheets = await getGoogleSheetsClient();

        // 타입에 따라 시트 선택 (영문 시트명 사용)
        const sheetMapping: Record<string, string> = {
            'car': 'SH_C',        // 차량
            'cruise': 'SH_R',     // 크루즈
            'vehicle': 'SH_CC',   // 스하차량 (첫번째 SH_CC 정의)
            'sapa': 'SH_CC',      // 사파 (두번째 SH_CC 정의, 같은 시트)
            'airport': 'SH_P',    // 공항
            'hotel': 'SH_H',      // 호텔
            'tour': 'SH_T',       // 투어
            'rentcar': 'SH_RC',   // 렌트카
            'user': 'SH_M',       // 사용자
            'price': 'Price',     // 가격정보
        };

        let sheetName = sheetMapping[type] || 'SH_C'; // 기본: 차량

        try {
            const sheetInfo = await sheets.spreadsheets.get({
                spreadsheetId,
            });

            // 시트 이름 목록 출력 (디버깅)
            const sheetNames = sheetInfo.data.sheets?.map(s => s.properties?.title).filter(Boolean) || [];
            console.log('📋 사용 가능한 시트 목록:', sheetNames);

            // 요청한 시트가 없으면 첫 번째 시트 사용
            if (!sheetNames.includes(sheetName)) {
                console.log(`⚠️ ${sheetName} (${type}) 시트를 찾을 수 없습니다.`);
                sheetName = sheetNames[0] || 'Sheet1';
                console.log(`   → ${sheetName} 시트를 대신 사용합니다.`);
            } else {
                console.log(`✅ ${sheetName} (${type}) 시트를 사용합니다.`);
            }
        } catch (err) {
            console.warn('시트 정보 가져오기 실패, 기본 이름 사용:', err);
        }

        // 시트에서 데이터 읽기
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${sheetName}'!A2:U`, // 헤더 제외, 필요한 컬럼까지만 (요청사항은 SH_M에서 가져옴)
        });

        const rows = response.data.values;

        if (!rows || rows.length === 0) {
            return NextResponse.json({
                success: true,
                data: [],
                type,
                message: '데이터가 없습니다.',
            });
        }

        // SH_M (사용자) 시트에서 주문ID와 한글이름 + 영문이름 + 요청사항/특이사항/메모 매핑 데이터 로드
        let userNameMap: Record<string, string> = {};
        let userEnglishNameMap: Record<string, string> = {}; // 영문이름 매핑
        let userRequestMap: Record<string, string> = {}; // 요청사항/특이사항/메모 매핑
        try {
            const userResponse = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: "'SH_M'!A2:Z", // 모든 컬럼 로드 (요청사항/특이사항/메모 포함)
            });

            const userRows = userResponse.data.values || [];
            userRows.forEach((row) => {
                const orderId = row[0]; // A열: 주문ID
                const koreanName = row[3]; // D열: 한글이름
                const englishName = row[4]; // E열: 영문이름

                if (orderId && koreanName) {
                    userNameMap[orderId] = koreanName;
                }

                if (orderId && englishName) {
                    userEnglishNameMap[orderId] = englishName;
                }

                // 요청사항, 특이사항, 메모 수집 (컬럼 위치는 SH_M 시트 구조에 따라 조정 필요)
                // 임시로 뒤쪽 컬럼들을 확인 (실제 컬럼 위치는 시트 구조 확인 후 조정)
                const requestNotes = [];

                // 일반적으로 뒤쪽 컬럼에 위치 (예: V, W, X 또는 다른 위치)
                // 실제 시트에서 요청사항/특이사항/메모가 어느 컬럼인지 확인 필요
                if (row[21]) requestNotes.push(`요청사항: ${row[21]}`); // 예: V열
                if (row[22]) requestNotes.push(`특이사항: ${row[22]}`); // 예: W열
                if (row[23]) requestNotes.push(`메모: ${row[23]}`); // 예: X열

                if (orderId && requestNotes.length > 0) {
                    userRequestMap[orderId] = requestNotes.join(' / ');
                }
            });

            console.log(`📝 SH_M에서 ${Object.keys(userNameMap).length}개의 주문ID-이름 매핑 로드`);
            console.log(`📝 SH_M에서 ${Object.keys(userEnglishNameMap).length}개의 영문이름 매핑 로드`);
            console.log(`📝 SH_M에서 ${Object.keys(userRequestMap).length}개의 요청사항/특이사항/메모 로드`);
        } catch (err) {
            console.warn('⚠️ SH_M 시트 로드 실패, 이름 매핑 없이 진행:', err);
        }

        // SH_R (크루즈) 시트에서 주문ID와 크루즈명(C열) 매핑 데이터 로드
        let cruiseInfoMap: Record<string, string> = {};
        try {
            const cruiseResponse = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: "'SH_R'!A2:C", // A=ID, B=주문ID, C=크루즈
            });

            const cruiseRows = cruiseResponse.data.values || [];
            cruiseRows.forEach((row) => {
                const orderId = row[1]; // B열: 주문ID
                const cruiseName = row[2]; // C열: 크루즈

                if (orderId && cruiseName) {
                    cruiseInfoMap[orderId] = cruiseName;
                }
            });

            console.log(`🚢 SH_R에서 ${Object.keys(cruiseInfoMap).length}개의 주문ID-크루즈 매핑 로드`);
        } catch (err) {
            console.warn('⚠️ SH_R 시트 로드 실패, 크루즈 매핑 없이 진행:', err);
        }

        // SH_C (차량) 시트에서 주문ID와 승차/하차 위치 매핑 데이터 로드
        let carLocationMap: Record<string, { pickup: string; dropoff: string }> = {};
        try {
            const carResponse = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: "'SH_C'!A2:L", // A=ID, B=주문ID, ... K=승차, L=하차
            });

            const carRows = carResponse.data.values || [];
            carRows.forEach((row) => {
                const orderId = row[1]; // B열: 주문ID
                const pickupLocation = row[10]; // K열: 승차
                const dropoffLocation = row[11]; // L열: 하차

                if (orderId && (pickupLocation || dropoffLocation)) {
                    carLocationMap[orderId] = {
                        pickup: pickupLocation || '',
                        dropoff: dropoffLocation || ''
                    };
                }
            });

            console.log(`🚗 SH_C에서 ${Object.keys(carLocationMap).length}개의 주문ID-위치 매핑 로드`);
        } catch (err) {
            console.warn('⚠️ SH_C 시트 로드 실패, 위치 매핑 없이 진행:', err);
        }

        // 타입에 따라 데이터 파싱
        let reservations: any[] = [];

        if (type === 'cruise') {
            // SH_R 크루즈 데이터 파싱
            // A=ID, B=주문ID, C=크루즈, D=구분, E=객실종류, F=객실수, G=객실코드, H=일정일수, I=객실할인
            // J=체크인, K=시간, L=ADULT, M=CHILD, N=TODDLER, O=승선인원, P=인원수
            // Q=수정자, R=수정일시, S=승선도움, T=할인코드, U=객실비고
            reservations = rows
                .map((row) => {
                    if (!row[1]) return null; // 주문ID 없으면 건너뛰기

                    const orderId = row[1] || '';

                    return {
                        orderId, // B열: 주문ID
                        customerName: userNameMap[orderId] || '', // SH_M에서 조회한 한글이름
                        customerEnglishName: userEnglishNameMap[orderId] || '', // SH_M에서 조회한 영문이름
                        cruise: row[2] || '', // C열: 크루즈
                        category: row[3] || '', // D열: 구분
                        roomType: row[4] || '', // E열: 객실종류
                        roomCount: parseInt(row[5]) || 0, // F열: 객실수
                        roomCode: row[6] || '', // G열: 객실코드
                        days: parseInt(row[7]) || 0, // H열: 일정일수
                        discount: row[8] || '', // I열: 객실할인
                        checkin: row[9] || '', // J열: 체크인
                        time: row[10] || '', // K열: 시간
                        adult: parseInt(row[11]) || 0, // L열: ADULT
                        child: parseInt(row[12]) || 0, // M열: CHILD
                        toddler: parseInt(row[13]) || 0, // N열: TODDLER
                        boardingInfo: row[14] || '', // O열: 승선인원
                        totalGuests: parseInt(row[15]) || 0, // P열: 인원수
                        boardingHelp: row[18] || '', // S열: 승선도움
                        discountCode: row[19] || '', // T열: 할인코드
                        note: row[20] || '', // U열: 객실비고 (사용 안 함)
                        requestNote: userRequestMap[orderId] || '', // SH_M에서 조회한 요청사항/특이사항/메모
                    };
                })
                .filter(Boolean);
        } else if (type === 'vehicle') {
            // SH_CC 스하차량 데이터 파싱 (첫번째 구조)
            // A=ID, B=주문ID, C=승차일, D=구분, E=분류, F=차량번호, G=좌석번호, H=이름
            // I=수정자, J=수정일시, K=Email
            reservations = rows
                .map((row) => {
                    if (!row[1]) return null;

                    const orderId = row[1] || '';
                    const carLocation = carLocationMap[orderId] || { pickup: '', dropoff: '' };

                    // 첫번째 구조 판별: C열이 날짜 형식이고, F열에 차량번호가 있으면 vehicle
                    const isVehicleStructure = row[2] && row[5]; // C=승차일, F=차량번호

                    if (!isVehicleStructure) return null;

                    return {
                        orderId, // B열: 주문ID
                        customerName: userNameMap[orderId] || '',
                        customerEnglishName: userEnglishNameMap[orderId] || '',
                        cruiseInfo: cruiseInfoMap[orderId] || '', // SH_R에서 조회한 크루즈명 (C열)
                        boardingDate: row[2] || '', // C열: 승차일
                        serviceType: row[3] || '', // D열: 구분
                        category: row[4] || '', // E열: 분류
                        vehicleNumber: row[5] || '', // F열: 차량번호
                        seatNumber: row[6] || '', // G열: 좌석번호
                        name: row[7] || '', // H열: 이름
                        pickupLocation: carLocation.pickup || '', // SH_C K열
                        dropoffLocation: carLocation.dropoff || '', // SH_C L열
                        email: row[10] || '', // K열: Email
                    };
                })
                .filter(Boolean);
        } else if (type === 'sapa') {
            // SH_CC 사파 데이터 파싱 (두번째 구조)
            // A=ID, B=주문ID, C=구분, D=버스선택, E=분류, F=사파종류, G=인원수, H=좌석수
            // I=메모, J=사파코드, K=승차일자, L=승차시간, M=집결시간
            // N=수정자, O=수정일시, P=처리, Q=처리일시, R=금액, S=합계, T=Email
            reservations = rows
                .map((row) => {
                    if (!row[1]) return null;

                    const orderId = row[1] || '';

                    // 두번째 구조 판별: C열이 구분(텍스트)이고, F열에 사파종류가 있으면 sapa
                    const isSapaStructure = row[2] && row[5] && !row[2].match(/\d{4}-\d{2}-\d{2}/); // C열이 날짜가 아님

                    if (!isSapaStructure) return null;

                    return {
                        orderId, // B열: 주문ID
                        customerName: userNameMap[orderId] || '',
                        customerEnglishName: userEnglishNameMap[orderId] || '',
                        category: row[2] || '', // C열: 구분
                        busSelection: row[3] || '', // D열: 버스선택
                        classification: row[4] || '', // E열: 분류
                        sapaType: row[5] || '', // F열: 사파종류
                        participantCount: parseInt(row[6]) || 0, // G열: 인원수
                        seatCount: parseInt(row[7]) || 0, // H열: 좌석수
                        memo: row[8] || '', // I열: 메모
                        sapaCode: row[9] || '', // J열: 사파코드
                        boardingDate: row[10] || '', // K열: 승차일자
                        boardingTime: row[11] || '', // L열: 승차시간
                        gatheringTime: row[12] || '', // M열: 집결시간
                        unitPrice: parseFloat(String(row[17] || '0').replace(/[,\s]/g, '')) || 0, // R열: 금액
                        totalPrice: parseFloat(String(row[18] || '0').replace(/[,\s]/g, '')) || 0, // S열: 합계
                        email: row[19] || '', // T열: Email
                    };
                })
                .filter(Boolean);
        } else if (type === 'airport') {
            // SH_P 공항 데이터 파싱
            // A=ID, B=주문ID, C=구분, D=분류, E=경로, F=차량코드, G=차량종류, H=일자, I=시간, J=공항명, K=항공편
            // L=승차인원, M=캐리어수량, N=장소명, O=경유지, P=경유지대기시간, Q=차량수, V=금액, W=합계, X=Email
            reservations = rows
                .map((row) => {
                    if (!row[1]) return null;

                    const orderId = row[1] || '';
                    return {
                        orderId, // B열: 주문ID
                        customerName: userNameMap[orderId] || '',
                        customerEnglishName: userEnglishNameMap[orderId] || '',
                        tripType: row[2] || '', // C열: 구분
                        category: row[3] || '', // D열: 분류
                        route: row[4] || '', // E열: 경로
                        carCode: row[5] || '', // F열: 차량코드
                        carType: row[6] || '', // G열: 차량종류
                        date: row[7] || '', // H열: 일자
                        time: row[8] || '', // I열: 시간
                        airportName: row[9] || '', // J열: 공항명
                        flightNumber: row[10] || '', // K열: 항공편
                        passengerCount: parseInt(row[11]) || 0, // L열: 승차인원
                        carrierCount: parseInt(row[12]) || 0, // M열: 캐리어수량
                        placeName: row[13] || '', // N열: 장소명
                        stopover: row[14] || '', // O열: 경유지
                        carCount: parseInt(row[16]) || 0, // Q열: 차량수
                        unitPrice: parseFloat(String(row[21] || '0').replace(/[,\s]/g, '')) || 0, // V열: 금액
                        totalPrice: parseFloat(String(row[22] || '0').replace(/[,\s]/g, '')) || 0, // W열: 합계
                        email: row[23] || '', // X열: Email
                    };
                })
                .filter(Boolean);
        } else if (type === 'hotel') {
            // SH_H 호텔 데이터 파싱
            // A=ID, B=주문ID, C=호텔코드, D=호텔명, E=객실명, F=객실종류, G=객실수, H=일정, I=체크인날짜, J=체크아웃날짜
            // K=조식서비스, L=ADULT, M=CHILD, N=TOODLER, O=엑스트라베드, P=투숙인원, U=비고, W=금액, X=합계, Y=Email
            reservations = rows
                .map((row) => {
                    if (!row[1]) return null;

                    const orderId = row[1] || '';
                    return {
                        orderId, // B열: 주문ID
                        customerName: userNameMap[orderId] || '',
                        customerEnglishName: userEnglishNameMap[orderId] || '',
                        hotelCode: row[2] || '', // C열: 호텔코드
                        hotelName: row[3] || '', // D열: 호텔명
                        roomName: row[4] || '', // E열: 객실명
                        roomType: row[5] || '', // F열: 객실종류
                        roomCount: parseInt(row[6]) || 0, // G열: 객실수
                        days: parseInt(row[7]) || 0, // H열: 일정
                        checkinDate: row[8] || '', // I열: 체크인날짜
                        checkoutDate: row[9] || '', // J열: 체크아웃날짜
                        breakfastService: row[10] || '', // K열: 조식서비스
                        adult: parseInt(row[11]) || 0, // L열: ADULT
                        child: parseInt(row[12]) || 0, // M열: CHILD
                        toddler: parseInt(row[13]) || 0, // N열: TOODLER
                        extraBed: parseInt(row[14]) || 0, // O열: 엑스트라베드
                        totalGuests: parseInt(row[15]) || 0, // P열: 투숙인원
                        note: row[20] || '', // U열: 비고
                        unitPrice: parseFloat(String(row[22] || '0').replace(/[,\s]/g, '')) || 0, // W열: 금액
                        totalPrice: parseFloat(String(row[23] || '0').replace(/[,\s]/g, '')) || 0, // X열: 합계
                        email: row[24] || '', // Y열: Email
                    };
                })
                .filter(Boolean);
        } else if (type === 'tour') {
            // SH_T 투어 데이터 파싱
            // A=ID, B=주문ID, C=투어코드, D=투어명, E=투어종류, F=상세구분, G=수량, H=시작일자, I=종료일자
            // J=투어인원, K=배차, L=픽업위치, M=드랍위치, P=메모, S=금액, T=합계, U=Email, V=투어비고
            reservations = rows
                .map((row) => {
                    if (!row[1]) return null;

                    const orderId = row[1] || '';
                    return {
                        orderId, // B열: 주문ID
                        customerName: userNameMap[orderId] || '',
                        customerEnglishName: userEnglishNameMap[orderId] || '',
                        tourCode: row[2] || '', // C열: 투어코드
                        tourName: row[3] || '', // D열: 투어명
                        tourType: row[4] || '', // E열: 투어종류
                        detailCategory: row[5] || '', // F열: 상세구분
                        quantity: parseInt(row[6]) || 0, // G열: 수량
                        startDate: row[7] || '', // H열: 시작일자
                        endDate: row[8] || '', // I열: 종료일자
                        participants: parseInt(row[9]) || 0, // J열: 투어인원
                        dispatch: row[10] || '', // K열: 배차
                        pickupLocation: row[11] || '', // L열: 픽업위치
                        dropoffLocation: row[12] || '', // M열: 드랍위치
                        memo: row[15] || '', // P열: 메모
                        unitPrice: parseFloat(String(row[18] || '0').replace(/[,\s]/g, '')) || 0, // S열: 금액
                        totalPrice: parseFloat(String(row[19] || '0').replace(/[,\s]/g, '')) || 0, // T열: 합계
                        email: row[20] || '', // U열: Email
                        tourNote: row[21] || '', // V열: 투어비고
                    };
                })
                .filter(Boolean);
        } else if (type === 'rentcar') {
            // SH_RC 렌트카 데이터 파싱
            // A=ID, B=주문ID, C=차량코드, D=구분, E=분류, F=경로, G=차량종류, H=차량대수, I=승차일자, J=승차시간
            // K=승차장소, L=캐리어갯수, M=목적지, N=경유지, O=승차인원, P=사용기간, S=메모, V=금액, W=합계, X=Email
            reservations = rows
                .map((row) => {
                    if (!row[1]) return null;

                    const orderId = row[1] || '';
                    return {
                        orderId, // B열: 주문ID
                        customerName: userNameMap[orderId] || '',
                        customerEnglishName: userEnglishNameMap[orderId] || '',
                        carCode: row[2] || '', // C열: 차량코드
                        tripType: row[3] || '', // D열: 구분
                        category: row[4] || '', // E열: 분류
                        route: row[5] || '', // F열: 경로
                        carType: row[6] || '', // G열: 차량종류
                        carCount: parseInt(row[7]) || 0, // H열: 차량대수
                        pickupDate: row[8] || '', // I열: 승차일자
                        pickupTime: row[9] || '', // J열: 승차시간
                        pickupLocation: row[10] || '', // K열: 승차장소
                        carrierCount: parseInt(row[11]) || 0, // L열: 캐리어갯수
                        destination: row[12] || '', // M열: 목적지
                        stopover: row[13] || '', // N열: 경유지
                        passengerCount: parseInt(row[14]) || 0, // O열: 승차인원
                        usagePeriod: row[15] || '', // P열: 사용기간
                        memo: row[18] || '', // S열: 메모
                        unitPrice: parseFloat(String(row[21] || '0').replace(/[,\s]/g, '')) || 0, // V열: 금액
                        totalPrice: parseFloat(String(row[22] || '0').replace(/[,\s]/g, '')) || 0, // W열: 합계
                        email: row[23] || '', // X열: Email
                    };
                })
                .filter(Boolean);
        } else if (type === 'price') {
            // Price 가격정보 데이터 파싱
            // A=주문ID, B=견적일시, C=예약금, D=예약일시, E=중도금, F=중도일시, G=잔금, H=잔금일시
            // I=수기합계, J=총합계, K=전체합계, L=객실합계, M=차량합계, N=픽업합계, O=호텔합계
            // P=렌트합계, Q=투어합계, R=사파합계, S=메모
            reservations = rows
                .map((row) => {
                    if (!row[0]) return null; // 주문ID 없으면 건너뛰기

                    const orderId = row[0] || '';
                    return {
                        orderId, // A열: 주문ID
                        customerName: userNameMap[orderId] || '',
                        customerEnglishName: userEnglishNameMap[orderId] || '',
                        quoteDate: row[1] || '', // B열: 견적일시
                        deposit: parseFloat(String(row[2] || '0').replace(/[,\s]/g, '')) || 0, // C열: 예약금
                        depositDate: row[3] || '', // D열: 예약일시
                        midPayment: parseFloat(String(row[4] || '0').replace(/[,\s]/g, '')) || 0, // E열: 중도금
                        midPaymentDate: row[5] || '', // F열: 중도일시
                        finalPayment: parseFloat(String(row[6] || '0').replace(/[,\s]/g, '')) || 0, // G열: 잔금
                        finalPaymentDate: row[7] || '', // H열: 잔금일시
                        manualTotal: parseFloat(String(row[8] || '0').replace(/[,\s]/g, '')) || 0, // I열: 수기합계
                        subTotal: parseFloat(String(row[9] || '0').replace(/[,\s]/g, '')) || 0, // J열: 총합계
                        grandTotal: parseFloat(String(row[10] || '0').replace(/[,\s]/g, '')) || 0, // K열: 전체합계
                        roomTotal: parseFloat(String(row[11] || '0').replace(/[,\s]/g, '')) || 0, // L열: 객실합계
                        carTotal: parseFloat(String(row[12] || '0').replace(/[,\s]/g, '')) || 0, // M열: 차량합계
                        pickupTotal: parseFloat(String(row[13] || '0').replace(/[,\s]/g, '')) || 0, // N열: 픽업합계
                        hotelTotal: parseFloat(String(row[14] || '0').replace(/[,\s]/g, '')) || 0, // O열: 호텔합계
                        rentTotal: parseFloat(String(row[15] || '0').replace(/[,\s]/g, '')) || 0, // P열: 렌트합계
                        tourTotal: parseFloat(String(row[16] || '0').replace(/[,\s]/g, '')) || 0, // Q열: 투어합계
                        sapaTotal: parseFloat(String(row[17] || '0').replace(/[,\s]/g, '')) || 0, // R열: 사파합계
                        memo: row[18] || '', // S열: 메모
                    };
                })
                .filter(Boolean);
        } else if (type === 'user') {
            // SH_M 사용자 정보 데이터 파싱
            // A=주문ID, B=예약일, C=Email, D=한글이름, E=영문이름, F=닉네임, G=회원등급, H=이름
            // I=전화번호, J=만든사람, K=만든일시, L=환율, M=미환율, N=URL, O=요금제, P=결제방식
            // Q=요청사항, R=카톡ID, S=특이사항, T=생년월일, U=메모, V=할인금액, W=할인코드
            reservations = rows
                .map((row) => {
                    if (!row[0]) return null; // 주문ID 없으면 건너뛰기

                    return {
                        orderId: row[0] || '', // A열: 주문ID
                        reservationDate: row[1] || '', // B열: 예약일
                        email: row[2] || '', // C열: Email
                        koreanName: row[3] || '', // D열: 한글이름
                        englishName: row[4] || '', // E열: 영문이름
                        nickname: row[5] || '', // F열: 닉네임
                        memberLevel: row[6] || '', // G열: 회원등급
                        name: row[7] || '', // H열: 이름
                        phone: row[8] || '', // I열: 전화번호
                        creator: row[9] || '', // J열: 만든사람
                        createdAt: row[10] || '', // K열: 만든일시
                        exchangeRate: row[11] || '', // L열: 환율
                        usdRate: row[12] || '', // M열: 미환율
                        url: row[13] || '', // N열: URL
                        plan: row[14] || '', // O열: 요금제
                        paymentMethod: row[15] || '', // P열: 결제방식
                        requestNote: row[16] || '', // Q열: 요청사항
                        kakaoId: row[17] || '', // R열: 카톡ID
                        specialNote: row[18] || '', // S열: 특이사항
                        birthDate: row[19] || '', // T열: 생년월일
                        memo: row[20] || '', // U열: 메모
                        discountAmount: parseFloat(String(row[21] || '0').replace(/[,\s]/g, '')) || 0, // V열: 할인금액
                        discountCode: row[22] || '', // W열: 할인코드
                    };
                })
                .filter(Boolean);
        } else {
            // SH_C 차량 데이터 파싱 (기본)
            // 컬럼: B=주문ID, F=차량종류, G=차량코드, H=차량수, I=승차인원, J=승차일시, K=승차위치, L=하차위치, R=금액, S=합계, T=Email
            reservations = rows
                .map((row) => {
                    if (!row[1]) return null; // 주문ID 없으면 건너뛰기

                    const orderId = row[1] || '';
                    return {
                        orderId, // B열: 주문ID
                        customerName: userNameMap[orderId] || '', // SH_M에서 조회한 한글이름
                        customerEnglishName: userEnglishNameMap[orderId] || '', // SH_M에서 조회한 영문이름
                        carType: row[5] || '', // F열: 차량종류
                        carCode: row[6] || '', // G열: 차량코드
                        carCount: parseInt(row[7]) || 0, // H열: 차량수
                        passengerCount: parseInt(row[8]) || 0, // I열: 승차인원
                        pickupDatetime: row[9] || '', // J열: 승차일시
                        pickupLocation: row[10] || '', // K열: 승차위치
                        dropoffLocation: row[11] || '', // L열: 하차위치
                        unitPrice: parseFloat(String(row[17] || '0').replace(/[,\s]/g, '')) || 0, // R열: 금액
                        totalPrice: parseFloat(String(row[18] || '0').replace(/[,\s]/g, '')) || 0, // S열: 합계
                        email: row[19] || '', // T열: Email
                    };
                })
                .filter(Boolean);
        }

        console.log(`✅ Google Sheets ${sheetName} (${type}) 데이터 로드 성공: ${reservations.length}건`);

        return NextResponse.json({
            success: true,
            data: reservations,
            type,
            count: reservations.length,
        });
    } catch (error: any) {
        console.error('❌ Google Sheets 데이터 조회 실패:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Google Sheets 데이터를 불러오는 중 오류가 발생했습니다.',
            },
            { status: 500 }
        );
    }
}
