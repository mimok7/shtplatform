import supabase from '@/lib/supabase';

type AdditionalFeeServiceType = 'cruise' | 'airport' | 'hotel' | 'rentcar' | 'tour' | 'sht' | 'vehicle';

interface SaveAdditionalFeeTemplateParams {
    serviceType: AdditionalFeeServiceType;
    detail?: string | null;
    amount?: number | null;
}

export async function saveAdditionalFeeTemplateFromInput({
    serviceType,
    detail,
    amount,
}: SaveAdditionalFeeTemplateParams): Promise<boolean> {
    const name = String(detail || '').trim();
    const normalizedAmount = Number(amount || 0);

    if (!name || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
        return false;
    }

    try {
        const { data: existing, error: existingError } = await supabase
            .from('additional_fee_template')
            .select('id, amount, is_active')
            .eq('service_type', serviceType)
            .eq('name', name)
            .limit(1)
            .maybeSingle();

        if (existingError) {
            console.warn('⚠️ 추가요금 템플릿 조회 실패:', existingError);
            return false;
        }

        if (existing) {
            const updatePayload: Record<string, any> = {};
            if (Number(existing.amount || 0) !== normalizedAmount) {
                updatePayload.amount = normalizedAmount;
            }
            if (existing.is_active === false) {
                updatePayload.is_active = true;
            }

            if (Object.keys(updatePayload).length === 0) {
                return true;
            }

            const { error: updateError } = await supabase
                .from('additional_fee_template')
                .update(updatePayload)
                .eq('id', existing.id);

            if (updateError) {
                console.warn('⚠️ 추가요금 템플릿 업데이트 실패:', updateError);
                return false;
            }

            return true;
        }

        const { error: insertError } = await supabase
            .from('additional_fee_template')
            .insert({
                name,
                amount: normalizedAmount,
                service_type: serviceType,
                description: null,
                sort_order: 9999,
                is_active: true,
            });

        if (insertError) {
            console.warn('⚠️ 추가요금 템플릿 등록 실패:', insertError);
            return false;
        }

        return true;
    } catch (error) {
        console.warn('⚠️ 추가요금 템플릿 자동 저장 예외:', error);
        return false;
    }
}
