export async function cancelQuoteApproval(_quoteId: string, managerId?: string, reason?: string) {
  console.log('[mock] cancelQuoteApproval', { _quoteId, managerId, reason });
  // 실제 구현에서는 DB 트랜잭션으로 상태를 변경하고 로그를 남깁니다.
  return { success: true, message: '승인 취소 처리됨' };
}

export async function reapproveQuote(_quoteId: string, managerId?: string) {
  console.log('[mock] reapproveQuote', { _quoteId, managerId });
  // 실제 구현에서는 승인 처리 및 알림을 수행합니다.
  return { success: true, message: '승인 처리됨' };
}

const _default = { cancelQuoteApproval, reapproveQuote };
export default _default;
