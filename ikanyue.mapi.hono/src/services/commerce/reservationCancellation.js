const { invariant, deriveBatchStatus } = require('../courseCredits/domain');
const { balanceSnapshot } = require('../courseCredits/grantService');
const { create, update, versionClaim } = require('../courseCredits/reservationRequests');
const { id, escape, cancellationQuote, commerceUpdate } = require('./planning');

async function reservationQuote(repo, appointment, allocations, batches, at, institution) {
    const cash = allocations.filter((allocation) => batches.get(allocation.batchId)?.grantSnapshot?.commerceOrderId);
    if (!cash.length) return null;
    invariant(allocations.length === 1 && cash.length === 1 && cash[0].quantity === 1,
        'CASH_RESERVATION_ALLOCATION_INVALID', '预约金额分摊需要人工核对');
    const allocation = cash[0]; const batch = batches.get(allocation.batchId);
    const order = await repo.get('commerce_orders', batch.grantSnapshot.commerceOrderId);
    invariant(order.studentId === appointment.studentId && batch.studentId === appointment.studentId
        && order.status === 'completed' && order.data.policy.reservationRefund === 'cash'
        && order.data.grantResult.operationId === batch.sourceOperationId
        && order.data.grantResult.batches.some((item) => item.batchId === batch.id),
    'CASH_RESERVATION_SOURCE_MISMATCH', '预约课时来源需要核对');
    const line = order.data.allocations.find((item) => item.creditTypeId === batch.creditTypeId);
    invariant(line && line.quantity === batch.originalQuantity && batch.frozenQuantity >= 1,
        'CASH_RESERVATION_BALANCE_MISMATCH', '预约课时余额需要核对');
    // Each retired unit gets its original paid allocation, never the undiscounted list price.
    const paid = Math.floor(line.paidMinor / line.quantity);
    const quote = cancellationQuote(order.data.policy, appointment.requestedStartAt, at, paid, institution);
    invariant(quote.refundable <= order.data.amount - order.data.refunded - (order.data.refundReservedAmount || 0),
        'CASH_REFUND_PRINCIPAL_CONFLICT', '当前可退本金需要核对');
    return { ...quote, paid, quantity: 1, currency: 'CNY', order, batch, allocation, institution };
}

function cashCancellationPlan(quote, { appointment, student, input, command, idFactory }) {
    if (input.actorRole === 'student' || (input.actorRole === 'admin' && !quote.institution)) {
        invariant(input.expectedRefundAmount === quote.refundable && input.expectedFee === quote.fee,
            'CANCELLATION_QUOTE_CHANGED', '取消扣费或退款金额已变化，请重新确认');
    }
    const { batch, allocation, order } = quote;
    const next = { ...batch, frozenQuantity: batch.frozenQuantity - 1,
        reversedQuantity: (batch.reversedQuantity || 0) + 1, version: batch.version + 1 };
    next.status = deriveBatchStatus(next);
    const refundId = id('reservation-refund', appointment.id);
    const actor = { id: input.actorId, role: input.actorRole, reason: input.reason };
    const requests = [
        versionClaim(idFactory, 'credit_batch', batch.id, batch.version, command.operationId),
        update('credit_batches', batch.id, { frozenQuantity: next.frozenQuantity, reversedQuantity: next.reversedQuantity,
            status: next.status, version: next.version }),
        update('session_credit_allocations', allocation.id, { status: 'reversed' }),
        create('credit_events', { id: idFactory(), operationId: command.operationId, batchId: batch.id,
            studentId: batch.studentId, creditTypeId: batch.creditTypeId, eventType: 'REVERSE', quantityDelta: -1,
            bucketFrom: 'frozenQuantity', bucketTo: 'reversedQuantity', balanceSnapshot: balanceSnapshot(next),
            businessTime: command.at, actorId: input.actorId, reason: input.reason,
            metadata: { source: 'reservation_cash_cancellation', appointmentId: appointment.id,
                fee: quote.fee, refundAmount: quote.refundable, policyVersion: quote.policyVersion } }),
        versionClaim(idFactory, 'session_student', student.id, student.version, command.operationId),
        update('session_students', student.id, { creditStatus: 'reversed', settledAt: command.at, version: student.version + 1 }),
        ...commerceUpdate('commerce_orders', order, { data: { ...order.data,
            cancellationFees: (order.data.cancellationFees || 0) + quote.fee,
            refundPending: order.data.refundPending || quote.refundable > 0,
            pendingRefundCount: pendingCount(order.data) + (quote.refundable > 0 ? 1 : 0),
            refundReservedAmount: (order.data.refundReservedAmount || 0) + quote.refundable } }),
        create('commerce_audit', { id: id('cancel-audit', appointment.id), subjectId: order.id, actorId: input.actorId,
            action: 'reservation_cancelled', data: { reason: input.reason, appointmentId: appointment.id,
                fee: quote.fee, amount: quote.refundable, institution: quote.institution,
                policy: order.data.policy, receivedAt: quote.receivedAt, createdAt: command.at } }),
    ];
    if (quote.refundable > 0) requests.push(create('commerce_refunds', {
        id: refundId, orderId: order.id, studentId: order.studentId, status: 'processing', version: 1,
        data: { amount: quote.refundable, kind: 'reservation', appointmentId: appointment.id, gatewayId: '',
            held: [], actor, fee: quote.fee, createdAt: command.at, attempt: 0 },
    }));
    return { requests, refund: { amount: quote.refundable, fee: quote.fee, currency: 'CNY',
        refundId: quote.refundable > 0 ? refundId : null, status: quote.refundable > 0 ? 'processing' : 'not_due' } };
}

async function previewReservation(repo, studentId, appointmentId, clock = Date.now) {
    const appointment = await repo.get('appointment_requests', appointmentId);
    invariant(appointment.studentId === studentId, 'APPOINTMENT_STUDENT_FORBIDDEN', '不能查看其他学员的预约');
    invariant(['confirmed', 'rescheduled'].includes(appointment.status), 'APPOINTMENT_NOT_CANCELLABLE', '预约当前不能取消');
    const roster = await repo.list('session_students', { filter: `sessionId="${escape(appointment.sessionId)}"` });
    invariant(roster.length === 1 && roster[0].creditStatus === 'reserved', 'APPOINTMENT_ROSTER_INVALID', '预约课时当前不能取消');
    const allocations = await repo.list('session_credit_allocations', { filter: `sessionStudentId="${escape(roster[0].id)}" && status="reserved"` });
    const batches = new Map();
    for (const allocation of allocations) batches.set(allocation.batchId, await repo.get('credit_batches', allocation.batchId));
    const quote = await reservationQuote(repo, appointment, allocations, batches, new Date(clock()).toISOString(), false);
    return quote ? { mode: 'cash', amount: quote.refundable, fee: quote.fee, paid: quote.paid,
        currency: 'CNY', receivedAt: quote.receivedAt, policyVersion: quote.policyVersion, quantity: 1 }
        : { mode: 'credit', amount: 0, fee: 0, quantity: 1 };
}
function pendingCount(data) { return data.pendingRefundCount ?? (data.refundPending ? 1 : 0); }
module.exports = { reservationQuote, cashCancellationPlan, previewReservation, pendingCount };
